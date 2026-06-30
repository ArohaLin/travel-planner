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
    booking_reference: body.bookingReference ? String(body.bookingReference) : null,
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

  // ── 連結：standalone booking → 行程卡（刪 standalone，更新卡欄位）
  if (action === 'link') {
    const standaloneId = String(body.standaloneId ?? '')
    const targetType = String(body.targetType ?? '') as 'activity' | 'accommodation'
    const targetId = String(body.targetId ?? '')
    const dayIndex = Number(body.dayIndex ?? 0)

    const [{ data: bk }, { data: itin }] = await Promise.all([
      db.from('bookings').select('*').eq('id', standaloneId).eq('itinerary_id', params.id).single(),
      db.from('itineraries').select('data').eq('id', params.id).single(),
    ])
    if (!bk) return NextResponse.json({ error: '找不到預約' }, { status: 404 })
    if (!itin) return NextResponse.json({ error: '找不到行程' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itinData = itin.data as any
    const day = itinData?.days?.[dayIndex]
    if (!day) return NextResponse.json({ error: '找不到指定天' }, { status: 400 })

    const bookingFields = {
      bookingPlatform: bk.booking_platform ?? undefined,
      orderNumber: bk.order_number ?? undefined,
      bookingReference: bk.booking_reference ?? undefined,
      bookingUrl: bk.booking_url ?? undefined,
      depositPaid: bk.deposit_paid ?? undefined,
      freeCancelBy: bk.free_cancel_by ?? undefined,
      contact: bk.contact ?? undefined,
    }

    if (targetType === 'activity') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const act = day.activities?.find((a: any) => a.id === targetId)
      if (!act) return NextResponse.json({ error: '找不到活動' }, { status: 404 })
      Object.assign(act, bookingFields)
      act.reservationStatus = bk.status
      if (bk.cost) act.cost = bk.cost
    } else {
      const acc = day.accommodation
      if (!acc || acc.id !== targetId) return NextResponse.json({ error: '找不到住宿' }, { status: 404 })
      Object.assign(acc, bookingFields)
      acc.reservationStatus = bk.status
      if (bk.cost) acc.cost = bk.cost
    }

    const { error: updErr } = await db.from('itineraries').update({ data: itinData, updated_at: now }).eq('id', params.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await db.from('bookings').delete().eq('id', standaloneId)
    return NextResponse.json({ ok: true })
  }

  // ── 解除：行程卡 → standalone booking（清卡欄位，建 standalone）
  if (action === 'unlink') {
    const targetType = String(body.targetType ?? '') as 'activity' | 'accommodation'
    const targetId = String(body.targetId ?? '')
    const dayIndex = Number(body.dayIndex ?? 0)

    const { data: itin } = await db.from('itineraries').select('data').eq('id', params.id).single()
    if (!itin) return NextResponse.json({ error: '找不到行程' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itinData = itin.data as any
    const day = itinData?.days?.[dayIndex]
    if (!day) return NextResponse.json({ error: '找不到指定天' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newBooking: Record<string, any>
    if (targetType === 'activity') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const act = day.activities?.find((a: any) => a.id === targetId)
      if (!act) return NextResponse.json({ error: '找不到活動' }, { status: 404 })
      newBooking = {
        itinerary_id: params.id, created_by: user.id,
        title: act.title, type: 'activity',
        status: act.reservationStatus ?? 'needed',
        date: day.date ?? null,
        cost: act.cost ?? null,
        booking_platform: act.bookingPlatform ?? null,
        order_number: act.orderNumber ?? null,
        booking_reference: act.bookingReference ?? null,
        booking_url: act.bookingUrl ?? null,
        deposit_paid: act.depositPaid ?? null,
        free_cancel_by: act.freeCancelBy ?? null,
        contact: act.contact ?? null,
      }
      delete act.bookingPlatform; delete act.orderNumber; delete act.bookingReference; delete act.bookingUrl
      delete act.depositPaid; delete act.freeCancelBy; delete act.contact
      act.reservationStatus = 'none'
    } else {
      const acc = day.accommodation
      if (!acc || acc.id !== targetId) return NextResponse.json({ error: '找不到住宿' }, { status: 404 })
      newBooking = {
        itinerary_id: params.id, created_by: user.id,
        title: acc.name, type: 'lodging',
        status: acc.reservationStatus ?? 'needed',
        date: day.date ?? null,
        cost: acc.cost ?? null,
        booking_platform: acc.bookingPlatform ?? null,
        order_number: acc.orderNumber ?? null,
        booking_reference: acc.bookingReference ?? null,
        booking_url: acc.bookingUrl ?? null,
        deposit_paid: acc.depositPaid ?? null,
        free_cancel_by: acc.freeCancelBy ?? null,
        contact: acc.contact ?? null,
      }
      delete acc.bookingPlatform; delete acc.orderNumber; delete acc.bookingReference; delete acc.bookingUrl
      delete acc.depositPaid; delete acc.freeCancelBy; delete acc.contact
      acc.reservationStatus = 'none'
    }

    const [{ data: inserted, error: insErr }, { error: updErr }] = await Promise.all([
      db.from('bookings').insert(newBooking).select('*').single(),
      db.from('itineraries').update({ data: itinData, updated_at: now }).eq('id', params.id),
    ])
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ booking: mapBooking(inserted!) })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
