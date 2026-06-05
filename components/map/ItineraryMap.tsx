'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'

export interface MapPoint {
  lat: number
  lng: number
  /** marker 上顯示的順序號（多天時可能是 "2-3" 之類） */
  label: string
  title: string
  time?: string
  /** activity=圓形景點；accommodation=當晚住宿方形；origin=當天路線起點（出發地/前晚住宿）菱形 */
  kind: 'activity' | 'accommodation' | 'origin'
}

export interface MapDay {
  dayIndex: number
  color: string
  points: MapPoint[]
}

interface ItineraryMapProps {
  days: MapDay[]
}

const TAIWAN_CENTER = { lat: 23.6978, lng: 120.9605 }

// marker 直徑約 31px（半徑 scale 13 + 邊框）；中心需相距 ≥ COLLIDE_PX 才不重疊
const COLLIDE_PX = 38

/** 兩經緯度間的直線距離（公里），Haversine 公式 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** 距離文字：≥1km 顯示「6.2 km」，否則「800 m」 */
function formatKm(km: number): string {
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`
}

/** 公尺 → 距離文字：≥1km 顯示「23.4 km」，否則「850 m」 */
function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

/** 秒 → 時間文字：「35 分」或「1 時 5 分」 */
function formatSeconds(s: number): string {
  const min = Math.round(s / 60)
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 時 ${m} 分` : `${h} 時`
}

/** 一天的開車路線：真實道路路徑 + 每段（leg）的距離/時間標籤 */
interface DrivingRoute {
  path: { lat: number; lng: number }[]
  legs: { text: string; pos: { lat: number; lng: number } }[]
}

// 開車路線快取（以「原始座標」為鍵，與 zoom 無關 → 縮放、切換天數來回都不會重打 Directions API）
// 注意：本檔案的 `Map` 名稱被 @vis.gl 的地圖元件佔用，這裡用 globalThis.Map 取原生 Map。
const routeCache = new globalThis.Map<string, DrivingRoute>()

function routeKey(points: MapPoint[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
}

/** 直線距離標籤（Directions 失敗時的退回方案，例如無法開車到達） */
function straightLabels(
  points: MapPoint[],
): { text: string; pos: { lat: number; lng: number } }[] {
  const out: { text: string; pos: { lat: number; lng: number } }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
    if (km < 0.05) continue
    out.push({
      text: formatKm(km),
      pos: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
    })
  }
  return out
}

/** 建立一個距離/時間膠囊 overlay（白底圓角，隨地圖平移/縮放跟著動） */
function makeDistancePill(
  map: google.maps.Map,
  text: string,
  pos: { lat: number; lng: number },
  color: string,
): google.maps.OverlayView {
  let div: HTMLDivElement | null = null
  const ov = new google.maps.OverlayView()
  ov.onAdd = () => {
    div = document.createElement('div')
    div.textContent = text
    div.style.cssText = [
      'position:absolute',
      'transform:translate(-50%,-50%)',
      'background:rgba(255,255,255,0.95)',
      `color:${color}`,
      `border:1px solid ${color}`,
      'border-radius:9999px',
      'padding:1px 6px',
      'font-size:11px',
      'font-weight:700',
      'line-height:1.4',
      'white-space:nowrap',
      'box-shadow:0 1px 3px rgba(0,0,0,0.25)',
      'pointer-events:none',
    ].join(';')
    ov.getPanes()?.floatPane.appendChild(div)
  }
  ov.draw = () => {
    const proj = ov.getProjection()
    if (!proj || !div) return
    const p = proj.fromLatLngToDivPixel(new google.maps.LatLng(pos.lat, pos.lng))
    if (p) {
      div.style.left = `${p.x}px`
      div.style.top = `${p.y}px`
    }
  }
  ov.onRemove = () => {
    div?.remove()
    div = null
  }
  ov.setMap(map)
  return ov
}

/**
 * 像素級散開：把在「當前 zoom 的螢幕投影」下會重疊的 marker 散開，
 * 隨 zoom 動態重算 —— 放大時點還原真實位置、縮小時自動散開，永不重疊。
 *
 * 原理：用 Google Maps 投影把經緯度 → 世界座標（0~256），乘 2^zoom 得螢幕像素。
 * 同群（像素距離 < COLLIDE_PX）的點以群中心為圓心、用足夠像素半徑排成圓圈，再轉回經緯度。
 */
