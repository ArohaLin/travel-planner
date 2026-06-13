import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const { data, error } = await db
    .from('itineraries')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '找不到行程' }, { status: 404 })
  }

  return NextResponse.json({ ...data, role: access.effectiveRole })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  // 一層權限：非遊客成員或管理者可編輯
  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) {
    return NextResponse.json({ error: '無編輯權限' }, { status: 403 })
  }
  const { data: row, error: fetchError } = await db
    .from('itineraries')
    .select('data, version')
    .eq('id', params.id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: '找不到行程' }, { status: 404 })
  }

  const body = await request.json()
  const { metadata: metadataPatch, days: daysReplace } = body

  if (!metadataPatch || typeof metadataPatch !== 'object') {
    return NextResponse.json({ error: '請提供 metadata 欄位' }, { status: 400 })
  }

  // Merge metadata
  const currentData = row.data as Record<string, unknown>
  const currentMetadata = (currentData.metadata ?? {}) as Record<string, unknown>
  const newMetadata = { ...currentMetadata, ...metadataPatch }
  const newData: Record<string, unknown> = {
    ...currentData,
    metadata: newMetadata,
    lastModifiedAt: new Date().toISOString(),
  }
  // 若有提供 days（改日期/天數變化時前端算好的完整 days 陣列），整批替換
  if (Array.isArray(daysReplace)) {
    newData.days = daysReplace
  }

  // Also update denormalized top-level columns if changed
  const updatePayload: Record<string, unknown> = {
    data: newData,
    version: (row.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
  }
  if (metadataPatch.title) updatePayload.title = metadataPatch.title
  if (metadataPatch.startDate) updatePayload.start_date = metadataPatch.startDate
  if (metadataPatch.endDate) updatePayload.end_date = metadataPatch.endDate

  const { error: updateError } = await db
    .from('itineraries')
    .update(updatePayload)
    .eq('id', params.id)

  if (updateError) {
    console.error('[PATCH itinerary] update error:', updateError)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }

  // 記錄歷程節點（含快照，供還原）；日期/天數變更原本不寫歷程，這裡補上
  const changeDesc = Array.isArray(daysReplace) ? '修改行程日期／天數' : '修改行程資訊'
  const { error: logErr } = await db.from('itinerary_changes').insert({
    itinerary_id: params.id,
    user_id: user.id,
    change_type: 'manual_edit',
    description: changeDesc,
    patch: { patchId: `meta-${Date.now()}`, description: changeDesc, ops: [], proposedBy: 'user' },
    snapshot: newData,
  })
  if (logErr) console.error('[PATCH itinerary] change log failed', logErr)

  return NextResponse.json({ success: true, metadata: newMetadata })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  // 一層權限：建立者或管理者可刪除
  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (access.effectiveRole !== 'owner') {
    return NextResponse.json({ error: '只有建立者或管理者可以刪除行程' }, { status: 403 })
  }

  await db.from('itineraries').delete().eq('id', params.id)

  return NextResponse.json({ success: true })
}
