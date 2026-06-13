import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServerMapsKey, placePhotoUrl, placeholderSvg } from '@/lib/maps/places'
import type { BrochureCache } from '@/lib/types/brochure'

/**
 * 公開照片 proxy：/api/share/<token>/photo?k=<cacheKey>
 * 由 brochure_cache 取 photoRef，伺服器端帶金鑰向 Google 取圖再串流回傳，
 * 金鑰永不外露。查無 / 失敗回優雅 SVG 佔位，讓宣傳冊版面不破。
 */

const CACHE_HEADERS = {
  // 瀏覽器 1 天、Vercel CDN 30 天：重複瀏覽不再回打 Google（成本保護）
  'Cache-Control': 'public, max-age=86400, s-maxage=2592000',
}

function svgResponse(): NextResponse {
  const { body, contentType } = placeholderSvg('photo')
  return new NextResponse(body, { headers: { 'Content-Type': contentType, ...CACHE_HEADERS } })
}

export async function GET(
  req: Request,
  { params }: { params: { token: string } },
) {
  const k = new URL(req.url).searchParams.get('k') ?? ''

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('itineraries')
    .select('public_share, brochure_cache')
    .eq('share_token', params.token)
    .maybeSingle()

  if (!row || !row.public_share) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const cache = row.brochure_cache as BrochureCache | null
  const photoRef = cache?.photos?.[k]?.photoRef ?? null
  const key = getServerMapsKey()
  if (!photoRef || !key) return svgResponse()

  try {
    const res = await fetch(placePhotoUrl(photoRef, key))
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
