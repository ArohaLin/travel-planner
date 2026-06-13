import { NextResponse } from 'next/server'
import { getServerMapsKey, placePhotoUrl, placeholderSvg } from '@/lib/maps/places'

/**
 * 共用景點照片 proxy：/api/photo?ref=<Google photoRef>
 *
 * 卡片詳情視窗與宣傳冊「共用同一個端點、以 photoRef 為快取鍵」→
 * 同一張照片不論出現在哪、被誰看，整站只向 Google 取一次（之後吃 CDN）。
 *
 * - 公開（middleware 放行）：景點照片是 Google 的公開內容、非使用者私密資料；
 *   photoRef 為不可枚舉的長字串，且只有我們資料內的 ref 才有意義 → 濫用風險低。
 * - 以 ref 當鍵 + immutable：內容穩定，重新產生宣傳冊若 ref 沒變則 CDN 不需重抓。
 */

// 瀏覽器 1 天、Vercel CDN 30 天；ref 對應固定圖片 → immutable
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=2592000, immutable',
}

function svgResponse(): NextResponse {
  const { body, contentType } = placeholderSvg('photo')
  return new NextResponse(body, { headers: { 'Content-Type': contentType, ...CACHE_HEADERS } })
}

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get('ref') ?? ''
  const key = getServerMapsKey()
  // 基本防呆：ref 太短視為無效（Google photo reference 為長字串）
  if (!ref || ref.length < 20 || !key) return svgResponse()

  try {
    const res = await fetch(placePhotoUrl(ref, key))
    if (!res.ok) return svgResponse()
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        ...CACHE_HEADERS,
      },
    })
  } catch {
    return svgResponse()
  }
}
