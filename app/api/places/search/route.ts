import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getServerMapsKey } from '@/lib/maps/places'
import { mapRecommendation, type Recommendation } from '@/lib/types/recommendation'

/**
 * 地點搜尋：同時回「我方策展清單命中」＋「Google Places 即時結果」。
 * - 任何登入者可用。
 * - q：搜尋字詞（≥2 字）；near：行程目的地（用來比對策展 region，可空）。
 * - 策展命中置頂、標 tier；Google 結果去除與策展重複的 place_id。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const near = (searchParams.get('near') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ curated: [], places: [] })

  const db = createServiceRoleClient()

  // 1) 策展清單命中（名稱模糊比對；near 有值時限該地區）
  const { data: recRows } = await db
    .from('recommendations').select('*').eq('status', 'published').ilike('name', `%${q}%`)
  const curated = (recRows ?? [])
    .map(mapRecommendation)
    .filter((r: Recommendation) => !near || near.includes(r.region))
    .slice(0, 8)
  const curatedPlaceIds = new Set(curated.map((r: Recommendation) => r.googlePlaceId))

  // 2) Google Places Text Search（即時）
  const key = getServerMapsKey()
  let places: Array<{
    placeId: string; name: string; address: string | null
    rating: number | null; reviews: number | null
    photoRef: string | null; lat: number | null; lng: number | null
  }> = []
  if (key) {
    const query = near && !q.includes(near) ? `${q} ${near}` : q
    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json' +
      `?query=${encodeURIComponent(query)}&language=zh-TW&region=tw&key=${key}`
    try {
      const res = await fetch(url)
      if (res.ok) {
        const j = await res.json() as {
          results?: Array<{
            place_id?: string; name?: string; formatted_address?: string
            rating?: number; user_ratings_total?: number
            photos?: Array<{ photo_reference?: string }>
            geometry?: { location?: { lat: number; lng: number } }
          }>
        }
        places = (j.results ?? [])
          .filter((p) => p.place_id && !curatedPlaceIds.has(p.place_id))
          .slice(0, 12)
          .map((p) => ({
            placeId: p.place_id!,
            name: p.name ?? '',
            address: p.formatted_address ?? null,
            rating: p.rating ?? null,
            reviews: p.user_ratings_total ?? null,
            photoRef: p.photos?.[0]?.photo_reference ?? null,
            lat: p.geometry?.location?.lat ?? null,
            lng: p.geometry?.location?.lng ?? null,
          }))
      }
    } catch {
      // 查詢失敗就只回策展結果
    }
  }

  return NextResponse.json({ curated, places })
}
