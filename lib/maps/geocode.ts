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
 * 將單一文字地點轉成座標。失敗回傳 null（不拋錯，避免中斷整批處理）。
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
