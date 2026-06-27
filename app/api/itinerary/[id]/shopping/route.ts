import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { mapShopping } from '@/lib/types/shopping'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 從 body 取出採購欄位（add/edit 共用）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fields(body: any) {
  return {
    name: String(body.name ?? '').trim(),
    quantity: body.quantity ? String(body.quantity) : null,
    note: body.note ? String(body.note) : null,
    place_id: body.placeId ?? null,
    place_name: body.placeName ?? null,
    lat: typeof body.lat === 'number' ? body.lat : null,
    lng: typeof body.lng === 'number' ? body.lng : null,
    day_indexes: Array.isArray(body.dayIndexes)
      ? body.dayIndexes.filter((n: unknown) => typeof n === 'number')
      : [],
  }
}

/** GET — 列出本行程採購清單（可見成員皆可讀）。 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const { data, error } = await db
    .from('shopping_items')
    .select('*')
    .eq('itinerary_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: (data ?? []).map(mapShopping), canEdit: access.canEdit })
}

/** POST — 採購操作（限可編輯者）。action: add | toggle | edit | delete */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    const f = fields(body)
    if (!f.name) return NextResponse.json({ error: '品名為空' }, { status: 400 })
    const { data, error } = await db
      .from('shopping_items')
      .insert({ itinerary_id: params.id, ...f, created_by: user.id })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: mapShopping(data) })
  }

  if (action === 'toggle') {
    const id = String(body.id ?? '')
    const { error } = await db
      .from('shopping_items')
      .update({ is_done: !!body.isDone, updated_at: now })
      .eq('id', id)
      .eq('itinerary_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'edit') {
    const id = String(body.id ?? '')
    const f = fields(body)
    if (!f.name) return NextResponse.json({ error: '品名為空' }, { status: 400 })
    const { error } = await db
      .from('shopping_items')
      .update({ ...f, updated_at: now })
      .eq('id', id)
      .eq('itinerary_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const id = String(body.id ?? '')
    const { error } = await db
      .from('shopping_items')
      .delete()
      .eq('id', id)
      .eq('itinerary_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
