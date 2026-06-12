import type { GeoLocation } from '@/lib/types/itinerary'

/**
 * Client-side geocoding（使用 Google Maps JS Geocoder）
 *
 * 為什麼用 client-side？
 * API key 設有 HTTP referrer 限制，server-side 呼叫（無 referer header）會被拒絕。
 * 改在瀏覽器端用 Maps JS Geocoder 取得座標，再持久化回 DB。
 */

export interface GeocodeInput {
  /** 用於查詢的文字（優先用 location，fallback 用 title/name） */
  query: string
  /** 目的地，用於提高查詢精準度（例如「台東」） */
  region?: string
}

let geocoder: google.maps.Geocoder | null = null

function getGeocoder(): google.maps.Geocoder {
  if (!geocoder) {
    geocoder = new google.maps.Geocoder()
  }
  return geocoder
}

/**
 * 從地址字串抽出最具體的行政區（鄉/鎮/區，其次縣轄市/市），用來驗證 geocode 結果是否定位到對的地方。
 * 例：「951台東縣綠島鄉溫泉路167號」→「綠島鄉」。先正規化「臺→台」避免異體字誤判。
 */
function extractLocality(s: string): string | null {
  const t = s.replace(/臺/g, '台')
  const town = t.match(/(?:縣|市)([一-龥]{2,3}(?:鄉|鎮|區))/)
  if (town) return town[1]
  const city = t.match(/([一-龥]{2,3}市)/)
  if (city) return city[1]
  return null
}

/**
 * 將單一文字地點轉成座標。失敗回傳 null（不拋錯，避免中斷整批處理）。
 *
 * 座標合理性驗證：若查詢字串含明確的鄉鎮市，但 Geocoder 回傳的地址「不在同一個鄉鎮市」，
 * 視為定位錯誤（例：綠島景點被定位到台東本島知本）→ 拒用、回 null。
 * 寧可該點暫時無座標（地圖上少一個點），也不要標到錯誤位置。
 */
export async function geocodeOne(input: GeocodeInput): Promise<GeoLocation | null> {
  const address = input.region ? `${input.query} ${input.region}` : input.query
  if (!address.trim()) return null

  try {
    const result = await getGeocoder().geocode({
      address,
      // 偏向台灣結果
      region: 'TW',
    })
    const first = result.results[0]
    if (!first) return null

    // 防呆 #3：拒絕「退回行政區中心」的 fallback。
    // 我們查的是具體地點，但 Google 找不到時會配到「縣/市/鄉/鎮/區/郵遞區號」中心點
    // （例：嘉義的『耐斯王子飯店』在台東找不到 → 退回台東市中心）。
    // 這種結果的 types 只有行政區、沒有任何「具體地點」型別 → 視為定位失敗、拒用。
    const types = first.types ?? []
    const PLACE_TYPES = [
      'establishment', 'point_of_interest', 'premise', 'subpremise', 'street_address',
      'route', 'intersection', 'park', 'natural_feature', 'tourist_attraction',
      'transit_station', 'airport', 'lodging', 'food', 'store',
    ]
    const AREA_TYPES = [
      'locality', 'sublocality', 'postal_code', 'political', 'country',
      'administrative_area_level_1', 'administrative_area_level_2',
      'administrative_area_level_3', 'administrative_area_level_4',
    ]
    const isAreaOnly =
      types.length > 0 &&
      types.some((t) => AREA_TYPES.includes(t)) &&
      !types.some((t) => PLACE_TYPES.includes(t))
    if (isAreaOnly) {
      return null // 只配到行政區中心 → 不是真正的地點
    }

    // 合理性驗證（只在查詢含明確鄉鎮市、且結果為中文地址時進行，避免語言/格式造成誤判）
    const expect = extractLocality(input.query)
    const formatted = first.formatted_address ?? ''
    if (expect && /[一-龥]/.test(formatted)) {
      if (!formatted.replace(/臺/g, '台').includes(expect)) {
        return null // 定位到不同鄉鎮市 → 拒用
      }
    }

    const loc = first.geometry.location
    return {
      lat: loc.lat(),
      lng: loc.lng(),
      address: first.formatted_address,
    }
  } catch {
    return null
  }
}

/**
 * 批次 geocode，限制併發避免觸發 rate limit（OVER_QUERY_LIMIT）。
 */
export async function geocodeBatch(
  inputs: GeocodeInput[],
  concurrency = 3,
): Promise<(GeoLocation | null)[]> {
  const results: (GeoLocation | null)[] = new Array(inputs.length).fill(null)
  let cursor = 0

  async function worker() {
    while (cursor < inputs.length) {
      const idx = cursor++
      results[idx] = await geocodeOne(inputs[idx])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, worker)
  await Promise.all(workers)
  return results
}
