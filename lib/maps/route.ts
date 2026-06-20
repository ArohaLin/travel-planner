import type { Itinerary, GeoLocation } from '@/lib/types/itinerary'

/**
 * 路線共用邏輯：組裝每天的有序點位、計算輸入指紋（signature）、呼叫 Directions 算路線。
 * 地圖與背景 prefetch 共用此模組，確保兩邊產生「相同的點位與簽章」→ 可正確判斷重用。
 */

export interface RoutePoint {
  /** activity.id / 'accommodation' / 'origin' / 'return'（旅程終點） */
  id: string
  kind: 'origin' | 'activity' | 'accommodation' | 'return'
  lat: number
  lng: number
  /** marker 顯示文字（① 出 宿…）；不影響簽章 */
  label: string
  title: string
  time?: string
}

/** 解析某點座標：優先用既有 location，否則由呼叫端的 cache 補上（回 undefined 表示尚無座標） */
export type CoordResolver = (
  dayIndex: number,
  target: string,
  existing?: GeoLocation | null,
) => GeoLocation | undefined

/** 一段路（寫回 DB 用）：抵達 toId 這站，相對前一站的距離/時間，midLat/midLng 為地圖標籤位置 */
export interface PersistLeg {
  toId: string
  meters: number
  seconds: number
  midLat?: number
  midLng?: number
  /** 該段道路編碼折線（地圖畫線用）；無 = 該段沒有開車路線，地圖改畫直線 */
  polyline?: string
}

