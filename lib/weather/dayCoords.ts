import type { ItineraryDay } from '@/lib/types/itinerary'

/** 當天代表座標：第一個有座標的景點，否則住宿；都沒有則 null */
export function dayCoords(day: ItineraryDay): { lat: number; lng: number } | null {
  for (const a of day.activities) {
    const l = a.location
    if (l && (l.lat !== 0 || l.lng !== 0)) return { lat: l.lat, lng: l.lng }
  }
  const ac = day.accommodation?.location
  if (ac && (ac.lat !== 0 || ac.lng !== 0)) return { lat: ac.lat, lng: ac.lng }
  return null
}

/** 與 useWeather 一致的請求 key（座標 3 位小數 + 日期）*/
export function weatherKey(lat: number, lng: number, date: string): string {
  return `/api/weather?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&date=${date}`
}
