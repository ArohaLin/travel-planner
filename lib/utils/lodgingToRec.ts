import type { Recommendation, RecommendationCategory } from '@/lib/types/recommendation'

/** lodging_research.city ("台東市" / "台東縣") → recommendations.region ("台東") */
export function cityToRegion(city: string | null, district?: string | null): string {
  const c = (city ?? '').replace(/縣$|市$/, '')
  return c || (district ?? '').replace(/[鄉鎮市區]$/, '')
}

/** lodging_research.category (自由文字) → RecommendationCategory */
export function mapLodgingCategory(cat: string): RecommendationCategory {
  if (!cat) return '景點'
  if (cat === '住宿' || cat.includes('飯店') || cat.includes('民宿') || cat.includes('旅館')) return '住宿'
  if (/美食|餐廳|咖啡|小吃|料理|便當/.test(cat)) return '美食'
  return '景點'
}

function parseSuitableTags(suitable: string | null): string[] {
  if (!suitable) return []
  return suitable.split(/[；、，,;\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
}

/**
 * 把 lodging_research DB 列對映成 Recommendation。
 * id 以 "lodging:" 為前綴，便於 ExploreSheet 區分來源並正確存願望清單。
 * tier：rating ≥ 4.5 且 reviews ≥ 100 → featured（精選推薦），其餘 → longlist。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLodgingToRecommendation(row: any): Recommendation {
  const rating = row.rating != null ? Number(row.rating) : null
  const reviews: number | null = row.total_reviews ?? null
  const tier: 'featured' | 'longlist' =
    rating != null && rating >= 4.5 && reviews != null && reviews >= 100 ? 'featured' : 'longlist'

  const region = cityToRegion(row.city ?? null, row.district ?? null)
  const tags = [...parseSuitableTags(row.suitable_for as string | null), '已深入研究']
  const features = row.features as Record<string, unknown> | null
  const editorialReason =
    (row.verdict as string | null) ?? (features?.summary as string | null) ?? ''

  return {
    id: `lodging:${row.id as string}`,
    region,
    category: mapLodgingCategory((row.category as string) ?? ''),
    subCategory: (row.category as string) ?? null,
    name: (row.name as string) ?? '',
    googlePlaceId: (row.google_place_id as string) ?? '',
    lat: null,
    lng: null,
    address: (row.address as string | null) ?? null,
    editorialReason,
    tags,
    sourceBadges: [],
    credibility: rating ?? 0,
    ratingSnapshot: rating,
    reviewsSnapshot: reviews,
    photoRef: (row.photo_ref as string | null) ?? null,
    status: 'published',
    tier,
    builtAt: (row.researched_at as string) ?? new Date().toISOString(),
  }
}
