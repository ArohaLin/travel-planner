import type { Itinerary, Activity } from '@/lib/types/itinerary'

/**
 * 全行程移動緩衝掃描：統計「留的時間 < 實際路程（紅）」與「< 建議預留（黃）」的段數。
 * 配對邏輯與行程卡（DayView TravelRow）、AI prompt 路程摘要（buildTravelTimeSection）一致：
 * 每段 Google 路段（travelLegs，toId = 目的活動）對上「前一張交通卡時長」或「兩活動間的空檔」。
 */

export interface BufferScanResult {
  red: number
  amber: number
  /** red + amber */
  total: number
}

const toMinutes = (t?: string): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * 與 DayView modeInfo 一致：船/火車/飛機/巴士/步行/單車視為非開車，不做開車緩衝比對。
 * 優先看 transportMode；沒填才退回標題（標題常含「候船」等誤導字）。機車視同開車比對。
 */
function isNonDriving(a?: Activity): boolean {
  if (!a) return false
  const mode = a.transportMode?.trim() ?? ''
  const s = mode || (a.title ?? '')
  if (/機車|摩托車|scooter/i.test(s)) return false
  return /船|渡輪|ferry|火車|鐵路|台鐵|高鐵|train|飛機|航班|機場|flight|巴士|公車|客運|bus|步行|走路|徒步|walk|單車|腳踏車|自行車|bike/i.test(s)
}

export function scanBufferWarnings(itinerary: Itinerary): BufferScanResult {
  let red = 0
  let amber = 0

  for (const day of itinerary.days) {
    const legs = day.travelLegs ?? []
    const acts = day.activities

    for (const leg of legs) {
      if (leg.meters < 50) continue
      const googleMin = Math.round(leg.seconds / 60)
      if (googleMin < 3) continue

      let allottedMin: number | null = null
      if (leg.toId === 'accommodation') {
        const last = acts[acts.length - 1]
        if (last?.type === 'transport') continue // 交通卡已涵蓋（與 DayView showAccommodationTravel 一致）
        const e = toMinutes(last?.endTime ?? last?.startTime)
        const c = toMinutes(day.accommodation?.checkInTime)
        if (e != null && c != null && c > e) allottedMin = c - e
      } else {
        const idx = acts.findIndex((a) => a.id === leg.toId)
        if (idx < 0) continue
        const prev = idx > 0 ? acts[idx - 1] : undefined
        if (prev?.type === 'transport') {
          if (isNonDriving(prev)) continue // 船/火車等班次型交通不比開車時間
          const s = toMinutes(prev.startTime)
          const e = toMinutes(prev.endTime)
          if (s != null && e != null && e > s) allottedMin = e - s
        } else if (prev) {
          const e = toMinutes(prev.endTime ?? prev.startTime)
          const s = toMinutes(acts[idx].startTime)
          if (e != null && s != null && s > e) allottedMin = s - e
        }
      }

      if (allottedMin == null || allottedMin <= 0) continue
      const comfortable = googleMin + Math.min(Math.max(googleMin * 0.5, 5), 15)
      if (allottedMin < googleMin) red++
      else if (allottedMin < comfortable) amber++
    }
  }

  return { red, amber, total: red + amber }
}
