/**
 * Server 端 Google Maps 工具（宣傳冊用）
 *
 * 與 lib/maps/geocode.ts（client 端 Maps JS Geocoder）不同，這裡是「伺服器」呼叫
 * Google Web Service API：Places「findplacefromtext」一次拿到照片 reference + 座標，
 * 以及 Static Maps 圖片網址組裝。
 *
 * ⚠️ 金鑰建議用「不限 HTTP referrer」的 server key（GOOGLE_MAPS_SERVER_KEY）；
 *    referrer 限制的 NEXT_PUBLIC 金鑰用於瀏覽器端，server 端無 referer 會被拒。
 *    本機通常無限制可共用，故 fallback 到 NEXT_PUBLIC_GOOGLE_MAPS_KEY。
 */

import type { BrochurePoint } from '@/lib/types/brochure'

export function getServerMapsKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || null
}

export interface PlaceLookup {
  placeId: string | null
  photoRef: string | null
  lat: number | null
  lng: number | null
}

/**
 * 用文字查 Places，回傳第一個候選的照片 reference 與座標。
 * 查無 / 失敗一律回 null 欄位，絕不拋錯（避免中斷整批產生）。
 */
export async function findPlace(query: string, key: string): Promise<PlaceLookup> {
  const empty: PlaceLookup = { placeId: null, photoRef: null, lat: null, lng: null }
  const q = query.trim()
  if (!q) return empty

  const url =
    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(q)}` +
    '&inputtype=textquery' +
    '&fields=place_id,geometry,photos' +
    '&language=zh-TW&region=tw' +
    `&key=${key}`

  try {
    const res = await fetch(url)
    if (!res.ok) return empty
    const json = (await res.json()) as {
      status?: string
      candidates?: Array<{
        geometry?: { location?: { lat: number; lng: number } }
        photos?: Array<{ photo_reference?: string }>
      }>
    }
    const c = json.candidates?.[0]
    if (!c) return empty
    return {
      placeId: (c as { place_id?: string }).place_id ?? null,
      photoRef: c.photos?.[0]?.photo_reference ?? null,
      lat: c.geometry?.location?.lat ?? null,
      lng: c.geometry?.location?.lng ?? null,
    }
  } catch {
    return empty
  }
}

/** 限制併發的批次處理（避免 OVER_QUERY_LIMIT） */
export async function mapPool<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

/** 取得 Places 照片的實際圖片網址（proxy 會 fetch 此網址再串流回前端） */
export function placePhotoUrl(photoRef: string, key: string, maxWidth = 1000): string {
  return (
    'https://maps.googleapis.com/maps/api/place/photo' +
    `?maxwidth=${maxWidth}` +
    `&photo_reference=${encodeURIComponent(photoRef)}` +
    `&key=${key}`
  )
}

/**
 * 組裝 Static Maps 圖片網址：依序的編號標記 + 連接路線（直線）。
 * 「簡化靜態地圖」風格：不打 Directions，僅用點位畫順序與連線。
 */
export function staticMapUrl(
  points: BrochurePoint[],
  key: string,
  opts: { width?: number; height?: number } = {},
): string | null {
  if (points.length === 0) return null
  const width = opts.width ?? 640
  const height = opts.height ?? 360
  const BRAND = '0x7c3aed' // 紫，與品牌一致

  const params = [
    `size=${width}x${height}`,
    'scale=2',
    'maptype=roadmap',
    'language=zh-TW',
    'region=tw',
  ]

  // 路線（直線連接，半透明紫）
  if (points.length >= 2) {
    const path = points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|')
    params.push(`path=color:0x7c3aedaa|weight:3|${path}`)
  }

  // 每點一個標記；標籤僅支援單一英數字元，>9 改用無標籤小點
  points.forEach((p, i) => {
    const coord = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
    if (i < 9) {
      params.push(`markers=color:${BRAND}|label:${i + 1}|${coord}`)
    } else {
      params.push(`markers=size:tiny|color:${BRAND}|${coord}`)
    }
  })

  params.push(`key=${key}`)
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`
}

/** 失敗時回傳的優雅 SVG 佔位（讓公開頁不需 client onError、版面不破） */
export function placeholderSvg(
  kind: 'photo' | 'map',
  w = 640,
  h = 360,
): { body: string; contentType: string } {
  const grad =
    kind === 'photo'
      ? ['#ede9fe', '#ddd6fe', '#c4b5fd']
      : ['#eef2ff', '#e0e7ff', '#c7d2fe']
  const icon = kind === 'photo' ? '✦' : '🗺'
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${grad[0]}"/>
    <stop offset="0.5" stop-color="${grad[1]}"/>
    <stop offset="1" stop-color="${grad[2]}"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="50%" y="50%" font-size="${Math.round(h / 6)}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" opacity="0.7">${icon}</text>
</svg>`
  return { body, contentType: 'image/svg+xml; charset=utf-8' }
}
