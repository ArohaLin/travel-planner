import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { findPlace, mapPool, getServerMapsKey } from '@/lib/maps/places'
import { fetchAndStoreActivityPhotos } from '@/lib/maps/activityPhotos'
import { generateBrochureCopy } from '@/lib/ai/brochureCopy'
import type { GeoLocation, Itinerary } from '@/lib/types/itinerary'
import type { BrochureCache, BrochurePlace, BrochurePoint, ShareStatus } from '@/lib/types/brochure'

// 產生宣傳冊要打數十次 Places + 一次 AI 文案，放寬執行時限
export const maxDuration = 120

function hasCoords(loc?: GeoLocation | null): boolean {
  return !!loc && (loc.lat !== 0 || loc.lng !== 0)
}

/** 兩點直線距離（公里，Haversine） */
function haversineKm(a: BrochurePoint, b: BrochurePoint): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
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
  existingPhotoRef: string | null // 景點/住宿已快取的照片 ref（背景抓圖後）；有就不再打 Places
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
    existingPhotoRef: null,
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
        existingPhotoRef: a.photoRef ?? null,
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
        existingPhotoRef: day.accommodation.photoRef ?? null,
      })
    }
  }

  // 查 Places：只在「還缺照片或缺座標」時才打（景點照片多半已在背景抓圖時取得 → 大幅省呼叫）
  const results = await mapPool(
    lookups,
    async (lk) => {
      const needPhoto = !lk.existingPhotoRef
      const needCoords = lk.dayIndex >= 0 && !lk.existing
      if (!key || (!needPhoto && !needCoords)) return { photoRef: null, lat: null, lng: null }
      return findPlace(lk.query, key)
    },
    5,
  )

  const photos: Record<string, BrochurePlace> = {}
  const dayPointsMap = new Map<number, { order: number; point: BrochurePoint }[]>()

  lookups.forEach((lk, idx) => {
    const r = results[idx]
    photos[lk.cacheKey] = { photoRef: lk.existingPhotoRef ?? r.photoRef }

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

  // 整理每天點位（依順序）+ 旅程總覽（每天取第一點、標日次）+ 距離概估
  const dayPoints: Record<number, BrochurePoint[]> = {}
  const overviewPoints: BrochurePoint[] = []
  const dayKm: Record<number, number> = {}
  let totalKm = 0
  for (const day of itin.days) {
    const arr = (dayPointsMap.get(day.dayIndex) ?? []).sort((a, b) => a.order - b.order).map((x) => x.point)
    if (arr.length > 0) {
      dayPoints[day.dayIndex] = arr
      overviewPoints.push({ label: String(day.dayIndex + 1), lat: arr[0].lat, lng: arr[0].lng })
      // 當天各點依序的直線距離合計
      let km = 0
      for (let i = 1; i < arr.length; i++) km += haversineKm(arr[i - 1], arr[i])
      // 接續前一天最後一點 → 當天第一點（跨日移動）
      const prevDay = overviewPoints.length >= 2 ? dayPoints[day.dayIndex - 1] : undefined
      if (prevDay && prevDay.length) km += haversineKm(prevDay[prevDay.length - 1], arr[0])
      dayKm[day.dayIndex] = Math.round(km)
      totalKm += km
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    coverPhotoRef: photos['cover']?.photoRef ?? null,
    photos,
    dayPoints,
    overviewPoints,
    dayKm,
    totalKm: Math.round(totalKm),
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

  // 先補抓尚缺的景點照片並寫回 data（景點卡與宣傳冊共用），再以最新 data 建快取
  await fetchAndStoreActivityPhotos(db, params.id).catch(() => {})
  const { data: fresh } = await db.from('itineraries').select('data').eq('id', params.id).single()
  const freshData = (fresh?.data ?? row.data) as Itinerary

  // 地圖快取與 AI 文案並行（兩者都吃 freshData）
  const [baseCache, copy] = await Promise.all([
    buildBrochureCache(freshData, getServerMapsKey()),
    generateBrochureCopy(freshData),
  ])
  const cache: BrochureCache = { ...baseCache, copy }

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
