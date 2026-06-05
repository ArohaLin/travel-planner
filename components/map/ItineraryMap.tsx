'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { TravelLeg } from '@/lib/types/itinerary'
import {
  getOrComputeRoute,
  signatureFor,
  legText,
  toPersistLegs,
  type PersistLeg,
} from '@/lib/maps/route'

export interface MapPoint {
  lat: number
  lng: number
  /** marker 上顯示的順序號（多天時可能是 "2-3" 之類） */
  label: string
  title: string
  time?: string
  /** activity=圓形景點；accommodation=當晚住宿方形；origin=當天路線起點（出發地/前晚住宿）菱形 */
  kind: 'activity' | 'accommodation' | 'origin'
  /** 對應的識別碼：activity.id、'accommodation' 或 'origin' */
  id: string
}

/** 寫回 DB 用的整天路線（距離/時間 + 編碼折線 + 簽章） */
export interface PersistDayRoute {
  dayIndex: number
  legs: PersistLeg[]
  polyline: string
  sig: string
}

export interface MapDay {
  dayIndex: number
  color: string
  points: MapPoint[]
  /** DB 已存的路線資料（sig 相符即可直接重用，免打 Directions） */
  stored?: { sig?: string; polyline?: string; legs?: TravelLeg[] }
}

/** 距離/時間標籤的層級模式：置頂（蓋在 marker 上）/ 下層（在 marker 下）/ 隱藏 */
export type DistanceMode = 'top' | 'below' | 'hidden'

interface ItineraryMapProps {
  days: MapDay[]
  /** 距離/時間標籤層級：置頂 / 下層 / 隱藏（地圖上可即時輪替，不重打 API） */
  distanceMode: DistanceMode
  /** 某天算出開車路線後回呼（供上層寫回 DB） */
  onRoute?: (payload: PersistDayRoute) => void
}

const TAIWAN_CENTER = { lat: 23.6978, lng: 120.9605 }

// marker 直徑約 31px（半徑 scale 13 + 邊框）；中心需相距 ≥ COLLIDE_PX 才不重疊
const COLLIDE_PX = 38

/** 距離標籤顯示門檻：同一段路小於此公里數就不顯示（短程沒意義、也讓畫面更乾淨） */
const MIN_LABEL_KM = 5

/** 兩經緯度間的直線距離（公里），Haversine 公式（Directions 失敗時的退回方案用） */
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

