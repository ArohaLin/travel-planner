/** 住宿深入研究（lodging-review 技能離線產出，存 lodging_research 表）。 */

export interface ProCon {
  point: string
  systematic: boolean
  mentions: number
  pct: number
  quote: string | null
}

export interface StarDist {
  star: number
  count: number
  percent: number
}

export interface LodgingCoverage {
  是否完整涵蓋近一年?: boolean
  最舊評論_約月前?: number
  近一年內則數?: number
  備註?: string
}

export interface LodgingResearch {
  id: string
  googlePlaceId: string
  name: string
  city: string | null
  district: string | null
  address: string | null
  rating: number | null
  totalReviews: number | null
  starClass: string | null
  lastYearAvg: number | null
  lastYearCount: number | null
  lastYearDist: StarDist[] | null
  pros: ProCon[]
  cons: ProCon[]
  verdict: string | null
  suitableFor: string | null
  notFor: string | null
  confidence: string | null
  queryName: string | null
  resolvedName: string | null
  photoRef: string | null
  coverage: LodgingCoverage | null
  model: string | null
  researchedAt: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapLodging(r: any): LodgingResearch {
  return {
    id: r.id,
    googlePlaceId: r.google_place_id,
    name: r.name,
    city: r.city ?? null,
    district: r.district ?? null,
    address: r.address ?? null,
    rating: r.rating != null ? Number(r.rating) : null,
    totalReviews: r.total_reviews ?? null,
    starClass: r.star_class ?? null,
    lastYearAvg: r.last_year_avg != null ? Number(r.last_year_avg) : null,
    lastYearCount: r.last_year_count ?? null,
    lastYearDist: r.last_year_dist ?? null,
    pros: Array.isArray(r.pros) ? r.pros : [],
    cons: Array.isArray(r.cons) ? r.cons : [],
    verdict: r.verdict ?? null,
    suitableFor: r.suitable_for ?? null,
    notFor: r.not_for ?? null,
    confidence: r.confidence ?? null,
    queryName: r.query_name ?? null,
    resolvedName: r.resolved_name ?? null,
    photoRef: r.photo_ref ?? null,
    coverage: r.coverage ?? null,
    model: r.model ?? null,
    researchedAt: r.researched_at,
  }
}
