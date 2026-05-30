import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { GeoLocation, ItineraryDay } from '@/lib/types/itinerary'

/**
 * 持久化 geocode 結果回 DB。
 *
 * 由地圖開啟時於前端 geocode 後呼叫，將座標補回行程的 location 欄位，
 * 下次開啟即可直接使用，不需重新查詢。
 *
 * 「附加式」更新：只補上缺少（或為 0,0）的座標，採 read-modify-write，
 * 不做嚴格 version 檢查，避免干擾使用者的正常編輯。
 */

interface GeoUpdate {
  dayIndex: number
  /** activity id，或 'accommodation' 代表當天住宿 */
  target: string
  geo: GeoLocation
}

function hasCoords(loc?: GeoLocation | null): boolean {
  return !!loc && (loc.lat !== 0 || loc.lng !== 0)
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
  const updates: GeoUpdate[] = body.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: '無更新內容' }, { status: 400 })
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

  const byDay = new Map<number, GeoUpdate[]>()
  for (const u of updates) {
    if (!byDay.has(u.dayIndex)) byDay.set(u.dayIndex, [])
    byDay.get(u.dayIndex)!.push(u)
  }

  let changed = false
  const newDays = days.map((day) => {
    const dayUpdates = byDay.get(day.dayIndex)
    if (!dayUpdates) return day

    let dayChanged = false
    let activities = day.activities
    let accommodation = day.accommodation

    for (const u of dayUpdates) {
      if (u.target === 'accommodation') {
        if (accommodation && !hasCoords(accommodation.location)) {
          accommodation = { ...accommodation, location: u.geo }
          dayChanged = true
        }
      } else {
        const idx = activities.findIndex((a) => a.id === u.target)
        if (idx >= 0 && !hasCoords(activities[idx].location)) {
          activities = activities.map((a, i) =>
            i === idx ? { ...a, location: u.geo } : a
          )
          dayChanged = true
        }
      }
    }

    if (!dayChanged) return day
    changed = true
    return { ...day, activities, accommodation }
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

  return NextResponse.json({ success: true, updated: updates.length })
}
