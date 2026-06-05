import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { ItineraryDay, TravelLeg } from '@/lib/types/itinerary'

/**
 * 持久化開車路段（距離/時間）回 DB。
 *
 * 由地圖開啟、Directions 算完每天的路線後呼叫，將各路段距離/時間寫回對應的天，
 * 供行程表卡片之間顯示「🚗 23 km・約 35 分」。採整天覆寫（每次送來的是該天完整路段）。
 */

interface DayPayload {
  dayIndex: number
  legs: TravelLeg[]
  sig?: string
}

function sanitizeLegs(legs: unknown): TravelLeg[] {
  if (!Array.isArray(legs)) return []
  const out: TravelLeg[] = []
  for (const l of legs) {
    if (!l || typeof l !== 'object') continue
    const { toId, meters, seconds, midLat, midLng, polyline } = l as Record<string, unknown>
    if (typeof toId !== 'string' || !toId) continue
    if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) continue
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) continue
    const leg: TravelLeg = { toId, meters, seconds }
    if (typeof midLat === 'number' && Number.isFinite(midLat)) leg.midLat = midLat
    if (typeof midLng === 'number' && Number.isFinite(midLng)) leg.midLng = midLng
    if (typeof polyline === 'string' && polyline) leg.polyline = polyline
    out.push(leg)
  }
  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  // 確認使用者可存取此行程
  const { data: member } = await supabase
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: '無存取權限' }, { status: 403 })
  }

  const body = await req.json()
  const rawDays = body.days
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return NextResponse.json({ error: '無更新內容' }, { status: 400 })
  }

  interface DayUpdate { legs: TravelLeg[]; sig?: string }
  const byDay = new Map<number, DayUpdate>()
  for (const d of rawDays as DayPayload[]) {
    if (typeof d?.dayIndex !== 'number') continue
    byDay.set(d.dayIndex, {
      legs: sanitizeLegs(d.legs),
      sig: typeof d.sig === 'string' ? d.sig : undefined,
    })
  }
  if (byDay.size === 0) {
    return NextResponse.json({ error: '無有效路段' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data: row, error: fetchError } = await db
    .from('itineraries')
    .select('data')
    .eq('id', params.id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: '行程不存在' }, { status: 404 })
  }

  const data = row.data ?? {}
  const days: ItineraryDay[] = data.days ?? []

  let changed = false
  const newDays = days.map((day) => {
    const upd = byDay.get(day.dayIndex)
    if (!upd) return day
    changed = true
    // 逐段折線存在每段 leg 內；不再使用日層級 routePolyline（清掉舊欄位）
    const { routePolyline, ...rest } = day
    void routePolyline
    return { ...rest, travelLegs: upd.legs, travelSig: upd.sig ?? day.travelSig }
  })

  if (!changed) {
    return NextResponse.json({ success: true, updated: 0 })
  }

  const { error: updateError } = await db
    .from('itineraries')
    .update({ data: { ...data, days: newDays } })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: byDay.size })
}
