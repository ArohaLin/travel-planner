import type { ItineraryDay } from '@/lib/types/itinerary'

/**
 * 願望清單「最適合的天＋時段」建議（A/B 共用）。
 * 依真實座標算「離哪一天的行程最近」，並把插入時段排在當天**離它最近的活動之後**，
 * 而不是硬塞當天結尾。純前端運算，免 AI。
 */

export interface Slot {
  dayIndex: number
  /** 建議開始時間 HH:MM */
  startTime: string
  /** 接在哪個活動之後（顯示用） */
  anchorTitle: string | null
  /** 到當天最近活動的直線距離（km）；null = 當天沒有可比座標 */
  distanceKm: number | null
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const la1 = toRad(aLat)
  const la2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fromMin = (x: number) => {
  const v = Math.max(0, Math.min(x, 23 * 60 + 30))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
const hasCoord = (loc?: { lat: number; lng: number } | null) => !!loc && (loc.lat !== 0 || loc.lng !== 0)

/** 計算單一天的建議插入時段（接在離 item 最近的活動之後；無座標則接當天結尾）。 */
function slotForDay(item: { lat: number | null; lng: number | null }, day: ItineraryDay): Slot {
  const acts = [...day.activities]
    .filter((a) => a.type !== 'transport')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  let nearest: { title: string; end: string; d: number } | null = null
  if (item.lat != null && item.lng != null) {
    for (const a of acts) {
      if (hasCoord(a.location)) {
        const d = haversineKm(item.lat, item.lng, a.location!.lat, a.location!.lng)
        const end = a.endTime || fromMin(toMin(a.startTime) + 90)
        if (!nearest || d < nearest.d) nearest = { title: a.placeLabel || a.title, end, d }
      }
    }
  }

  let startTime = '10:00'
  let anchorTitle: string | null = null
  if (nearest) {
    anchorTitle = nearest.title
    startTime = fromMin(toMin(nearest.end) + 15) // 接在最近活動之後約 15 分
  } else if (acts.length) {
    const last = acts[acts.length - 1]
    startTime = fromMin(toMin(last.endTime || last.startTime) + 60)
  }
  return { dayIndex: day.dayIndex, startTime, anchorTitle, distanceKm: nearest ? nearest.d : null }
}

/** 回傳所有天的建議，依「離行程最近」排序（無座標的天排後面）。 */
export function suggestSlots(
  item: { lat: number | null; lng: number | null },
  days: ItineraryDay[],
): Slot[] {
  return days
    .map((d) => slotForDay(item, d))
    .sort((a, b) => {
      const da = a.distanceKm == null ? Infinity : a.distanceKm
      const db = b.distanceKm == null ? Infinity : b.distanceKm
      return da - db || a.dayIndex - b.dayIndex
    })
}

/** 指定某一天的建議時段（B：從某天加入用）。 */
export function slotForTargetDay(
  item: { lat: number | null; lng: number | null },
  days: ItineraryDay[],
  dayIndex: number,
): Slot | null {
  const day = days.find((d) => d.dayIndex === dayIndex)
  return day ? slotForDay(item, day) : null
}
