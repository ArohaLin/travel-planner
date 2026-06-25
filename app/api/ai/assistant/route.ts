import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { getGeminiClient, MODEL_GEMINI, MODEL_GEMINI_PRO } from '@/lib/ai/client'
import { buildAssistantPrompt } from '@/lib/ai/systemPrompt'
import { computePlanComparison } from '@/lib/ai/planDiff'
import { parseAssistantJson } from '@/lib/ai/patchParser'
import { fetchUrlText, extractUrls } from '@/lib/ai/fetchUrl'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import { sendPushToUser } from '@/lib/push/send'
import { runAfterResponse } from '@/lib/push/waitUntil'
import { MODEL_PRICING, computeCostUSD, usdToTwd, type AIUsage, type AIResultInfo } from '@/lib/ai/pricing'
import type { Itinerary } from '@/lib/types/itinerary'

export const maxDuration = 300

const MAX_IMAGES = 6
const HISTORY_LIMIT = 20

interface AttachImage { mimeType: string; data: string }

export async function POST(request: Request) {
  const startTs = Date.now()
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    itineraryId, threadId, note = '',
    images = [], urls = [],
    lockedActivityId, lockedDayIndex, lockedAccommodationDayIndex,
  } = body as {
    itineraryId: string; threadId: string; note?: string
    images?: AttachImage[]; urls?: string[]
    lockedActivityId?: string; lockedDayIndex?: number; lockedAccommodationDayIndex?: number
  }

  if (!itineraryId || !threadId) return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  const imgs = (images ?? []).filter((i) => i?.data && i?.mimeType).slice(0, MAX_IMAGES)
  const noteText = (note ?? '').trim()
  // 網址：明確傳入的 + note 內偵測到的
  const allUrls = Array.from(new Set([...(urls ?? []), ...extractUrls(noteText)])).slice(0, 5)
  if (imgs.length === 0 && allUrls.length === 0 && !noteText) {
    return NextResponse.json({ error: '請提供照片、網址或文字' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, itineraryId, user.id)
  if (!access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })

  const { data: row } = await db.from('itineraries').select('data, version').eq('id', itineraryId).single()
  if (!row) return NextResponse.json({ error: '找不到行程' }, { status: 404 })
  const itinerary = row.data as Itinerary

  // 抓網址文字
  const fetched = await Promise.all(allUrls.map((u) => fetchUrlText(u)))
  const urlBlock = fetched.length
    ? '\n\n附帶網頁內容：\n' + fetched.map((f) => `【${f.url}】\n${f.text ?? `（抓取失敗：${f.error}）`}`).join('\n\n')
    : ''

  // 寫入「使用者訊息」（人看得懂的紀錄；不存圖檔本體）
  const userRecordParts: string[] = []
  if (noteText) userRecordParts.push(noteText)
  const marks: string[] = []
  if (imgs.length) marks.push(`${imgs.length} 張照片`)
  if (allUrls.length) marks.push(`${allUrls.length} 個連結`)
  if (marks.length) userRecordParts.push(`［附 ${marks.join('、')}］`)
  const userRecord = userRecordParts.join(' ') || '［丟了資料給小幫手］'
  await db.from('chat_messages').insert({ thread_id: threadId, user_id: user.id, role: 'user', content: userRecord })

  // 歷史（純文字；補上一輪 candidates/方案後的續問）
  const { data: historyRaw } = await db
    .from('chat_messages').select('role, content')
    .eq('thread_id', threadId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT)
    .then((r: { data: { role: string; content: string }[] | null }) => ({ data: r.data?.reverse() ?? [] }))
  // 排掉剛插入的本則 user（避免重複）：history 取到倒數第二
  const history = (historyRaw ?? []).slice(0, -1)
  type GeminiMsg = { role: 'user' | 'model'; parts: { text: string }[] }
  const geminiHistory: GeminiMsg[] = []
  for (const m of history) {
    const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user'
    const text = m.content || '...'
    const last = geminiHistory[geminiHistory.length - 1]
    if (last && last.role === role) last.parts[0].text += '\n' + text
    else geminiHistory.push({ role, parts: [{ text }] })
  }
  const cleanHistory = geminiHistory
    .filter((_, i) => (i === 0 ? geminiHistory[0].role === 'user' : true))
    .filter((m, i, arr) => i < arr.length - 1 || m.role === 'model')

  const systemPrompt = buildAssistantPrompt(itinerary, { lockedActivityId, lockedDayIndex, lockedAccommodationDayIndex })
  const userText = `使用者補充：${noteText || '（無，請從附件判斷）'}${urlBlock}${imgs.length ? `\n\n（另附 ${imgs.length} 張照片，見圖片）` : ''}`

  // ── 呼叫 AI（多模態）：Flash 主、Pro 備援；本機開發走 claude -p（無視覺，僅用文字部分）──
  let text = ''
  let usage: AIUsage | null = null
  let actualModel: string | null = null
  try {
    if (isLocalAI()) {
      text = await runLocalClaude({ systemPrompt, userMessage: userText + (imgs.length ? '\n（本機模式無法看圖，請就文字資訊判斷）' : '') })
    } else {
      const gemini = getGeminiClient()
      const userParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: userText }]
      for (const im of imgs) userParts.push({ inlineData: { mimeType: im.mimeType, data: im.data } })
      let lastErr: unknown = null
      for (const modelName of [MODEL_GEMINI, MODEL_GEMINI_PRO]) {
        try {
          const model = gemini.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt })
          const chat = model.startChat({
            history: cleanHistory,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32768 } as any,
          })
          const result = await chat.sendMessage(userParts)
          text = result.response.text()
          const um = result.response.usageMetadata
          if (um) usage = { inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0, totalTokens: um.totalTokenCount ?? 0 }
          actualModel = modelName
          break
        } catch (e) { lastErr = e; console.warn(`[assistant] Gemini ${modelName} 失敗，備援:`, String(e).slice(0, 160)) }
      }
      if (!text) throw lastErr ?? new Error('Gemini 無回應')
    }
  } catch (e) {
    console.error('[assistant] AI 失敗:', String(e).slice(0, 200))
    return NextResponse.json({ error: 'AI 暫時無回應，請稍後再試' }, { status: 502 })
  }

  const parsed = parseAssistantJson(text)
  const message = parsed?.message || '我看了你提供的資料，但暫時無法判斷怎麼填入行程，可以補一下這是哪家店／哪一天的安排嗎？'
  const plans = parsed?.plans ?? []
  // 用「真實 patch × 目前行程」自動算修改前後對照，覆蓋 AI 自填的 comparison（確保列全且與實際一致）
  for (const pl of plans) {
    const computed = computePlanComparison(itinerary, pl.patch?.ops ?? [])
    if (computed.length) pl.comparison = computed
  }
  const candidates = parsed?.candidates ?? []
  const patchStatus = plans.length > 0 ? 'pending_selection' : 'none'

  // 寫入 assistant 訊息：patch 同時帶 plans 與 candidates（前端各自讀）
  await db.from('chat_messages').insert({
    thread_id: threadId, role: 'assistant', content: message,
    patch: (plans.length || candidates.length) ? { plans, candidates } : null,
    patch_status: patchStatus,
  })

  // 完成通知
  runAfterResponse(sendPushToUser(user.id, {
    title: plans.length ? '🤖 小幫手已準備好方案' : '🤖 小幫手回覆了',
    body: `「${itinerary.metadata?.title ?? '行程'}」：${message.slice(0, 40)}`,
    url: `/itinerary/${itineraryId}`,
  }))

  const costUSD = computeCostUSD('gemini', usage, actualModel ?? undefined)
  const aiInfo: AIResultInfo = {
    timestamp: new Date().toISOString(), scene: 'adjust',
    provider: isLocalAI() ? 'local' : 'gemini',
    model: isLocalAI() ? 'claude -p（本機訂閱制）' : actualModel ?? MODEL_PRICING.gemini.label,
    success: true, errorCode: null, errorMeaning: null,
    usage, costUSD, costTWD: usdToTwd(costUSD), durationMs: Date.now() - startTs,
  }

  return NextResponse.json({ message, plans, candidates, aiInfo })
}
