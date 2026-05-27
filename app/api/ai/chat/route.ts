import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAnthropicClient, getNvidiaClient, getGeminiClient, MODEL_CLAUDE, MODEL_MINIMAX, MODEL_GEMINI } from '@/lib/ai/client'
import { buildAdjustPrompt, buildAdjustPromptMinimax, buildConsultPrompt } from '@/lib/ai/systemPrompt'
import { extractPlans, stripPlansTag } from '@/lib/ai/patchParser'
import type { Itinerary } from '@/lib/types/itinerary'
import type { AIPlan } from '@/lib/types/patch'
import type { ModelProvider } from '@/lib/ai/client'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('未登入', { status: 401 })
  }

  const body = await request.json()
  const {
    itineraryId, threadId, userMessage,
    mode = 'adjust',
    modelProvider = 'claude',
  } = body as {
    itineraryId: string
    threadId: string
    userMessage: string
    mode?: 'adjust' | 'consult'
    modelProvider?: ModelProvider
  }

  if (!itineraryId || !threadId || !userMessage?.trim()) {
    return new Response('缺少必要欄位', { status: 400 })
  }

  // Use service role client for all DB operations (RLS bypassed; user already verified above)
  const db = createServiceRoleClient()

  // Check permissions (must be editor or owner)
  const { data: member } = await db
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', itineraryId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return new Response('無修改權限', { status: 403 })
  }

  // Load itinerary + version
  const { data: row } = await db
    .from('itineraries')
    .select('data, version')
    .eq('id', itineraryId)
    .single()

  if (!row) {
    return new Response('找不到行程', { status: 404 })
  }

  const itinerary = row.data as Itinerary

  // Determine how many plan options to request based on the scope of changes
  // Count unique days mentioned to avoid token overflow with too many plans
  function estimateAffectedDays(msg: string, totalDays: number): number {
    // Count all unique day numbers mentioned: 第1天, 第2天, etc.
    const dayMentions = (msg.match(/第\s*(\d+)\s*天/g) ?? [])
    const uniqueDayNums = new Set(dayMentions.map(d => d.replace(/[^0-9]/g, '')))
    if (uniqueDayNums.size > 0) return uniqueDayNums.size
    // Keywords suggesting full restructure
    if (/全部|整個|所有|重新規劃|大改/.test(msg)) return totalDays
    return 1 // default: small change
  }

  const totalDays = itinerary.days?.length ?? 1
  const affectedDays = estimateAffectedDays(userMessage, totalDays)
  const numPlans: 1 | 2 | 3 = affectedDays >= 5 ? 1 : affectedDays >= 3 ? 2 : 3

  console.log(`[chat] affectedDays: ${affectedDays}, numPlans: ${numPlans}`)

  // Load recent messages for context (keep short to avoid token overflow with large itineraries)
  const historyLimit = affectedDays >= 4 ? 6 : 14
  const { data: history } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(historyLimit)
    .then((r: { data: { role: string; content: string }[] | null; error: unknown }) => ({ ...r, data: r.data?.reverse() }))

  // Save the user message immediately
  await db
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role: 'user',
      content: userMessage,
    })

  // Build system prompt based on mode and model
  const systemPrompt = mode === 'consult'
    ? buildConsultPrompt(itinerary)
    : modelProvider === 'minimax'
      ? buildAdjustPromptMinimax(itinerary)
      : buildAdjustPrompt(itinerary, numPlans)  // Claude & Gemini share same prompt

  const historyMessages = (history ?? []).map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  let fullResponse = ''

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      try {
        if (modelProvider === 'minimax') {
          // ── MiniMax via NVIDIA OpenAI-compatible endpoint ──────────────────
          const nvidia = getNvidiaClient()
          const openaiStream = await nvidia.chat.completions.create({
            model: MODEL_MINIMAX,
            messages: [
              { role: 'system', content: systemPrompt },
              ...historyMessages,
              { role: 'user', content: userMessage },
            ],
            temperature: 1,
            top_p: 0.95,
            max_tokens: 8192,
            stream: true,
          })

          for await (const chunk of openaiStream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
              fullResponse += delta
              controller.enqueue(enc.encode(delta))
            }
          }
        } else if (modelProvider === 'gemini') {
          // ── Gemini via Google Generative AI SDK ───────────────────────────
          const gemini = getGeminiClient()
          const model = gemini.getGenerativeModel({
            model: MODEL_GEMINI,
            systemInstruction: systemPrompt,
          })

          // Gemini 的 history 格式：role 用 'user' / 'model'
          const geminiHistory = historyMessages.map((m: { role: string; content: string }) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))

          const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 8192 },
          })

          const result = await chat.sendMessageStream(userMessage)
          for await (const chunk of result.stream) {
            const delta = chunk.text()
            if (delta) {
              fullResponse += delta
              controller.enqueue(enc.encode(delta))
            }
          }
        } else {
          // ── Claude via Anthropic SDK ───────────────────────────────────────
          const anthropic = getAnthropicClient()
          const claudeStream = anthropic.messages.stream({
            model: MODEL_CLAUDE,
            max_tokens: 16000,
            system: systemPrompt,
            messages: [
              ...historyMessages,
              { role: 'user', content: userMessage },
            ],
          })

          for await (const event of claudeStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              fullResponse += event.delta.text
              controller.enqueue(enc.encode(event.delta.text))
            }
          }
        }
      } catch (err) {
        console.error('[chat] Stream error:', err)
        controller.enqueue(enc.encode('\n\n[發生錯誤，請再試一次]'))
      }

      // After stream ends: parse plans (adjust mode) or just save (consult mode)
      console.log('[chat] fullResponse length:', fullResponse.length,
        '| has <plans>:', fullResponse.includes('<plans>'),
        '| has </plans>:', fullResponse.includes('</plans>'),
        '| tail:', fullResponse.slice(-200))

      let plans: AIPlan[] | null = null
      let patchStatus = 'none'

      if (mode === 'adjust') {
        plans = extractPlans(fullResponse)
        if (plans && plans.length > 0) {
          patchStatus = 'pending_selection'
        }
      }

      // Display text = strip <plans> tags
      const displayText = stripPlansTag(fullResponse)

      // Save assistant message
      await db.from('chat_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: displayText,
        patch: plans ? plans : null,
        patch_status: patchStatus,
      })

      // Append a marker so the client knows the stream is done
      controller.enqueue(
        enc.encode(`\n\n__DONE__${JSON.stringify({ mode, plans })}`)
      )
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
