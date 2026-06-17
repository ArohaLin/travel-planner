import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAnthropicClient, getNvidiaClient, getGeminiClient, getOllamaClient, MODEL_CLAUDE, MODEL_MINIMAX, MODEL_GEMINI, MODEL_GEMINI_PRO, MODEL_OLLAMA } from '@/lib/ai/client'
import { buildAdjustPrompt, buildAdjustPromptMinimax, buildAdjustPromptGemini, buildConsultPrompt, buildConsultPromptLocal } from '@/lib/ai/systemPrompt'
import { extractPlans, stripPlansTag, stripLeakedPlanJson, extractMemory, stripMemoryTag } from '@/lib/ai/patchParser'
import { logAIConversation } from '@/lib/ai/logger'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import { sendPushToUser } from '@/lib/push/send'
import { runAfterResponse } from '@/lib/push/waitUntil'
import { getItineraryAccess } from '@/lib/auth/access'
import { MODEL_PRICING, computeCostUSD, usdToTwd, classifyError, type AIUsage, type AIResultInfo } from '@/lib/ai/pricing'
import type { Itinerary } from '@/lib/types/itinerary'
import type { AIPlan } from '@/lib/types/patch'
import type { ModelProvider } from '@/lib/ai/client'

// 行程調整（Gemini Pro）複雜請求可能跑 2–3 分鐘，明確放寬函式逾時上限，避免被中途砍掉
export const maxDuration = 300

// ── 歷史記錄限制 ─────────────────────────────────────────────────────────────
// 從 DB 最多載入幾則餵給 AI（與前端視窗顯示的 30 則對齊：AI 記得 ≈ 你看到的）
const HISTORY_LIMIT = 30

