import { findPlace, mapPool, getServerMapsKey } from '@/lib/maps/places'
import type { GeoLocation, Itinerary } from '@/lib/types/itinerary'

function hasCoords(loc?: GeoLocation | null): boolean {
  return !!loc && (loc.lat !== 0 || loc.lng !== 0)
}

/**
 * 為行程中「尚缺照片或座標」的景點 / 住宿，背景用 Google Places 補上
 * **照片 reference 與座標**，並寫回行程 data。
 *
 * 為什麼也補座標：AI 新增的景點一開始沒有座標，算路程時會被「跳過」→
 * 那段移動時間會算成跳過該點的錯誤距離（例：六十石山→市區 變成 花蓮→台東 3 小時）。
 * 補上座標後，前端 RoutePrefetcher 會因路線指紋改變而自動重算正確的分段時間。
 *
 * 設計：
 * - 交通類（type=transport）不處理（它是移動、不是地點）。
 * - 只補「缺的」（已有就不動，**絕不覆寫既有座標/照片**）→ 可重複呼叫、成本有上限、不破壞既有資料。
 * - 查詢帶上城市（title + placeLabel + city）提高定位準確度；同名地點共用一次搜尋。
 * - 寫回前重讀一次再依 id 合併，避免處理期間的使用者編輯被覆蓋。
 *
 * @returns 實際補上的欄位數（照片或座標）
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
    needPhoto: boolean
    needCoords: boolean
  }
  const targets: Target[] = []
  for (const day of itin.days) {
    for (const a of day.activities) {
      if (a.type === 'transport') continue
      const needPhoto = !a.photoRef
      const needCoords = !hasCoords(a.location)
      if (needPhoto || needCoords) {
        targets.push({
          dayIndex: day.dayIndex,
          kind: 'activity',
          activityId: a.id,
          query: [a.title, a.placeLabel, day.city].filter(Boolean).join(' '),
          needPhoto,
          needCoords,
        })
      }
    }
    if (day.accommodation) {
      const needPhoto = !day.accommodation.photoRef
      const needCoords = !hasCoords(day.accommodation.location)
      if (needPhoto || needCoords) {
        targets.push({
          dayIndex: day.dayIndex,
          kind: 'acc',
          query: `${day.accommodation.name} ${day.city}`,
          needPhoto,
          needCoords,
        })
      }
    }
  }
  if (targets.length === 0) return 0

  // 同名地點（如同一飯店出現在多天）共用「一次搜尋」→ 省 Places 呼叫
  const uniqueQueries = Array.from(new Set(targets.map((t) => t.query)))
  // 並發 2 避免觸發 Places OVER_QUERY_LIMIT（預設 1 QPS 限制）
  const looked = await mapPool(uniqueQueries, (q) => findPlace(q, key), 2)
  const byQuery = new Map<string, (typeof looked)[number]>()
  uniqueQueries.forEach((q, i) => byQuery.set(q, looked[i]))

  // 對照表：activity → by id；accommodation → by dayIndex
  const actPhoto = new Map<string, string>()
  const actCoord = new Map<string, { lat: number; lng: number }>()
  const accPhoto = new Map<number, string>()
  const accCoord = new Map<number, { lat: number; lng: number }>()
  for (const t of targets) {
    const r = byQuery.get(t.query)!
    if (t.kind === 'activity' && t.activityId) {
      if (t.needPhoto && r.photoRef) actPhoto.set(t.activityId, r.photoRef)
      if (t.needCoords && r.lat != null && r.lng != null) actCoord.set(t.activityId, { lat: r.lat, lng: r.lng })
    } else if (t.kind === 'acc') {
      if (t.needPhoto && r.photoRef) accPhoto.set(t.dayIndex, r.photoRef)
      if (t.needCoords && r.lat != null && r.lng != null) accCoord.set(t.dayIndex, { lat: r.lat, lng: r.lng })
    }
  }
  if (actPhoto.size + actCoord.size + accPhoto.size + accCoord.size === 0) return 0

  // 重讀後依 id 合併（避免覆蓋處理期間的編輯），只補仍缺的、不覆寫既有
  const { data: fresh } = await db.from('itineraries').select('data').eq('id', itineraryId).single()
  if (!fresh?.data) return 0
  const data = fresh.data as Itinerary

  let applied = 0
  const newDays = data.days.map((day) => {
    let changed = false
    const activities = day.activities.map((a) => {
      let na = a
      const ref = actPhoto.get(a.id)
      if (ref && !na.photoRef) { na = { ...na, photoRef: ref }; changed = true; applied++ }
      const co = actCoord.get(a.id)
      if (co && !hasCoords(na.location)) {
        na = { ...na, location: { ...co, address: na.location?.address } }
        changed = true; applied++
      }
      return na
    })
    let accommodation = day.accommodation
    if (accommodation) {
      const ref = accPhoto.get(day.dayIndex)
      if (ref && !accommodation.photoRef) { accommodation = { ...accommodation, photoRef: ref }; changed = true; applied++ }
      const co = accCoord.get(day.dayIndex)
      if (co && !hasCoords(accommodation.location)) {
        accommodation = { ...accommodation, location: { ...co, address: accommodation.location?.address } }
        changed = true; applied++
      }
    }
    return changed ? { ...day, activities, accommodation } : day
  })

  if (applied === 0) return 0
  await db.from('itineraries').update({ data: { ...data, days: newDays } }).eq('id', itineraryId)
  return applied
}