/** Directions 算完的整天路線（記憶體用）：逐段，每段含自己的道路折線 */
export interface ComputedRoute {
  legs: {
    toId: string
    meters: number
    seconds: number
    text: string
    pos: { lat: number; lng: number }
    /** 該段道路編碼折線 */
    polyline: string
  }[]
  /** 輸入指紋 */
  sig: string
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function formatSeconds(s: number): string {
  const min = Math.round(s / 60)
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 時 ${m} 分` : `${h} 時`
}

export function legText(meters: number, seconds: number): string {
  return `${formatMeters(meters)}・約 ${formatSeconds(seconds)}`
}

/**
 * 組裝某天的有序點位（出發地/前晚住宿 → 各實際地點 → 當晚住宿），只納入已有座標者。
 * 地圖與 prefetch 都用這支，保證點位與順序一致。
 */
export function buildDayPoints(
  itinerary: Itinerary,
  dayIndex: number,
  resolve: CoordResolver,
): RoutePoint[] {
  const day = itinerary.days.find((d) => d.dayIndex === dayIndex)
  if (!day) return []
  const originCity = itinerary.metadata?.originCity
  const points: RoutePoint[] = []

  // 起點：第一天用出發城市；後續天用「前一晚住宿」
  if (dayIndex === 0) {
    if (originCity) {
      const geo = resolve(0, 'origin', undefined)
      if (geo) {
        points.push({ id: 'origin', kind: 'origin', lat: geo.lat, lng: geo.lng, label: '出', title: `出發：${originCity}` })
      }
    }
  } else {
    const prevDay = itinerary.days.find((d) => d.dayIndex === dayIndex - 1)
    const prevAcc = prevDay?.accommodation
    if (prevAcc) {
      const geo = resolve(dayIndex - 1, 'accommodation', prevAcc.location)
      if (geo) {
        points.push({
          id: 'origin',
          kind: 'origin',
          lat: geo.lat,
          lng: geo.lng,
          label: '出',
          title: `出發：${prevAcc.name}（前晚住宿）`,
        })
      }
    }
  }

  // 實際地點（排除交通類 + 無 placeLabel 的 rest 動作描述），連續編號
  const placeActivities = day.activities.filter(
    (a) => a.type !== 'transport' && !(a.type === 'rest' && !a.placeLabel)
  )
  placeActivities.forEach((a, i) => {
    const geo = resolve(dayIndex, a.id, a.location)
    if (!geo) return
    const time = a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime
    points.push({ id: a.id, kind: 'activity', lat: geo.lat, lng: geo.lng, label: String(i + 1), title: a.title, time })
  })

  // 當晚住宿
  if (day.accommodation) {
    const geo = resolve(dayIndex, 'accommodation', day.accommodation.location)
    if (geo) {
      points.push({
        id: 'accommodation',
        kind: 'accommodation',
        lat: geo.lat,
        lng: geo.lng,
        label: '宿',
        title: day.accommodation.name,
      })
    }
  }

  // 旅程終點（#41）：最後一天且無住宿 → 補返回城市，路線才會延伸到終點
  const lastIndex = Math.max(...itinerary.days.map((d) => d.dayIndex))
  if (dayIndex === lastIndex && !day.accommodation) {
    const returnCity = itinerary.metadata?.returnCity ?? originCity
    if (returnCity) {
      const geo = resolve(dayIndex, 'return', undefined)
      if (geo) {
        points.push({
          id: 'return',
          kind: 'return',
          lat: geo.lat,
          lng: geo.lng,
          label: '終',
          title: `終點：${returnCity}`,
        })
      }
    }
  }

  return points
}

/** 輸入指紋：只取 id + 座標（小數 5 位），與 label/title 無關 → 改順序/座標才會變。
 *  前綴 v2：路線格式改成「逐段折線」，遞增版本讓舊資料簽章不符而自動重算。 */
export function signatureFor(points: { id: string; lat: number; lng: number }[]): string {
  return 'v2|' + points
    .filter((p) => typeof p.lat === 'number' && isFinite(p.lat) && typeof p.lng === 'number' && isFinite(p.lng))
    .map((p) => `${p.id}@${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join('|')
}

// 以 signature 為鍵的記憶體快取：地圖與 prefetch 共用，同 session 同一條路線只打一次 Directions
const memCache = new Map<string, ComputedRoute>()

/** 由 Directions 的單一 leg 組成內部 leg（含道路中點當標籤位置） */
function buildLeg(leg: google.maps.DirectionsLeg, toId: string): ComputedRoute['legs'][number] {
  const lp: google.maps.LatLng[] = []
  leg.steps?.forEach((s) => s.path?.forEach((pt) => lp.push(pt)))
  const m = lp.length ? lp[Math.floor(lp.length / 2)] : null
  const pos = m
    ? { lat: m.lat(), lng: m.lng() }
    : {
        lat: (leg.start_location.lat() + leg.end_location.lat()) / 2,
        lng: (leg.start_location.lng() + leg.end_location.lng()) / 2,
      }
  const meters = leg.distance?.value ?? 0
  const seconds = leg.duration?.value ?? 0
  return { toId, meters, seconds, text: legText(meters, seconds), pos, polyline: encodePolyline(lp) }
}

/** 編碼折線（需 geometry library 已載入；未載入則回空字串，地圖會在 session 內以快取重畫） */
function encodePolyline(path: google.maps.LatLng[]): string {
  try {
    if (typeof google !== 'undefined' && google.maps?.geometry?.encoding) {
      return google.maps.geometry.encoding.encodePath(path)
    }
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * 取得整天開車路線；同簽章已算過則直接回快取（不打 API）。
 * 策略：先用「整天一次」請求（效率最好）；若整天失敗（例如含跨海/無法開車的段，
 * Google 會整批回 ZERO_RESULTS），改「逐段計算」——能開車的段保留距離/時間，
 * 不能開車的段（船/跨海）自動略過，避免一段拖累整天。
 */
export async function getOrComputeRoute(
  routesLib: google.maps.RoutesLibrary,
  points: RoutePoint[],
): Promise<ComputedRoute | null> {
  if (points.length < 2) return null
  const sig = signatureFor(points)
  const hit = memCache.get(sig)
  if (hit) return hit

  const service = new routesLib.DirectionsService()

  // 1) 先試整天一次（waypoint 上限約 25）
  if (points.length <= 25) {
    try {
      const res = await service.route({
        origin: { lat: points[0].lat, lng: points[0].lng },
        destination: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
        waypoints: points.slice(1, -1).map((p) => ({ location: { lat: p.lat, lng: p.lng }, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
      })
      const r = res.routes[0]
      if (r) {
        const computed: ComputedRoute = {
          legs: r.legs.map((leg, i) => buildLeg(leg, points[i + 1]?.id ?? '')),
          sig,
        }
        memCache.set(sig, computed)
        return computed
      }
    } catch {
      /* 整天失敗 → 落到逐段 */
    }
  }

  // 2) 逐段計算：跨海/無法開車的段自動略過（地圖會對這些段改畫直線）
  const legs: ComputedRoute['legs'] = []
  for (let i = 0; i < points.length - 1; i++) {
    try {
      const res = await service.route({
        origin: { lat: points[i].lat, lng: points[i].lng },
        destination: { lat: points[i + 1].lat, lng: points[i + 1].lng },
        travelMode: google.maps.TravelMode.DRIVING,
      })
      const leg = res.routes[0]?.legs?.[0]
      if (!leg) continue
      legs.push(buildLeg(leg, points[i + 1].id))
    } catch {
      /* 該段無法開車（例如跨海），略過 */
    }
  }
  if (legs.length === 0) return null

  const computed: ComputedRoute = { legs, sig }
  memCache.set(sig, computed)
  return computed
}

/** 把 ComputedRoute 轉成寫回 DB 的路段陣列（排除起點本身、保留中點與該段折線） */
export function toPersistLegs(route: ComputedRoute): PersistLeg[] {
  return route.legs
    .filter((l) => l.toId && l.toId !== 'origin')
    .map((l) => ({
      toId: l.toId,
      meters: l.meters,
      seconds: l.seconds,
      midLat: l.pos.lat,
      midLng: l.pos.lng,
      polyline: l.polyline,
    }))
}