// 送給 AI 的 history 字元上限（依模型，避免超過 context window）
// 1 中文字 ≈ 1.5 token；為 system prompt + 回覆保留充分空間
const MAX_HISTORY_CHARS: Record<ModelProvider, number> = {
  claude:   30000,  // Claude 200k context，非常寬裕
  gemini:   30000,  // Gemini 1M context，非常寬裕
  minimax:   6000,  // MiniMax 32k tokens，保守限制
  local:     4000,  // 本地 Ollama gemma4:12b，context 僅 8192：prompt+歷史壓低，留足回答空間
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

  // 一層權限：AI 對話僅限非遊客成員或管理者（遊客無 AI）
  const access = await getItineraryAccess(db, itineraryId, user.id)
  if (!access.canEdit) {
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
    ? (modelProvider === 'local' ? buildConsultPromptLocal(itinerary) : buildConsultPrompt(itinerary))
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
      let usage: AIUsage | null = null
      let closed = false
      // 實際使用的模型 ID（Gemini 依模式選 Pro/Flash，且可能備援切換；其他供應商為 null → 用預設 label）
      let actualModel: string | null = null
      // 安全 enqueue：client 斷線後 controller 已關閉，避免拋 ERR_INVALID_STATE
      const safeEnqueue = (s: string) => {
        if (closed) return
        try { controller.enqueue(enc.encode(s)) } catch { closed = true }
      }

      try {
        if (modelProvider === 'local') {
          // ── 本地 AI（自架 Ollama，OpenAI 相容、串流）──────────────────────
          // 放在 isLocalAI() 之前：使用者明確選「本地 AI」就一律走 Ollama（連本機開發也是）
          const ollama = getOllamaClient()
          const openaiStream = await ollama.chat.completions.create({
            model: MODEL_OLLAMA,
            messages: [
              { role: 'system', content: systemPrompt },
              ...historyMessages,
              { role: 'user', content: userMessage },
            ],
            stream: true,
            stream_options: { include_usage: true },
          })
          for await (const chunk of openaiStream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
              fullResponse += delta
              safeEnqueue(delta)
            }
            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
                totalTokens: chunk.usage.total_tokens ?? 0,
              }
            }
          }
        } else if (isLocalAI()) {
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
            stream_options: { include_usage: true },
          })

          for await (const chunk of openaiStream) {
            const choice = chunk.choices[0]
            const delta = choice?.delta?.content
            // MiniMax M2.7 是推理模型，前段 streaming 是 reasoning_content（思考過程），
            // 最終回答才在 content。reasoning 期間不輸出任何文字，讓前端 loading 動畫維持顯示。
            if (delta) {
              fullResponse += delta
              safeEnqueue(delta)
            }
            // usage 通常在最後一個 chunk（choices 為空）
            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
                totalTokens: chunk.usage.total_tokens ?? 0,
              }
            }
          }
        } else if (modelProvider === 'gemini') {
          // ── Gemini via Google Generative AI SDK ───────────────────────────
          const gemini = getGeminiClient()

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

          // 模型選擇（A/B 實測 2026-06-12）：
          // 調整＝多約束推理 → Pro（實測零違規、約 60 秒）；咨詢＝純文字 → Flash（快又省）。
          // 自動備援：主模型失敗且尚未輸出任何內容時，改用另一個模型重試一次（例：503 過載）。
          const primaryModel = mode === 'adjust' ? MODEL_GEMINI_PRO : MODEL_GEMINI
          const fallbackModel = primaryModel === MODEL_GEMINI_PRO ? MODEL_GEMINI : MODEL_GEMINI_PRO

          for (const modelName of [primaryModel, fallbackModel]) {
            try {
              const model = gemini.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt,
              })
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
              // Gemini usage 在 aggregated response 的 usageMetadata
              const gemResp = await result.response
              const um = gemResp.usageMetadata
              if (um) {
                usage = {
                  inputTokens: um.promptTokenCount ?? 0,
                  outputTokens: um.candidatesTokenCount ?? 0,
                  totalTokens: um.totalTokenCount ?? 0,
                }
              }
              actualModel = modelName
              break
            } catch (e) {
              // 已輸出部分內容就不能換模型重來（前端已顯示），或備援也失敗 → 拋出
              if (fullResponse.length > 0 || modelName === fallbackModel) throw e
              console.warn(`[chat] Gemini ${modelName} 失敗，改用備援 ${fallbackModel}:`,
                String(e).slice(0, 200))
            }
          }
          console.log('[chat] Gemini model:', actualModel,
            '| fullResponse length:', fullResponse.length,
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
          // Claude usage 在 finalMessage
          const finalMsg = await claudeStream.finalMessage()
          if (finalMsg.usage) {
            usage = {
              inputTokens: finalMsg.usage.input_tokens ?? 0,
              outputTokens: finalMsg.usage.output_tokens ?? 0,
              totalTokens: (finalMsg.usage.input_tokens ?? 0) + (finalMsg.usage.output_tokens ?? 0),
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

      // #15：擷取並更新行程記憶，並從顯示文字移除 <memory> 區塊
      const newMemory = extractMemory(fullResponse)
      let displayText = stripMemoryTag(stripPlansTag(fullResponse))
      // adjust 模式：再清掉「漏包 <plans> 標籤」的方案 JSON（code fence / 裸陣列），避免外漏
      if (mode === 'adjust') displayText = stripLeakedPlanJson(displayText)

      if (newMemory && newMemory !== itinerary.metadata.aiMemory) {
        try {
          const updatedData = {
            ...itinerary,
            metadata: { ...itinerary.metadata, aiMemory: newMemory },
          }
          await db.from('itineraries').update({ data: updatedData }).eq('id', itineraryId)
          console.log('[chat] aiMemory updated, length:', newMemory.length)
        } catch (e) {
          console.error('[chat] aiMemory update failed:', e)
        }
      }

      // adjust 模式的顯示文字補強：
      //   有方案但沒說明文字 → 補一句確認提示；
      //   嘗試輸出方案卻解析失敗（多半是項目太多、輸出在 token 上限被截斷）→ 明確引導分批，
      //   避免顯示「請確認是否套用」卻沒有方案、或讓殘缺 JSON 外漏。
      if (mode === 'adjust') {
        if (plans && plans.length > 0) {
          if (!displayText) displayText = '已根據您的需求生成調整方案，請確認是否套用。'
        } else if (/<plans>|"planIndex"|"ops"\s*:|"add_activity"/.test(fullResponse)) {
          // 嘗試輸出方案卻解析失敗（截斷、或漏包 <plans> 標籤）→ 明確引導，不顯示殘缺 JSON
          displayText =
            '這次要調整的內容較多，AI 產生的方案格式不完整、無法直接套用。建議分批處理（例如一次只加入 3–5 個願望清單景點），或直接再試一次。'
        }
      }

      // 安全上限：displayText 是存進 DB 的顯示文字，不應超過 8000 字元。
      // 若 stripLeakedPlanJson 因未知格式未能完整清除 JSON，此處作最後防線，
      // 避免超長 content 影響前端字元限制邏輯或 DB 效能。
      const MAX_DISPLAY_CHARS = 8000
      if (displayText.length > MAX_DISPLAY_CHARS) {
        console.warn(`[chat] displayText truncated: ${displayText.length} → ${MAX_DISPLAY_CHARS} chars`)
        displayText = displayText.slice(0, MAX_DISPLAY_CHARS) + '…'
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

      // ── AI 完成通知（Web Push）────────────────────────────────────────────
      // 結果已存 DB 才發；App 在前景時 service worker 會自動略過不彈。
      if (!streamError && fullResponse.trim() && !fullResponse.startsWith('[AI 未回應')) {
        console.log('[chat] sending push to user', user.id, 'mode', mode)
        const tripTitle = itinerary.metadata?.title ?? '行程'
        // waitUntil：即使使用者已把 App 滑掉、連線中斷，仍保證把通知送出
        runAfterResponse(
          sendPushToUser(user.id, {
            title: mode === 'adjust' ? '✨ AI 調整方案完成' : '💬 AI 咨詢回覆完成',
            body:
              mode === 'adjust'
                ? `「${tripTitle}」的調整方案已就緒，點擊查看並確認是否採用`
                : `「${tripTitle}」的咨詢回覆已完成，點擊查看`,
            url: `/itinerary/${itineraryId}`,
          }),
        )
      }

      // ── 組裝 AI 回傳資訊（記錄最近一次）────────────────────────────────────
      const success = !streamError && !!fullResponse.trim() && !fullResponse.startsWith('[AI 未回應')
      const errInfo = streamError ? classifyError(streamError) : null
      const costUSD = computeCostUSD(modelProvider, usage, actualModel ?? undefined)
      // 「本機 claude -p」開發覆寫：僅在非 Ollama（local provider）時才算數
      const usedLocalClaude = isLocalAI() && modelProvider !== 'local'
      const aiInfo: AIResultInfo = {
        timestamp: new Date().toISOString(),
        scene: mode,
        provider: usedLocalClaude ? 'local' : modelProvider,
        model: usedLocalClaude
          ? 'claude -p（本機訂閱制）'
          : actualModel ?? MODEL_PRICING[modelProvider].label,
        success,
        errorCode: errInfo?.code ?? (success ? null : 'EMPTY'),
        errorMeaning: errInfo?.meaning ?? (success ? null : 'AI 沒有回應內容'),
        usage,
        costUSD,
        costTWD: usdToTwd(costUSD),
        durationMs: Date.now() - startTs,
      }

      // Append a marker so the client knows the stream is done
      safeEnqueue(`\n\n__DONE__${JSON.stringify({ mode, plans, aiInfo })}`)
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
