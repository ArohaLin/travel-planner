import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAnthropicClient, getNvidiaClient, getGeminiClient, MODEL_CLAUDE, MODEL_MINIMAX, MODEL_GEMINI } from '@/lib/ai/client'
import { buildGeneratePrompt } from '@/lib/ai/systemPrompt'
import { extractItinerary } from '@/lib/ai/patchParser'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import { MODEL_PRICING, computeCostUSD, usdToTwd, classifyError, type AIUsage, type AIResultInfo } from '@/lib/ai/pricing'
import type { ModelProvider } from '@/lib/ai/client'

export async function POST(request: Request) {
  // Auth check with session-aware client
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  // Use service role for DB writes (bypasses RLS — user already verified above)
  const db = createServiceRoleClient()

  const body = await request.json()
  const {
    destination, originCity, startDate, endDate, totalDays,
    travelers, currency, style, totalBudget, specialRequests,
    // New optional fields
    tripTitle, returnCity, transitCities, preferredTransport, memberProfiles,
    // Model selection
    modelProvider = 'claude',
  } = body as {
    destination: string
    originCity: string
    startDate: string
    endDate: string
    totalDays: number
    travelers: number
    currency: string
    style?: string[]
    totalBudget?: number
    specialRequests?: string
    tripTitle?: string
    returnCity?: string
    transitCities?: string[]
    preferredTransport?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memberProfiles?: any[]
    modelProvider?: ModelProvider
  }

  if (!destination || !originCity || !startDate || !endDate || !totalDays || !travelers || !currency) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const prompt = buildGeneratePrompt({
    destination, originCity, startDate, endDate, totalDays,
    travelers, currency, style: style ?? [], totalBudget, specialRequests,
    tripTitle, returnCity, transitCities, preferredTransport, memberProfiles,
  })


  const startTs = Date.now()
  let usage: AIUsage | null = null

  try {
    let text = ''

    if (isLocalAI()) {
      // ── 本機測試模式：用 claude -p 取代 API（不計費）──────────────────────
      text = await runLocalClaude({ systemPrompt: prompt, userMessage: '請依上述規格輸出完整行程 JSON。' })
      console.log('[generate] LOCAL_AI text_len:', text.length)
    } else if (modelProvider === 'minimax') {
      // ── MiniMax via NVIDIA OpenAI-compatible endpoint (streaming to avoid timeout) ──
      const nvidia = getNvidiaClient()
      const stream = await nvidia.chat.completions.create({
        model: MODEL_MINIMAX,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
        top_p: 0.95,
        max_tokens: 32768,
        stream: true,
        stream_options: { include_usage: true },
      })
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        // MiniMax M2.7：reasoning_content 是思考過程，實際回答在 content
        if (delta) text += delta
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          }
        }
      }
    } else if (modelProvider === 'gemini') {
      // ── Gemini via Google Generative AI SDK ──────────────────────────────
      const gemini = getGeminiClient()
      const model = gemini.getGenerativeModel({
        model: MODEL_GEMINI,
        // 詳情欄位（intro/transport/recommendation/tips）讓輸出變長，需提高上限避免 JSON 被截斷
        generationConfig: { maxOutputTokens: 32768 },
      })
      const result = await model.generateContentStream(prompt)
      for await (const chunk of result.stream) {
        const delta = chunk.text()
        if (delta) text += delta
      }
      const gemResp = await result.response
      const um = gemResp.usageMetadata
      if (um) {
        usage = {
          inputTokens: um.promptTokenCount ?? 0,
          outputTokens: um.candidatesTokenCount ?? 0,
          totalTokens: um.totalTokenCount ?? 0,
        }
      }
      console.log('[generate] Gemini text_len:', text.length)
    } else {
      // ── Claude via Anthropic SDK ─────────────────────────────────────────
      const anthropic = getAnthropicClient()
      const message = await anthropic.messages.create({
        model: MODEL_CLAUDE,
        max_tokens: 32000,
        messages: [{ role: 'user', content: prompt }],
      })
      text = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
      if (message.usage) {
        usage = {
          inputTokens: message.usage.input_tokens ?? 0,
          outputTokens: message.usage.output_tokens ?? 0,
          totalTokens: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
        }
      }

      console.log('[generate] Claude stop_reason:', (message as { stop_reason?: string }).stop_reason, 'text_len:', text.length)
    }

    console.log('[generate] model:', modelProvider, 'text_len:', text.length)
    if (modelProvider === 'minimax') {
      console.log('[generate] MiniMax raw text (first 1000):', text.slice(0, 1000))
    }

    // 組裝 AI 回傳資訊（成功情境）
    const costUSD = computeCostUSD(modelProvider, usage)
    const buildInfo = (success: boolean, errorCode: string | null, errorMeaning: string | null): AIResultInfo => ({
      timestamp: new Date().toISOString(),
      scene: 'generate',
      provider: isLocalAI() ? 'local' : modelProvider,
      model: isLocalAI() ? 'claude -p（本機訂閱制）' : MODEL_PRICING[modelProvider].label,
      success,
      errorCode,
      errorMeaning,
      usage,
      costUSD: success ? costUSD : null,
      costTWD: success ? usdToTwd(costUSD) : null,
      durationMs: Date.now() - startTs,
    })

    const itinerary = extractItinerary(text)
    if (!itinerary) {
      console.error('[generate] Failed to parse. text snippet:', text.slice(0, 800))
      return NextResponse.json(
        { error: 'AI 回應格式異常，請再試一次', aiInfo: buildInfo(false, 'PARSE_ERROR', 'AI 回應格式異常，無法解析') },
        { status: 500 },
      )
    }

    // Create the itinerary record
    const { data: row, error: insertError } = await db
      .from('itineraries')
      .insert({
        owner_id: user.id,
        title: itinerary.metadata.title,
        destination: itinerary.metadata.destination,
        start_date: itinerary.metadata.startDate,
        end_date: itinerary.metadata.endDate,
        currency: itinerary.metadata.currency,
        status: 'draft',
        data: itinerary,
        version: 1,
      })
      .select('id')
      .single()

    if (insertError || !row) {
      console.error('[generate] DB insert error:', insertError)
      return NextResponse.json({ error: '儲存行程失敗' }, { status: 500 })
    }

    // Add owner as member
    await db.from('itinerary_members').insert({
      itinerary_id: row.id,
      user_id: user.id,
      role: 'owner',
    })

    // Create the default chat thread
    await db.from('chat_threads').insert({
      itinerary_id: row.id,
    })

    return NextResponse.json({ itineraryId: row.id, aiInfo: buildInfo(true, null, null) })
  } catch (err) {
    console.error('[generate] AI error:', err)
    const { code, meaning } = classifyError(err)
    const errInfo: AIResultInfo = {
      timestamp: new Date().toISOString(),
      scene: 'generate',
      provider: isLocalAI() ? 'local' : modelProvider,
      model: isLocalAI() ? 'claude -p（本機訂閱制）' : MODEL_PRICING[modelProvider].label,
      success: false,
      errorCode: code,
      errorMeaning: meaning,
      usage,
      costUSD: null,
      costTWD: null,
      durationMs: Date.now() - startTs,
    }
    return NextResponse.json({ error: '呼叫 AI 失敗，請稍後再試', aiInfo: errInfo }, { status: 500 })
  }
}
