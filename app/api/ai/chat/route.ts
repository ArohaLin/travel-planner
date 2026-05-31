import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAnthropicClient, getNvidiaClient, getGeminiClient, MODEL_CLAUDE, MODEL_MINIMAX, MODEL_GEMINI } from '@/lib/ai/client'
import { buildAdjustPrompt, buildAdjustPromptMinimax, buildAdjustPromptGemini, buildConsultPrompt } from '@/lib/ai/systemPrompt'
import { extractPlans, stripPlansTag } from '@/lib/ai/patchParser'
import { logAIConversation } from '@/lib/ai/logger'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import type { Itinerary } from '@/lib/types/itinerary'
import type { AIPlan } from '@/lib/types/patch'
import type { ModelProvider } from '@/lib/ai/client'

// ── 歷史記錄限制 ─────────────────────────────────────────────────────────────
// 從 DB 最多載入幾則（粗略上限）
const HISTORY_LIMIT = 12

// 送給 AI 的 history 字元上限（依模型，避免超過 context window）
// 1 中文字 ≈ 1.5 token；為 system prompt + 回覆保留充分空間
const MAX_HISTORY_CHARS: Record<ModelProvider, number> = {
  claude:   30000,  // Claude 200k context，非常寬裕
  gemini:   30000,  // Gemini 1M context，非常寬裕
  minimax:   6000,  // MiniMax 32k tokens，保守限制
}

export async function POST(request: Request) {
  const startTs = Date.now()

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

  // Load recent messages for context
  const { data: historyRaw } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
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

  // Build system prompt based on mode and model (always 1 plan for adjust mode)
  const systemPrompt = mode === 'consult'
    ? buildConsultPrompt(itinerary)
    : modelProvider === 'minimax'
      ? buildAdjustPromptMinimax(itinerary)
      : modelProvider === 'gemini'
        ? buildAdjustPromptGemini(itinerary)
        : buildAdjustPrompt(itinerary)

  // ── Context-window-aware history trimming ─────────────────────────────────
  // 將 raw history 轉為 messages，再依字元預算從最新往最舊篩選
  const allHistory = (historyRaw ?? []).map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content ?? '',
  }))

  const historyCharLimit = MAX_HISTORY_CHARS[modelProvider] ?? 10000
  let usedHistoryChars = 0
  const historyMessages = [...allHistory].reverse().filter(m => {
    const len = m.content.length
    if (usedHistoryChars + len > historyCharLimit) return false
    usedHistoryChars += len
    return true
  }).reverse()

  console.log(
    `[chat] model=${modelProvider} mode=${mode}`,
    `| history: ${allHistory.length} msgs → trimmed to ${historyMessages.length}`,
    `| historyChars=${usedHistoryChars}/${historyCharLimit}`,
  )

  let fullResponse = ''

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      let streamError: string | undefined
      let closed = false
      // 安全 enqueue：client 斷線後 controller 已關閉，避免拋 ERR_INVALID_STATE
      const safeEnqueue = (s: string) => {
        if (closed) return
        try { controller.enqueue(enc.encode(s)) } catch { closed = true }
      }

      try {
        if (isLocalAI()) {
          // ── 本機測試模式：用 claude -p 取代 API（不計費，非串流）──────────
          // 本機模式不傳歷史（claude -p 是單次生成，歷史會讓 prompt 過大導致逾時）
          const text = await runLocalClaude({
            systemPrompt,
            history: [],
            userMessage,
          })
          fullResponse = text
          safeEnqueue(text)
        } else if (modelProvider === 'minimax') {
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
            const choice = chunk.choices[0]
            // MiniMax M2.7 是推理模型，最終回答在 content；思考過程在 reasoning_content（不輸出）
            const delta = choice?.delta?.content
              ?? (choice?.delta as Record<string, unknown>)?.reasoning_content as string | undefined
            if (delta) {
              fullResponse += delta
              safeEnqueue(delta)
            }
          }
        } else if (modelProvider === 'gemini') {
          // ── Gemini via Google Generative AI SDK ───────────────────────────
          const gemini = getGeminiClient()
          const model = gemini.getGenerativeModel({
            model: MODEL_GEMINI,
            systemInstruction: systemPrompt,
          })

          // Gemini history 必須嚴格交替 user/model，且第一筆必須是 user、最後一筆必須是 model
          type GeminiRole = 'user' | 'model'
          type GeminiMsg = { role: GeminiRole; parts: { text: string }[] }

          const mergedHistory: GeminiMsg[] = []
          for (const m of historyMessages) {
            const role: GeminiRole = m.role === 'assistant' ? 'model' : 'user'
            const text = m.content || '...'
            const last = mergedHistory[mergedHistory.length - 1]
            if (last && last.role === role) {
              // 合併連續相同 role 的訊息
              last.parts[0].text += '\n' + text
            } else {
              mergedHistory.push({ role, parts: [{ text }] })
            }
          }

          // 第一筆必須是 user；最後一筆必須是 model（否則移除）
          const geminiHistory = mergedHistory
            .filter((_, i) => i === 0 ? mergedHistory[0].role === 'user' : true)
            .filter((m, i, arr) => i < arr.length - 1 || m.role === 'model')

          console.log('[chat] Gemini history length:', geminiHistory.length,
            '| roles:', geminiHistory.map(m => m.role).join(','))

          const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 32768 },
          })

          const result = await chat.sendMessageStream(userMessage)
          for await (const chunk of result.stream) {
            const delta = chunk.text()
            if (delta) {
              fullResponse += delta
              safeEnqueue(delta)
            }
          }
          console.log('[chat] Gemini fullResponse length:', fullResponse.length,
            '| has <plans>:', fullResponse.includes('<plans>'),
            '| first 200:', fullResponse.slice(0, 200))
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
              safeEnqueue(event.delta.text)
            }
          }
        }
      } catch (err) {
        console.error('[chat] Stream error:', err)
        streamError = String(err)
        safeEnqueue('\n\n[發生錯誤，請再試一次]')
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

      // 若 fullResponse 為空（模型沒有回應），給予提示訊息
      if (!fullResponse.trim()) {
        fullResponse = mode === 'adjust'
          ? '[AI 未回應，請再試一次或切換其他模型]'
          : '[AI 未回應，請再試一次]'
        safeEnqueue(fullResponse)
      }

      let displayText = stripPlansTag(fullResponse)

      // 若 adjust 模式下 displayText 為空但有 plans，補上提示文字
      if (!displayText && mode === 'adjust') {
        displayText = '已根據您的需求生成調整方案，請確認是否套用。'
      }

      // ── 寫入 AI 對話 log ────────────────────────────────────────────────────
      logAIConversation({
        timestamp: new Date().toISOString(),
        mode,
        modelProvider,
        itineraryId,
        systemPromptBytes: systemPrompt.length,
        historyCount: historyMessages.length,
        historyChars: usedHistoryChars,
        userMessage,
        fullResponse,
        parsedPlans: !!(plans && plans.length > 0),
        planCount: plans?.length ?? 0,
        durationMs: Date.now() - startTs,
        error: streamError,
      })

      // Save assistant message
      await db.from('chat_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: displayText,
        patch: plans ? plans : null,
        patch_status: patchStatus,
      })

      // Append a marker so the client knows the stream is done
      safeEnqueue(`\n\n__DONE__${JSON.stringify({ mode, plans })}`)
      if (!closed) {
        try { controller.close() } catch { /* already closed */ }
      }
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
