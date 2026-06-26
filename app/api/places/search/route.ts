import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getServerMapsKey } from '@/lib/maps/places'
import { mapRecommendation, type Recommendation } from '@/lib/types/recommendation'
import { mapLodgingToRecommendation, cityToRegion } from '@/lib/utils/lodgingToRec'

/**
 * 地點搜尋：同時回「我方策展清單命中」＋「Google Places 即時結果」。
 * - 任何登入者可用。
 * - q：搜尋字詞（≥2 字）；near：行程目的地（用來比對策展 region，可空）。
 * - 策展命中置頂、標 tier；Google 結果去除與策展重複的 place_id。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const near = (searchParams.get('near') ?? '').trim()
  // region：'all' 或地區名（來自地區選擇器）。指定時優先用它限定策展與偏向 Google 查詢。
  const region = (searchParams.get('region') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ curated: [], places: [] })

  const db = createServiceRoleClient()

  // 1) 策展清單命中（名稱模糊比對）
  //    指定地區（非 all）→ 限該區；否則用目的地文字 near 比對地區（全部則不限）。
  const [recResult, lodgingResult] = await Promise.all([
    db.from('recommendations').select('*').eq('status', 'published').ilike('name', `%${q}%`),
    db.from('lodging_research')
      .select('id, google_place_id, name, category, city, district, address, rating, total_reviews, photo_ref, verdict, suitable_for, researched_at, features')
      .ilike('name', `%${q}%`)
      .order('rating', { ascending: false })
      .limit(8),
  ])

  const curated = (recResult.data ?? [])
    .map(mapRecommendation)
    .filter((r: Recommendation) =>
      region && region !== 'all' ? r.region === region : (!near || near.includes(r.region)))
    .slice(0, 8)
  const curatedPlaceIds = new Set(curated.map((r: Recommendation) => r.googlePlaceId))

  // 也納入 lodging_research 命中（去重，依地區篩選）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lodgingCurated = (lodgingResult.data ?? []).filter((lr: any) => {
    if (!lr.google_place_id || curatedPlaceIds.has(lr.google_place_id)) return false
    if (region && region !== 'all') return cityToRegion(lr.city, lr.district) === region
    if (near) { const rgn = cityToRegion(lr.city, lr.district); return !rgn || near.includes(rgn) }
    return true
  }).slice(0, 5).map(mapLodgingToRecommendation)

  const allCurated = [...curated, ...lodgingCurated]
  // 讓 Google 搜尋去除所有已策展項目（含 lodging）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lodgingCurated.forEach((lc: any) => curatedPlaceIds.add(lc.googlePlaceId as string))

  // 2) Google Places Text Search（即時）
  const key = getServerMapsKey()
  let places: Array<{
    placeId: string; name: string; address: string | null
    rating: number | null; reviews: number | null
    photoRef: string | null; lat: number | null; lng: number | null
  }> = []
  if (key) {
    // 偏向地區：明確選的地區優先，否則用目的地文字
    const bias = region && region !== 'all' ? region : near
    const query = bias && !q.includes(bias) ? `${q} ${bias}` : q
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

  return NextResponse.json({ curated: allCurated, places })
}
