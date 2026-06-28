import type { GeoLocation } from '@/lib/types/itinerary'

/** 座標是否可用（非空、有限數字、非 0,0）。 */
function hasCoord(l?: GeoLocation | null): l is GeoLocation {
  return (
    !!l &&
    typeof l.lat === 'number' && isFinite(l.lat) &&
    typeof l.lng === 'number' && isFinite(l.lng) &&
    (l.lat !== 0 || l.lng !== 0)
  )
}

/** 兩經緯度間直線距離（公里），Haversine。 */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const la1 = toRad(aLat)
  const la2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * 兩點「直線概估」——當精確路段（travelLegs，Google Directions 算的）尚未算或已過期時，
 * 移動列改用此概估**誠實顯示**（標「概估」），而非沿用對不上的舊精確值。
 * 時間以市區約 30km/h 概估、最少 5 分。任一端無座標 → 回 null（無從概估）。
 */
export function estimateLeg(from?: GeoLocation | null, to?: GeoLocation | null): { km: number; min: number } | null {
  if (!hasCoord(from) || !hasCoord(to)) return null
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng)
  const min = Math.max(5, Math.round((km / 30) * 60))
  return { km, min }
}
