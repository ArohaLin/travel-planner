import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import type { Itinerary } from '@/lib/types/itinerary'

/**
 * 行程還原。
 * - GET ?changeId=  → 回傳該歷史節點的完整快照（供「還原前預覽」）。可見成員皆可。
 * - POST { changeId } → 把該節點快照設回目前行程（限建立者/管理者）。
 *   非破壞式：還原後新增一筆 rollback 節點（snapshot=還原後狀態）→ 可再還原回去。
 */

async function loadChangeSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  itineraryId: string,
  changeId: string,
): Promise<{ snapshot: Itinerary | null; description: string | null; createdAt: string | null }> {
  const { data } = await db
    .from('itinerary_changes')
    .select('snapshot, description, created_at')
    .eq('id', changeId)
    .eq('itinerary_id', itineraryId)
    .maybeSingle()
  return {
    snapshot: (data?.snapshot ?? null) as Itinerary | null,
    description: data?.description ?? null,
    createdAt: data?.created_at ?? null,
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const changeId = new URL(req.url).searchParams.get('changeId')
  if (!changeId) return NextResponse.json({ error: '缺少 changeId' }, { status: 400 })

  const { snapshot, description, createdAt } = await loadChangeSnapshot(db, params.id, changeId)
  if (!snapshot) return NextResponse.json({ error: '此版本沒有快照，無法預覽' }, { status: 404 })

  return NextResponse.json({ snapshot, description, createdAt })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (access.effectiveRole !== 'owner') {
    return NextResponse.json({ error: '只有建立者或管理者可以還原行程' }, { status: 403 })
  }

  const { changeId } = (await req.json().catch(() => ({}))) as { changeId?: string }
  if (!changeId) return NextResponse.json({ error: '缺少 changeId' }, { status: 400 })

  const { snapshot, description } = await loadChangeSnapshot(db, params.id, changeId)
  if (!snapshot) return NextResponse.json({ error: '此版本沒有快照，無法還原' }, { status: 400 })

  // 取目前版本做樂觀鎖
  const { data: row } = await db.from('itineraries').select('version').eq('id', params.id).single()
  if (!row) return NextResponse.json({ error: '行程不存在' }, { status: 404 })
  const nextVersion = (row.version ?? 1) + 1

  const restoredData: Itinerary = {
    ...snapshot,
    version: nextVersion,
    lastModifiedAt: new Date().toISOString(),
  }

  const { error: updErr, count } = await db
    .from('itineraries')
    .update({ data: restoredData, version: nextVersion }, { count: 'exact' })
    .eq('id', params.id)
    .eq('version', row.version)

  if (updErr) return NextResponse.json({ error: '還原失敗' }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: '行程剛被更新，請重新整理後再還原' }, { status: 409 })

  // 非破壞式：新增一筆還原節點（本身也可被還原）
  const desc = `還原到先前版本${description ? `：${description}` : ''}`
  await db.from('itinerary_changes').insert({
    itinerary_id: params.id,
    user_id: user.id,
    change_type: 'rollback',
    description: desc,
    patch: { patchId: `rollback-${Date.now()}`, description: desc, ops: [], proposedBy: 'user' },
    snapshot: restoredData,
  })

  return NextResponse.json({ success: true, version: nextVersion })
}
