import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { mapTodo } from '@/lib/types/todo'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** GET — 列出本行程所有 todo（手動待辦 + 自動提醒的覆蓋記號）。可見成員皆可讀。 */
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
    .from('todo_items')
    .select('*')
    .eq('itinerary_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ todos: (data ?? []).map(mapTodo), canEdit: access.canEdit })
}

/** POST — 待辦操作（限可編輯者）。
 *  action: add | toggle | edit | delete（手動待辦）｜ resolveAuto（自動提醒已完成/略過的覆蓋記號）
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: '無編輯權限' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const now = new Date().toISOString()

  if (action === 'add') {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: '內容為空' }, { status: 400 })
    const { data, error } = await db
      .from('todo_items')
      .insert({ itinerary_id: params.id, kind: 'manual', title, created_by: user.id })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ todo: mapTodo(data) })
  }

  if (action === 'toggle') {
    const id = String(body.id ?? '')
    const { error } = await db
      .from('todo_items')
      .update({ is_done: !!body.isDone, updated_at: now })
      .eq('id', id)
      .eq('itinerary_id', params.id)
      .eq('kind', 'manual')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'edit') {
    const id = String(body.id ?? '')
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: '內容為空' }, { status: 400 })
    const { error } = await db
      .from('todo_items')
      .update({ title, updated_at: now })
      .eq('id', id)
      .eq('itinerary_id', params.id)
      .eq('kind', 'manual')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const id = String(body.id ?? '')
    const { error } = await db
      .from('todo_items')
      .delete()
      .eq('id', id)
      .eq('itinerary_id', params.id)
      .eq('kind', 'manual')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 自動提醒：寫/清「已完成（完成或略過）」覆蓋記號（以 auto_key 為鍵）
  if (action === 'resolveAuto') {
    const autoKey = String(body.autoKey ?? '')
    const isDone = !!body.isDone
    if (!autoKey) return NextResponse.json({ error: '缺少 autoKey' }, { status: 400 })
    const { data: existing } = await db
      .from('todo_items')
      .select('id')
      .eq('itinerary_id', params.id)
      .eq('kind', 'auto')
      .eq('auto_key', autoKey)
      .maybeSingle()
    if (existing) {
      const { error } = await db
        .from('todo_items')
        .update({ is_done: isDone, updated_at: now })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (isDone) {
      const { error } = await db
        .from('todo_items')
        .insert({ itinerary_id: params.id, kind: 'auto', auto_key: autoKey, is_done: true, created_by: user.id })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
