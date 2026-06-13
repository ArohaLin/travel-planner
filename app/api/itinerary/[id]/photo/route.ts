import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { getServerMapsKey, placePhotoUrl, placeholderSvg } from '@/lib/maps/places'
import type { Itinerary } from '@/lib/types/itinerary'

/**
 * 登入版景點照片 proxy：/api/itinerary/<id>/photo?activityId=<id>（或 ?acc=<dayIndex>）
 * 驗證存取權限後，由行程 data 取該景點 photoRef，伺服器端帶金鑰向 Google 取圖再串流。
 * 與公開版 /api/share/[token]/photo 分開：此處需登入且檢查行程存取權。
 */

// 私有快取（auth-gated，不給共用 CDN 快取）
const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=86400' }

function svgResponse(): NextResponse {
  const { body, contentType } = placeholderSvg('photo')
  return new NextResponse(body, { headers: { 'Content-Type': contentType, ...CACHE_HEADERS } })
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const url = new URL(req.url)
  const activityId = url.searchParams.get('activityId')
  const accDay = url.searchParams.get('acc')

  const { data: row } = await db.from('itineraries').select('data').eq('id', params.id).single()
  if (!row?.data) return svgResponse()
  const itin = row.data as Itinerary

  let photoRef: string | undefined
  if (activityId) {
    for (const d of itin.days) {
      const a = d.activities.find((x) => x.id === activityId)
      if (a) { photoRef = a.photoRef; break }
    }
  } else if (accDay != null) {
    const d = itin.days.find((x) => x.dayIndex === Number(accDay))
    photoRef = d?.accommodation?.photoRef
  }

  const key = getServerMapsKey()
  if (!photoRef || !key) return svgResponse()

  try {
    const res = await fetch(placePhotoUrl(photoRef, key))
    if (!res.ok) return svgResponse()
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'image/jpeg', ...CACHE_HEADERS },
    })
  } catch {
    return svgResponse()
  }
}