function spreadByPixels(
  days: MapDay[],
  projection: google.maps.Projection,
  zoom: number,
): MapDay[] {
  const scale = Math.pow(2, zoom) // 1 世界座標單位 = scale 像素
  type Ref = { d: number; p: number }
  // 轉成像素座標
  const all: { px: number; py: number; ref: Ref }[] = []
  days.forEach((day, d) =>
    day.points.forEach((pt, p) => {
      const world = projection.fromLatLngToPoint(new google.maps.LatLng(pt.lat, pt.lng))
      if (!world) return
      all.push({ px: world.x * scale, py: world.y * scale, ref: { d, p } })
    }),
  )

  const moved = days.map((day) => day.points.map((pt) => ({ ...pt })))
  const used = new Array(all.length).fill(false)

  for (let i = 0; i < all.length; i++) {
    if (used[i]) continue
    const group = [i]
    used[i] = true
    // 用「擴張式」分群：任何與群內某點過近的點都納入
    for (let j = 0; j < all.length; j++) {
      if (used[j] || j === i) continue
      const tooClose = group.some((k) => {
        const dx = all[k].px - all[j].px
        const dy = all[k].py - all[j].py
        return Math.hypot(dx, dy) < COLLIDE_PX
      })
      if (tooClose) {
        group.push(j)
        used[j] = true
        j = -1 // 重新掃描，讓鏈式相鄰都納入同群
      }
    }
    if (group.length < 2) continue

    // 群中心（像素）
    const cx = group.reduce((s, k) => s + all[k].px, 0) / group.length
    const cy = group.reduce((s, k) => s + all[k].py, 0) / group.length
    // 圓圈半徑：讓相鄰 marker 間距 ≥ COLLIDE_PX
    const n = group.length
    const radiusPx = Math.max(COLLIDE_PX / (2 * Math.sin(Math.PI / n)), COLLIDE_PX * 0.6)

    group.forEach((k, idx) => {
      const angle = (2 * Math.PI * idx) / n
      const npx = cx + radiusPx * Math.cos(angle)
      const npy = cy + radiusPx * Math.sin(angle)
      // 像素 → 世界座標 → 經緯度
      const world = new google.maps.Point(npx / scale, npy / scale)
      const latLng = projection.fromPointToLatLng(world)
      if (!latLng) return
      const { d, p } = all[k].ref
      moved[d][p].lat = latLng.lat()
      moved[d][p].lng = latLng.lng()
    })
  }

  return days.map((day, d) => ({ ...day, points: moved[d] }))
}

export function ItineraryMap({ days }: ItineraryMapProps) {
  return (
    <Map
      defaultCenter={TAIWAN_CENTER}
      defaultZoom={8}
      gestureHandling="greedy"
      disableDefaultUI={false}
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <MapContent days={days} />
    </Map>
  )
}

