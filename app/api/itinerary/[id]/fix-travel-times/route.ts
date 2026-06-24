import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { getGeminiClient, MODEL_GEMINI, MODEL_GEMINI_PRO } from '@/lib/ai/client'
import { buildAdjustPromptGemini } from '@/lib/ai/systemPrompt'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import { extractPlans, parseAdjustJson } from '@/lib/ai/patchParser'
import { applyPatch, PatchError } from '@/lib/ai/patchApplier'
import { enrichPatchForHistory } from '@/lib/history/enrich'
import { scanBufferWarnings } from '@/lib/maps/bufferScan'
import { fetchAndStoreActivityPhotos } from '@/lib/maps/activityPhotos'
import { sendPushToUser } from '@/lib/push/send'
import { runAfterResponse } from '@/lib/push/waitUntil'
import type { Itinerary } from '@/lib/types/itinerary'

// AI 調整（Gemini Pro）可能跑 1–3 分鐘，放寬逾時上限
export const maxDuration = 300

// 與行程頁「修正路程時間」按鈕一致的指令：只調時間、不增刪景點
const FIX_MESSAGE =
  '請修正行程中所有移動時間「⚠️不足」與「🟡偏緊」的段落：依系統提供的「實際路程時間」清單，' +
  '把每段預留的移動時間調整為清單中的「建議預留」值（後移後續活動或縮短前一活動停留）。' +
  '只調整時間，不要增刪活動、不要更換景點。'

/** 跑一次 Gemini 調整（非串流）：主用 Pro、失敗退 Flash，回傳完整文字（含 <plans>） */
async function runAdjustGemini(itin: Itinerary): Promise<string> {
  const gemini = getGeminiClient()
  const systemPrompt = buildAdjustPromptGemini(itin)
  let lastErr: unknown = null
  for (const modelName of [MODEL_GEMINI_PRO, MODEL_GEMINI]) {
    try {
      const model = gemini.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: { maxOutputTokens: 32768 },
      })
      const result = await model.generateContent(FIX_MESSAGE)
      return result.response.text()
    } catch (e) {
      lastErr = e
      console.warn(`[fix-travel] Gemini ${modelName} 失敗，嘗試備援:`, String(e).slice(0, 160))
    }
  }
  throw lastErr ?? new Error('Gemini 無回應')
}

/**
 * 一鍵「自動修正路程時間」：伺服器端跑 AI 並**直接套用**第一個方案。
 *
 * 為什麼放伺服器端：使用者按下後常會切到背景等通知；若在前端套用，背景化會中斷而失敗。
 * 伺服器端套用 → 即使 App 切背景也會完成，並用 Web Push 通知、靠 Realtime 自動更新畫面。
 * 仍是「快照式、可還原」：寫一筆 itinerary_changes（含 snapshot），歷程頁可還原。
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })

  const { data: row } = await db
    .from('itineraries')
    .select('data, version')
    .eq('id', params.id)
    .single()
  if (!row) return NextResponse.json({ error: '找不到行程' }, { status: 404 })

  const itinerary = row.data as Itinerary

  // 沒有需要修正的段落就不必呼叫 AI（保護成本，也避免套用無謂變更）
  const warnings = scanBufferWarnings(itinerary)
  if (warnings.total === 0) {
    return NextResponse.json({ success: true, noChange: true, message: '目前沒有需要修正的移動時間' })
  }

  // 跑 AI 取得調整方案（本機開發走 claude -p，不計費）
  let text = ''
  try {
    text = isLocalAI()
      ? await runLocalClaude({ systemPrompt: buildAdjustPromptGemini(itinerary), userMessage: FIX_MESSAGE })
      : await runAdjustGemini(itinerary)
  } catch (e) {
    console.error('[fix-travel] AI 失敗:', String(e).slice(0, 200))
    return NextResponse.json({ error: 'AI 暫時無回應，請稍後再試' }, { status: 502 })
  }

  // 解析方案：prompt 現以 JSON 物件輸出 → 優先 parseAdjustJson，退回舊 extractPlans（標籤/容錯）
  const parsedJson = parseAdjustJson(text)
  const plans = parsedJson && parsedJson.plans.length > 0 ? parsedJson.plans : extractPlans(text)
  if (!plans || plans.length === 0) {
    return NextResponse.json(
      { error: 'AI 沒有提供可套用的修正，請改用聊天微調' },
      { status: 422 },
    )
  }
  const plan = plans[0]

  try {
    const updated = applyPatch(itinerary, plan.patch)

    // 樂觀鎖：避免覆蓋他人同時的編輯
    const { error: updateError } = await db
      .from('itineraries')
      .update({ data: updated, version: row.version + 1 })
      .eq('id', params.id)
      .eq('version', row.version)
    if (updateError) {
      return NextResponse.json({ error: '行程剛被其他成員更新，請再試一次' }, { status: 409 })
    }

    // 歷程＋快照（可還原）
    const enriched = enrichPatchForHistory(itinerary, plan.patch, {
      title: plan.title,
      comparison: plan.comparison ?? null,
    })
    await db.from('itinerary_changes').insert({
      itinerary_id: params.id,
      user_id: user.id,
      change_type: 'ai_patch',
      patch: enriched,
      description: plan.title ?? '自動修正路程時間',
      snapshot: updated,
    })

    // 背景補座標/照片（新景點不會有；此處主要保險）＋完成通知
    runAfterResponse(
      fetchAndStoreActivityPhotos(db, params.id).catch((e) => console.error('[fix-travel] enrich failed', e)),
    )
    runAfterResponse(
      sendPushToUser(user.id, {
        title: '✅ 已自動修正路程時間',
        body: `「${itinerary.metadata?.title ?? '行程'}」的移動時間已依實測路程調整完成`,
        url: `/itinerary/${params.id}`,
      }),
    )

    return NextResponse.json({ success: true, version: row.version + 1, planTitle: plan.title })
  } catch (err) {
    if (err instanceof PatchError) {
      return NextResponse.json({ error: `套用修正失敗：${err.message}` }, { status: 422 })
    }
    throw err
  }
}
