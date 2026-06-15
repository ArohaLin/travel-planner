/**
 * 精選推薦 + 願望清單型別
 *
 * 精選推薦採「靜態策展」模型：長期存我方策展欄位 + google_place_id；
 * 評分/營業/照片等易變事實顯示時可用 google_place_id 即時補（避免過時、符合 Places 條款）。
 */

export type RecommendationCategory = '景點' | '美食' | '住宿' | '親子'

export interface Recommendation {
  id: string
  region: string
  category: RecommendationCategory
  subCategory: string | null
  name: string
  googlePlaceId: string
  lat: number | null
  lng: number | null
  address: string | null
  /** 我方精選短評（非 Google 內容）；longlist 為空字串 */
  editorialReason: string
  /** best_for：親子友善 / 海景 / 雨天備案… */
  tags: string[]
  /** 佐證徽章：觀光署 / 必比登 / 媒體x3… */
  sourceBadges: string[]
  /** 綜合可信度分數（排序用） */
  credibility: number
  /** 建置時快照（列表預覽 / 排序用；顯示真相以即時為準） */
  ratingSnapshot: number | null
  reviewsSnapshot: number | null
  photoRef: string | null
  status: 'published' | 'hidden'
  /** featured = 人工策展精選；longlist = 名額外漏網之魚（僅依評價排序） */
  tier: 'featured' | 'longlist'
  builtAt: string
}

export type WishlistSource = 'recommendation' | 'search' | 'paste_link'

export interface WishlistItem {
  id: string
  itineraryId: string
  addedBy: string | null
  source: WishlistSource
  recommendationId: string | null
  googlePlaceId: string | null
  name: string
  category: string | null
  lat: number | null
  lng: number | null
  photoRef: string | null
  note: string | null
  status: 'open' | 'added'
  createdAt: string
}

/** DB（snake_case）→ 前端（camelCase）映射工具 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRecommendation(row: any): Recommendation {
  return {
    id: row.id,
    region: row.region,
    category: row.category,
    subCategory: row.sub_category ?? null,
    name: row.name,
    googlePlaceId: row.google_place_id,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    address: row.address ?? null,
    editorialReason: row.editorial_reason,
    tags: row.tags ?? [],
    sourceBadges: row.source_badges ?? [],
    credibility: row.credibility ?? 0,
    ratingSnapshot: row.rating_snapshot ?? null,
    reviewsSnapshot: row.reviews_snapshot ?? null,
    photoRef: row.photo_ref ?? null,
    status: row.status,
    tier: (row.tier ?? 'featured') as 'featured' | 'longlist',
    builtAt: row.built_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapWishlistItem(row: any): WishlistItem {
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    addedBy: row.added_by ?? null,
    source: row.source,
    recommendationId: row.recommendation_id ?? null,
    googlePlaceId: row.google_place_id ?? null,
    name: row.name,
    category: row.category ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    photoRef: row.photo_ref ?? null,
    note: row.note ?? null,
    status: row.status,
    createdAt: row.created_at,
  }
}
