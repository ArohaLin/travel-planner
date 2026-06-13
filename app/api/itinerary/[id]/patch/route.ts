import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ItineraryPatchSchema, AIPlanComparisonItemSchema } from '@/lib/types/patch'
import { applyPatch, PatchError } from '@/lib/ai/patchApplier'
import { enrichPatchForHistory } from '@/lib/history/enrich'
import { getItineraryAccess } from '@/lib/auth/access'
import type { Itinerary } from '@/lib/types/itinerary'
import { z } from 'zod'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()

  // 一層權限：非遊客成員或管理者可修改
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) {
    return NextResponse.json({ error: '無修改權限' }, { status: 403 })
  }

  const body = await request.json()
  // Optional: record which plan was selected in the source chat message
  const chatMessageId = typeof body.chatMessageId === 'string' ? body.chatMessageId : null
  const selectedPlanIndex = typeof body.selectedPlanIndex === 'number' ? body.selectedPlanIndex : null
  const selectedPlanTitle = typeof body.selectedPlanTitle === 'string' ? body.selectedPlanTitle : null
  // 方案的前後比較表（歷程顯示用，寬鬆驗證、失敗就略過）
  const comparisonParse = z.array(AIPlanComparisonItemSchema).safeParse(body.selectedPlanComparison)
  const selectedPlanComparison = comparisonParse.success ? comparisonParse.data : null

  const parseResult = ItineraryPatchSchema.safeParse(body.patch)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Patch 格式錯誤', details: parseResult.error.flatten() }, { status: 400 })
  }

  const patch = parseResult.data

  const { data: row } = await db
    .from('itineraries')
    .select('data, version')
    .eq('id', params.id)
    .single()

  if (!row) return NextResponse.json({ error: '找不到行程' }, { status: 404 })

  const itinerary = row.data as Itinerary

  try {
    const updated = applyPatch(itinerary, patch)

    const { error: updateError } = await db
      .from('itineraries')
      .update({ data: updated, version: row.version + 1 })
      .eq('id', params.id)
      .eq('version', row.version)

    if (updateError) {
      return NextResponse.json({ error: '行程已被其他成員更新，請重新整理後再試' }, { status: 409 })
    }

    // 歷程強化：用「修改前」的行程算出人話差異（整天重構/住宿/行程資訊），
    // 連同方案標題與前後比較表存進歷程（_meta 鍵，applyPatch 用的是原 patch 不受影響）
    const enrichedPatch = enrichPatchForHistory(itinerary, patch, {
      title: selectedPlanTitle,
      comparison: selectedPlanComparison,
    })

    await db.from('itinerary_changes').insert({
      itinerary_id: params.id,
      user_id: user.id,
      change_type: patch.proposedBy === 'ai' ? 'ai_patch' : 'manual_edit',
      patch: enrichedPatch,
      description: selectedPlanTitle ?? patch.description,
      snapshot: updated, // 還原用：存「該次之後」的完整行程快照
    })

    // If this patch came from a chat plan selection, update the message status
    if (chatMessageId && selectedPlanIndex !== null) {
      // Fetch the current message to get its existing patch (plans array)
      const { data: chatMsg } = await db
        .from('chat_messages')
        .select('patch')
        .eq('id', chatMessageId)
        .single()

      if (chatMsg) {
        // Wrap plans + selection info together
        const updatedPatch = {
          plans: Array.isArray(chatMsg.patch) ? chatMsg.patch : [],
          selectedPlanIndex,
          selectedPlanTitle: selectedPlanTitle ?? '',
        }
        await db
          .from('chat_messages')
          .update({ patch_status: 'applied', patch: updatedPatch })
          .eq('id', chatMessageId)
      }
    }

    return NextResponse.json({ success: true, version: row.version + 1 })
  } catch (err) {
    if (err instanceof PatchError) {
      return NextResponse.json({ error: `套用修改失敗：${err.message}` }, { status: 422 })
    }
    throw err
  }
}
