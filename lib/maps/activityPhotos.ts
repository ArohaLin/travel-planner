import { findPlace, mapPool, getServerMapsKey } from '@/lib/maps/places'
import type { Itinerary } from '@/lib/types/itinerary'

/**
 * 為行程中「尚無 photoRef」的景點 / 住宿，背景抓取 Google Places 代表照片 reference，
 * 並寫回行程 data。供景點詳情視窗與宣傳冊共用。
 *
 * 設計：
 * - 交通類（type=transport）不抓照片。
 * - 只補缺的（已有 photoRef 就跳過）→ 可重複呼叫、成本有上限。
 * - 寫回前「重讀一次」再依 id 合併，避免抓圖期間使用者剛好編輯被覆蓋。
 *
 * @returns 實際補到照片的數量
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAndStoreActivityPhotos(db: any, itineraryId: string): Promise<number> {
  const key = getServerMapsKey()
  if (!key) return 0

  const { data: row } = await db.from('itineraries').select('data').eq('id', itineraryId).single()
  if (!row?.data) return 0
  const itin = row.data as Itinerary

  interface Target {
    dayIndex: number
    kind: 'activity' | 'acc'
    activityId?: string
    query: string
  }
  const targets: Target[] = []
  for (const day of itin.days) {
    for (const a of day.activities) {
      if (a.type === 'transport') continue
      if (!a.photoRef) {
        targets.push({
          dayIndex: day.dayIndex,
          kind: 'activity',
          activityId: a.id,
          query: [a.title, a.placeLabel, day.city].filter(Boolean).join(' '),
        })
      }
    }
    if (day.accommodation && !day.accommodation.photoRef) {
      targets.push({ dayIndex: day.dayIndex, kind: 'acc', query: `${day.accommodation.name} ${day.city}` })
    }
  }
  if (targets.length === 0) return 0

  const results = await mapPool(targets, (t) => findPlace(t.query, key), 5)

  // photoRef 對照表：activity → by id；accommodation → by dayIndex
  const actPhoto = new Map<string, string>()
  const accPhoto = new Map<number, string>()
  targets.forEach((t, i) => {
    const ref = results[i].photoRef
    if (!ref) return
    if (t.kind === 'activity' && t.activityId) actPhoto.set(t.activityId, ref)
    else if (t.kind === 'acc') accPhoto.set(t.dayIndex, ref)
  })
  if (actPhoto.size === 0 && accPhoto.size === 0) return 0

  // 重讀後依 id 合併（避免覆蓋抓圖期間的編輯），只補仍缺 photoRef 的
  const { data: fresh } = await db.from('itineraries').select('data').eq('id', itineraryId).single()
  if (!fresh?.data) return 0
  const data = fresh.data as Itinerary

  let applied = 0
  const newDays = data.days.map((day) => {
    let changed = false
    const activities = day.activities.map((a) => {
      const ref = actPhoto.get(a.id)
      if (ref && !a.photoRef) {
        changed = true
        applied++
        return { ...a, photoRef: ref }
      }
      return a
    })
    let accommodation = day.accommodation
    const accRef = accPhoto.get(day.dayIndex)
    if (accommodation && accRef && !accommodation.photoRef) {
      accommodation = { ...accommodation, photoRef: accRef }
      changed = true
      applied++
    }
    return changed ? { ...day, activities, accommodation } : day
  })

  if (applied === 0) return 0
  await db.from('itineraries').update({ data: { ...data, days: newDays } }).eq('id', itineraryId)
  return applied
}
