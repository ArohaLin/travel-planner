import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { mapBooking } from '@/lib/types/booking'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fields(body: any) {
  return {
    title: String(body.title ?? '').trim(),
    type: String(body.type ?? 'other'),
    status: String(body.status ?? 'needed'),
    date: body.date ? String(body.date) : null,
    end_date: body.endDate ? String(body.endDate) : null,
    time: body.time ? String(body.time) : null,
    cost: body.cost ?? null,
    deposit_paid: body.depositPaid ?? null,
    booking_platform: body.bookingPlatform ? String(body.bookingPlatform) : null,
    order_number: body.orderNumber ? String(body.orderNumber) : null,
    booking_url: body.bookingUrl ? String(body.bookingUrl) : null,
    free_cancel_by: body.freeCancelBy ? String(body.freeCancelBy) : null,
    contact: body.contact ? String(body.contact) : null,
    notes: body.notes ? String(body.notes) : null,
  }
}

/** GET — 列出本行程獨立預約（可見成員可讀）。 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const { data, error } = await db
    .from('bookings')
    .select('*')
    .eq('itinerary_id', params.id)
    .order('date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ bookings: (data ?? []).map(mapBooking), canEdit: access.canEdit })
}

/** POST — 預約操作（限可編輯者）。action: add | edit | delete */
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
    if (!f.title) return NextResponse.json({ error: '標題為空' }, { status: 400 })
    const { data, error } = await db
      .from('bookings')
      .insert({ itinerary_id: params.id, ...f, created_by: user.id })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ booking: mapBooking(data) })
  }

  if (action === 'edit') {
    const id = String(body.id ?? '')
    const f = fields(body)
    if (!f.title) return NextResponse.json({ error: '標題為空' }, { status: 400 })
    const { data, error } = await db
      .from('bookings')
      .update({ ...f, updated_at: now })
      .eq('id', id)
      .eq('itinerary_id', params.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ booking: mapBooking(data) })
  }

  if (action === 'delete') {
    const id = String(body.id ?? '')
    const { error } = await db
      .from('bookings')
      .delete()
      .eq('id', id)
      .eq('itinerary_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
