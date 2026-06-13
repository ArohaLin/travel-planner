import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { findPlace, mapPool, getServerMapsKey } from '@/lib/maps/places'
import type { GeoLocation, Itinerary } from '@/lib/types/itinerary'
import type { BrochureCache, BrochurePlace, BrochurePoint, ShareStatus } from '@/lib/types/brochure'

// 產生宣傳冊可能要打數十次 Places（每景點一次），放寬執行時限
export const maxDuration = 60

function hasCoords(loc?: GeoLocation | null): boolean {
  return !!loc && (loc.lat !== 0 || loc.lng !== 0)
}

function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/share/${token}`
}

/** 一個待查地點：景點 / 住宿 / 封面 */
interface Lookup {
  cacheKey: string // photos 的 key（`${dayIndex}:${activityId}` / `${dayIndex}:acc` / 'cover'）
  query: string
  dayIndex: number // 封面用 -1
  order: number // 當天順序（決定地圖標記號碼）；封面 -1
  existing: { lat: number; lng: number } | null // 既有座標（優先採用，省一次查詢偏差）
}

/**
 * 產生宣傳冊快取：抓每個景點/住宿/封面的照片 reference，並組出每天地圖點位。
 * 座標優先沿用行程既有的 location（已被地圖快取過的），Places 查到的當 fallback。
 * 無金鑰時不打任何網路：照片全 null、地圖點位仍可由既有座標組出。
 */
async function buildBrochureCache(itin: Itinerary, key: string | null): Promise<BrochureCache> {
  const lookups: Lookup[] = []

  // 封面：以目的地查一張代表照
  lookups.push({
    cacheKey: 'cover',
    query: `${itin.metadata.destination} 風景`,
    dayIndex: -1,
    order: -1,
    existing: null,
  })

  // 每天：景點（依時間排序）+ 住宿
  for (const day of itin.days) {
    const acts = [...day.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    acts.forEach((a, i) => {
      lookups.push({
        cacheKey: `${day.dayIndex}:${a.id}`,
        query: [a.title, a.placeLabel, day.city].filter(Boolean).join(' '),
        dayIndex: day.dayIndex,
        order: i,
        existing: hasCoords(a.location) ? { lat: a.location!.lat, lng: a.location!.lng } : null,
      })
    })
    if (day.accommodation) {
      lookups.push({
        cacheKey: `${day.dayIndex}:acc`,
        query: `${day.accommodation.name} ${day.city}`,
        dayIndex: day.dayIndex,
        order: acts.length,
        existing: hasCoords(day.accommodation.location)
          ? { lat: day.accommodation.location.lat, lng: day.accommodation.location.lng }
          : null,
      })
    }
  }

  // 查 Places（有金鑰才打）：同時拿照片 + 座標
  const results = await mapPool(
    lookups,
    async (lk) => (key ? findPlace(lk.query, key) : { photoRef: null, lat: null, lng: null }),
    5,
  )

  const photos: Record<string, BrochurePlace> = {}
  const dayPointsMap = new Map<number, { order: number; point: BrochurePoint }[]>()

  lookups.forEach((lk, idx) => {
    const r = results[idx]
    photos[lk.cacheKey] = { photoRef: r.photoRef }

    if (lk.dayIndex < 0) return // 封面不進地圖

    const lat = lk.existing?.lat ?? r.lat
    const lng = lk.existing?.lng ?? r.lng
    if (lat == null || lng == null) return // 無座標 → 不畫此點

    const isAcc = lk.cacheKey.endsWith(':acc')
    const point: BrochurePoint = {
      label: isAcc ? '宿' : String(lk.order + 1),
      lat,
      lng,
    }
    if (!dayPointsMap.has(lk.dayIndex)) dayPointsMap.set(lk.dayIndex, [])
    dayPointsMap.get(lk.dayIndex)!.push({ order: lk.order, point })
  })

  // 整理每天點位（依順序）+ 旅程總覽（每天取第一點、標日次）
  const dayPoints: Record<number, BrochurePoint[]> = {}
  const overviewPoints: BrochurePoint[] = []
  for (const day of itin.days) {
    const arr = (dayPointsMap.get(day.dayIndex) ?? []).sort((a, b) => a.order - b.order).map((x) => x.point)
    if (arr.length > 0) {
      dayPoints[day.dayIndex] = arr
      overviewPoints.push({ label: String(day.dayIndex + 1), lat: arr[0].lat, lng: arr[0].lng })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    coverPhotoRef: photos['cover']?.photoRef ?? null,
    photos,
    dayPoints,
    overviewPoints,
  }
}

interface ShareRow {
  data: Itinerary
  public_share: boolean
  share_token: string | null
  brochure_cache: BrochureCache | null
}

/** 共用：驗證登入 + owner 權限，回傳 db 與行程列。失敗回傳 NextResponse。 */
async function authOwner(id: string) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, id, user.id)
  if (access.effectiveRole !== 'owner') {
    return { error: NextResponse.json({ error: '只有建立者或管理者可以管理分享' }, { status: 403 }) }
  }
  const { data: row } = await db
    .from('itineraries')
    .select('data, public_share, share_token, brochure_cache')
    .eq('id', id)
    .single()
  if (!row) return { error: NextResponse.json({ error: '行程不存在' }, { status: 404 }) }
  return { db, row: row as ShareRow }
}

function statusOf(row: ShareRow): ShareStatus {
  const enabled = row.public_share && !!row.share_token
  return {
    enabled,
    token: row.share_token,
    url: row.share_token ? shareUrl(row.share_token) : null,
    generatedAt: row.brochure_cache?.generatedAt ?? null,
    photoCount: row.brochure_cache
      ? Object.values(row.brochure_cache.photos).filter((p) => p.photoRef).length
      : 0,
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await authOwner(params.id)
  if ('error' in r) return r.error
  return NextResponse.json(statusOf(r.row))
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await authOwner(params.id)
  if ('error' in r) return r.error
  const { db, row } = r

  const { action } = (await req.json().catch(() => ({}))) as {
    action?: 'enable' | 'disable' | 'regenerate'
  }

  if (action === 'disable') {
    await db.from('itineraries').update({ public_share: false }).eq('id', params.id)
    return NextResponse.json({ ...statusOf({ ...row, public_share: false }) })
  }

  // enable / regenerate：重建快取、發 token、開啟公開
  const token = action === 'regenerate' || !row.share_token ? nanoid(24) : row.share_token
  const cache = await buildBrochureCache(row.data, getServerMapsKey())

  const { error } = await db
    .from('itineraries')
    .update({ public_share: true, share_token: token, brochure_cache: cache })
    .eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: '產生宣傳冊失敗' }, { status: 500 })
  }

  return NextResponse.json(
    statusOf({ ...row, public_share: true, share_token: token, brochure_cache: cache }),
  )
}