function formatKm(km: number): string {
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`
}

/** 直線距離標籤（Directions 失敗時的退回方案，例如無法開車到達） */
function straightLabels(points: MapPoint[]): { text: string; pos: { lat: number; lng: number } }[] {
  const out: { text: string; pos: { lat: number; lng: number } }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
    if (km < MIN_LABEL_KM) continue
    out.push({ text: formatKm(km), pos: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 } })
  }
  return out
}

/**
 * 建立一個距離/時間膠囊 overlay（白底圓角，隨地圖平移/縮放跟著動）。
 * pane='floatPane' → 置頂（蓋在 marker 上）；pane='overlayLayer' → 在 marker 下層。
 */
function makeDistancePill(
  map: google.maps.Map,
  text: string,
  pos: { lat: number; lng: number },
  color: string,
  pane: 'floatPane' | 'overlayLayer',
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
    ov.getPanes()?.[pane].appendChild(div)
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
 * 像素級散開：把在「當前 zoom 的螢幕投影」下會重疊的 marker 散開，隨 zoom 動態重算。
 */
function spreadByPixels(
  days: MapDay[],
  projection: google.maps.Projection,
  zoom: number,
): MapDay[] {
  const scale = Math.pow(2, zoom)
  type Ref = { d: number; p: number }
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
        j = -1
      }
    }
    if (group.length < 2) continue

    const cx = group.reduce((s, k) => s + all[k].px, 0) / group.length
    const cy = group.reduce((s, k) => s + all[k].py, 0) / group.length
    const n = group.length
    const radiusPx = Math.max(COLLIDE_PX / (2 * Math.sin(Math.PI / n)), COLLIDE_PX * 0.6)

    group.forEach((k, idx) => {
      const angle = (2 * Math.PI * idx) / n
      const npx = cx + radiusPx * Math.cos(angle)
      const npy = cy + radiusPx * Math.sin(angle)
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

export function ItineraryMap({ days, distanceMode, onRoute }: ItineraryMapProps) {
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
      <MapContent days={days} distanceMode={distanceMode} onRoute={onRoute} />
    </Map>
  )
}

function MapContent({ days: rawDays, distanceMode, onRoute }: ItineraryMapProps) {
  const map = useMap()
  const [selected, setSelected] = useState<{ point: MapPoint; color: string } | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)

  const rawPoints = useMemo(() => rawDays.flatMap((d) => d.points), [rawDays])

  useEffect(() => {
    if (!map) return
    const update = () => setZoom(map.getZoom() ?? null)
    update()
    const listener = map.addListener('zoom_changed', update)
    return () => listener.remove()
  }, [map])

  const days = useMemo(() => {
    if (!map || zoom == null) return rawDays
    const projection = map.getProjection()
    if (!projection) return rawDays
    return spreadByPixels(rawDays, projection, zoom)
  }, [map, zoom, rawDays])

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
            distanceMode={distanceMode}
            onRoute={onRoute}
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

/** 給 polyline/labels 渲染用的整天路線（不論來自 DB 重用或現算） */
interface RenderRoute {
  path: { lat: number; lng: number }[]
  labels: { text: string; meters: number; pos: { lat: number; lng: number } }[]
}

function DayRoute({
  day,
  rawDay,
  distanceMode,
  onRoute,
  onSelect,
}: {
  day: MapDay
  rawDay: MapDay
  distanceMode: DistanceMode
  onRoute?: (payload: PersistDayRoute) => void
  onSelect: (point: MapPoint) => void
}) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const geometryLib = useMapsLibrary('geometry')
  const [route, setRoute] = useState<RenderRoute | null>(null)
  const [failed, setFailed] = useState(false)

  // 取得整天開車路線：優先重用 DB（sig 相符 → 解碼折線、不打 API），否則呼叫 Directions。
  // 以原始座標為基準，zoom in/out 不會觸發重抓。
  useEffect(() => {
    if (rawDay.points.length < 2) {
      setRoute(null)
      setFailed(false)
      return
    }
    const currentSig = signatureFor(rawDay.points)

    // 1) DB 已有且新鮮 → 解碼直接用
    const stored = rawDay.stored
    if (stored?.sig && stored.sig === currentSig && stored.polyline && geometryLib) {
      const path = geometryLib.encoding
        .decodePath(stored.polyline)
        .map((p) => ({ lat: p.lat(), lng: p.lng() }))
      const labels = (stored.legs ?? [])
        .filter((l) => typeof l.midLat === 'number' && typeof l.midLng === 'number')
        .map((l) => ({
          text: legText(l.meters, l.seconds),
          meters: l.meters,
          pos: { lat: l.midLat as number, lng: l.midLng as number },
        }))
      setRoute({ path, labels })
      setFailed(false)
      return
    }

    // 2) 否則呼叫 Directions（同 session 同簽章會命中共用快取，不重複打）
    if (!routesLib) return
    let cancelled = false
    setRoute(null)
    setFailed(false)
    getOrComputeRoute(routesLib, rawDay.points)
      .then((computed) => {
        if (cancelled) return
        if (!computed) {
          setFailed(true)
          return
        }
        setRoute({
          path: computed.path,
          labels: computed.legs.map((l) => ({ text: l.text, meters: l.meters, pos: l.pos })),
        })
        setFailed(false)
        onRoute?.({
          dayIndex: rawDay.dayIndex,
          legs: toPersistLegs(computed),
          polyline: computed.polyline,
          sig: computed.sig,
        })
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
    // onRoute 不列依賴：只在實際抓取時於 .then 內呼叫一次，不應因上層重繪而重抓。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesLib, geometryLib, rawDay])

  // 路線折線：有路線就畫；Directions 失敗才退回直線。載入中先不畫線，等結果。
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

  // 距離/時間標籤：層級依 distanceMode；該段 < MIN_LABEL_KM 公里不顯示。
  useEffect(() => {
    if (!map || distanceMode === 'hidden') return
    const pane = distanceMode === 'top' ? 'floatPane' : 'overlayLayer'
    const labels = route
      ? route.labels.filter((l) => l.meters >= MIN_LABEL_KM * 1000)
      : failed
        ? straightLabels(rawDay.points)
        : []
    if (labels.length === 0) return
    const overlays = labels.map((l) => makeDistancePill(map, l.text, l.pos, day.color, pane))
    return () => overlays.forEach((o) => o.setMap(null))
  }, [map, route, failed, rawDay, day.color, distanceMode])

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
                ? 'M -12 -12 H 12 V 12 H -12 Z'
                : point.kind === 'origin'
                  ? 'M 0 -13 L 13 0 L 0 13 L -13 0 Z'
                  : google.maps.SymbolPath.CIRCLE,
            scale: point.kind === 'activity' ? 13 : 1,
            fillColor: day.color,
            fillOpacity: point.kind === 'origin' ? 0.9 : 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
            labelOrigin:
              point.kind === 'activity' ? undefined : new google.maps.Point(0, 0),
          }}
        />
      ))}
    </>
  )
}
