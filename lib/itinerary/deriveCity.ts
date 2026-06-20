import type { ItineraryDay } from '@/lib/types/itinerary'

/**
 * 從台灣地址字串萃取顯示用城市名。
 * 離島（綠島、蘭嶼等）優先用島名，一般用縣市名（臺→台正規化）。
 */
function extractDisplayCity(address: string): string | null {
  if (!address) return null
  const clean = address.replace(/^\d+/, '').trim()

  // 離島特例：地址含島名 → 用島名取代縣名（避免「台東縣綠島鄉」顯示成「台東縣」）
  const islands = ['綠島', '蘭嶼', '小琉球', '澎湖', '金門', '馬祖']
  for (const island of islands) {
    if (clean.includes(island)) return island
  }

  // 一般縣市（2–5字 + 市/縣）
  const m = clean.match(/^(.{2,5}[市縣])/)
  if (m) return m[1].replace(/^臺/, '台')

  return null
}

/**
 * 推導當天顯示城市：
 * 1. 住宿地址（若有）→ 萃取城市
 * 2. 當日最後一個非交通活動的地址 → 萃取城市
 * 3. fallback：AI 存入的 day.city
 *
 * 比直接用 day.city 更準確：AI 調整後偶爾忘記更新 city 欄位。
 */
export function deriveDayCity(day: ItineraryDay): string {
  // 1. 住宿地址
  const accAddr = day.accommodation?.location?.address
  if (accAddr) {
    const c = extractDisplayCity(accAddr)
    if (c) return c
  }

  // 2. 最後一個有地址的非交通活動
  const nonTransport = (day.activities ?? []).filter((a) => a.type !== 'transport')
  for (let i = nonTransport.length - 1; i >= 0; i--) {
    const addr = nonTransport[i].location?.address
    if (addr) {
      const c = extractDisplayCity(addr)
      if (c) return c
    }
  }

  // 3. fallback
  return day.city || ''
}
