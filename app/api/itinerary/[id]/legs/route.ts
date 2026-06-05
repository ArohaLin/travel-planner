import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { ItineraryDay, TravelLeg } from '@/lib/types/itinerary'

/**
 * 持久化開車路段（距離/時間）回 DB。
 *
 * 由地圖開啟、Directions 算完每天的路線後呼叫，將各路段距離/時間寫回對應的天，
 * 供行程表卡片之間顯示「🚗 23 km・約 35 分」。採整天覆寫（每次送來的是該天完整路段）。
 */

interface DayLegs {
  dayIndex: number
  legs: TravelLeg[]
}

function sanitizeLegs(legs: unknown): TravelLeg[] {
  if (!Array.isArray(legs)) return []
  const out: TravelLeg[] = []
  for (const l of legs) {
    if (!l || typeof l !== 'object') continue
    const { toId, meters, seconds } = l as Record<string, unknown>
    if (typeof toId !== 'string' || !toId) continue
    if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) continue
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) continue
    out.push({ toId, meters, seconds })
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

  const byDay = new Map<number, TravelLeg[]>()
  for (const d of rawDays as DayLegs[]) {
    if (typeof d?.dayIndex !== 'number') continue
    byDay.set(d.dayIndex, sanitizeLegs(d.legs))
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
    if (!byDay.has(day.dayIndex)) return day
    changed = true
    return { ...day, travelLegs: byDay.get(day.dayIndex) }
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
