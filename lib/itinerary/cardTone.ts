/** 行程卡（簡潔風時間軸）共用的類型色調與時間/距離格式化。純模組，client/server 皆可 import。 */

/** 活動類型 → 軸點色（dot）、停留膠囊配色（pill）、中文標籤。住宿另用 emerald（非活動類型）。 */
export const TYPE_TONE: Record<string, { dot: string; pill: string; label: string }> = {
  sightseeing: { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700', label: '景點' },
  nature: { dot: 'bg-green-500', pill: 'bg-green-50 text-green-700', label: '自然' },
  experience: { dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-700', label: '體驗' },
  food: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', label: '餐飲' },
  shopping: { dot: 'bg-pink-500', pill: 'bg-pink-50 text-pink-700', label: '購物' },
  rest: { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', label: '休息' },
  transport: { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', label: '交通' },
  other: { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', label: '其他' },
}

export function toneFor(type: string) {
  return TYPE_TONE[type] ?? TYPE_TONE.other
}

/** 公尺 → 「8.2 km」/「600 m」；無效回 null。 */
export function fmtKm(meters?: number | null): string | null {
  if (!meters || meters < 1) return null
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters / 10) * 10} m`
}

/** 停留時長文字（膠囊用）。優先用起迄時間差，其次 duration 欄位。 */
export function stayText(startMin: number | null, endMin: number | null, durationField?: number): string | null {
  let min: number | null = null
  if (startMin != null && endMin != null && endMin > startMin) min = endMin - startMin
  else if (durationField && durationField > 0) min = durationField
  if (min == null) return null
  if (min < 60) return `停留 ${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `停留 ${h} 小時 ${m} 分` : `停留 ${h} 小時`
}