function MapContent({ days: rawDays }: ItineraryMapProps) {
  const map = useMap()
  const [selected, setSelected] = useState<{ point: MapPoint; color: string } | null>(null)
  // 當前 zoom，用來觸發像素級散開重算
  const [zoom, setZoom] = useState<number | null>(null)

  // 原始座標（未散開），用於 fitBounds
  const rawPoints = useMemo(() => rawDays.flatMap((d) => d.points), [rawDays])

  // 監聽 zoom 變化 → 重算散開
  useEffect(() => {
    if (!map) return
    const update = () => setZoom(map.getZoom() ?? null)
    update()
    const listener = map.addListener('zoom_changed', update)
    return () => listener.remove()
  }, [map])

  // 依當前 zoom 做像素級散開（投影需要 map 已就緒）
  const days = useMemo(() => {
    if (!map || zoom == null) return rawDays
    const projection = map.getProjection()
    if (!projection) return rawDays
    return spreadByPixels(rawDays, projection, zoom)
  }, [map, zoom, rawDays])

  const allPoints = days.flatMap((d) => d.points)

  // 自動縮放到所有可見景點（用原始座標）
  useEffect(() => {
    if (!map || rawPoints.length === 0) return
    if (rawPoints.length === 1) {
      map.setCenter({ lat: rawPoints[0].lat, lng: rawPoints[0].lng })
      map.setZoom(14)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    for (const p of rawPoints) bounds.extend({ lat: p.lat, lng: p.lng })
    map.fitBounds(bounds, 64)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(rawPoints.map((p) => [p.lat, p.lng]))])

  return (
    <>
      {days.map((day) => {
        // 路線/距離以「原始座標」計算（rawDays），marker 顯示用散開後座標（day）。
        const rawDay = rawDays.find((d) => d.dayIndex === day.dayIndex) ?? day
        return (
          <DayRoute
            key={day.dayIndex}
            day={day}
            rawDay={rawDay}
            onSelect={(point) => setSelected({ point, color: day.color })}
          />
        )
      })}

      {selected && (
        <InfoWindow
          position={{ lat: selected.point.lat, lng: selected.point.lng }}
          onCloseClick={() => setSelected(null)}
          pixelOffset={[0, -36]}
        >
          <div style={{ minWidth: 140, padding: '2px 4px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
              {selected.point.title}
            </div>
            {(selected.point.time || selected.point.kind !== 'activity') && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {selected.point.kind === 'accommodation'
                  ? '住宿'
                  : selected.point.kind === 'origin'
                    ? '路線起點'
                    : selected.point.time}
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  )
}

function DayRoute({
  day,
  rawDay,
  onSelect,
}: {
  day: MapDay
  rawDay: MapDay
  onSelect: (point: MapPoint) => void
}) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const [route, setRoute] = useState<DrivingRoute | null>(null)
  const [failed, setFailed] = useState(false)

  // 取得開車路線（真實道路 + 每段距離/時間）。以「原始座標」為快取鍵，
  // 故 zoom in/out 不會觸發新的 Directions 請求、不產生費用。
  useEffect(() => {
    if (!routesLib || rawDay.points.length < 2) {
      setRoute(null)
      setFailed(false)
      return
    }
    // origin + destination + waypoints 數量上限約 25，超過就退回直線
    if (rawDay.points.length > 25) {
      setRoute(null)
      setFailed(true)
      return
    }
    const key = routeKey(rawDay.points)
    const cached = routeCache.get(key)
    if (cached) {
      setRoute(cached)
      setFailed(false)
      return
    }

    let cancelled = false
    setRoute(null)
    setFailed(false)
    const service = new routesLib.DirectionsService()
    const pts = rawDay.points
    service
      .route({
        origin: { lat: pts[0].lat, lng: pts[0].lng },
        destination: { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng },
        waypoints: pts.slice(1, -1).map((p) => ({
          location: { lat: p.lat, lng: p.lng },
          stopover: true,
        })),
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .then((res) => {
        if (cancelled) return
        const r = res.routes[0]
        if (!r) {
          setFailed(true)
          return
        }
        const legs: DrivingRoute['legs'] = r.legs.map((leg) => {
          // 取該段道路路徑的中點當標籤位置（落在實際道路上，而非兩端直線中點）
          const lp: google.maps.LatLng[] = []
          leg.steps?.forEach((s) => s.path?.forEach((pt) => lp.push(pt)))
          const m = lp.length ? lp[Math.floor(lp.length / 2)] : null
          const pos = m
            ? { lat: m.lat(), lng: m.lng() }
            : {
                lat: (leg.start_location.lat() + leg.end_location.lat()) / 2,
                lng: (leg.start_location.lng() + leg.end_location.lng()) / 2,
              }
          const dist = formatMeters(leg.distance?.value ?? 0)
          const dur = formatSeconds(leg.duration?.value ?? 0)
          return { text: `${dist}・約 ${dur}`, pos }
        })
        const drv: DrivingRoute = {
          path: r.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
          legs,
        }
        routeCache.set(key, drv)
        setRoute(drv)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) {
          setRoute(null)
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [routesLib, rawDay])

  // 路線折線：有開車路線就畫真實道路；Directions 失敗才退回直線連接。
  // 載入中（route 尚未回來且未失敗）先不畫線，等結果一次顯示。
  useEffect(() => {
    if (!map) return
    const path = route
      ? route.path
      : failed && rawDay.points.length >= 2
        ? rawDay.points.map((p) => ({ lat: p.lat, lng: p.lng }))
        : null
    if (!path || path.length < 2) return
    const polyline = new google.maps.Polyline({
      path,
      strokeColor: day.color,
      strokeOpacity: 0.85,
      strokeWeight: 3,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.4,
            fillOpacity: 1,
            strokeWeight: 0,
            fillColor: day.color,
          },
          offset: '50%',
          repeat: '120px',
        },
      ],
    })
    polyline.setMap(map)
    return () => polyline.setMap(null)
  }, [map, route, failed, rawDay, day.color])

  // 距離/時間標籤：有開車路線顯示「23.4 km・約 35 分」；失敗退回直線距離。
  useEffect(() => {
    if (!map) return
    const labels = route ? route.legs : failed ? straightLabels(rawDay.points) : []
    if (labels.length === 0) return
    const overlays = labels.map((l) => makeDistancePill(map, l.text, l.pos, day.color))
    return () => overlays.forEach((o) => o.setMap(null))
  }, [map, route, failed, rawDay, day.color])

  return (
    <>
      {day.points.map((point, i) => (
        <Marker
          key={`${day.dayIndex}-${i}`}
          position={{ lat: point.lat, lng: point.lng }}
          onClick={() => onSelect(point)}
          label={{
            text: point.label,
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: '700',
          }}
          icon={{
            path:
              point.kind === 'accommodation'
                ? // 住宿用方形標記
                  'M -12 -12 H 12 V 12 H -12 Z'
                : point.kind === 'origin'
                  ? // 起點（出發地 / 前晚住宿）用菱形標記
                    'M 0 -13 L 13 0 L 0 13 L -13 0 Z'
                  : google.maps.SymbolPath.CIRCLE,
            scale: point.kind === 'activity' ? 13 : 1,
            fillColor: day.color,
            fillOpacity: point.kind === 'origin' ? 0.9 : 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
            labelOrigin:
              point.kind === 'activity'
                ? undefined
                : new google.maps.Point(0, 0),
          }}
        />
      ))}
    </>
  )
}
