import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServerMapsKey, staticMapUrl, placeholderSvg } from '@/lib/maps/places'
import type { BrochureCache, BrochurePoint } from '@/lib/types/brochure'

/**
 * 公開靜態地圖 proxy：/api/share/<token>/map?day=<n|overview>
 * 由 brochure_cache 取點位，伺服器端帶金鑰向 Google Static Maps 取圖再串流回傳。
 * 查無點位 / 失敗回優雅 SVG 佔位。
 */

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=2592000',
}

function svgResponse(): NextResponse {
  const { body, contentType } = placeholderSvg('map')
  return new NextResponse(body, { headers: { 'Content-Type': contentType, ...CACHE_HEADERS } })
}

export async function GET(
  req: Request,
  { params }: { params: { token: string } },
) {
  const dayParam = new URL(req.url).searchParams.get('day') ?? ''

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
  const key = getServerMapsKey()
  if (!cache || !key) return svgResponse()

  let points: BrochurePoint[] = []
  if (dayParam === 'overview') {
    points = cache.overviewPoints ?? []
  } else {
    const day = Number(dayParam)
    if (Number.isInteger(day)) points = cache.dayPoints?.[day] ?? []
  }

  const url = staticMapUrl(points, key, dayParam === 'overview' ? { height: 420 } : {})
  if (!url) return svgResponse()

  try {
    const res = await fetch(url)
    if (!res.ok) return svgResponse()
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        ...CACHE_HEADERS,
      },
    })
  } catch {
    return svgResponse()
  }
}
