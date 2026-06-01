'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps'

export interface MapPoint {
  lat: number
  lng: number
  /** marker 上顯示的順序號（多天時可能是 "2-3" 之類） */
  label: string
  title: string
  time?: string
  kind: 'activity' | 'accommodation'
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
      {days.map((day) => (
        <DayRoute key={day.dayIndex} day={day} onSelect={(point) => setSelected({ point, color: day.color })} />
      ))}

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
            {selected.point.time && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {selected.point.kind === 'accommodation' ? '住宿' : selected.point.time}
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
  onSelect,
}: {
  day: MapDay
  onSelect: (point: MapPoint) => void
}) {
  const map = useMap()

  // 路線折線（依順序連接景點）
  useEffect(() => {
    if (!map || day.points.length < 2) return
    const polyline = new google.maps.Polyline({
      path: day.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeColor: day.color,
      strokeOpacity: 0.85,
      strokeWeight: 3,
      icons: [
        {
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.4, fillOpacity: 1, strokeWeight: 0, fillColor: day.color },
          offset: '50%',
          repeat: '120px',
        },
      ],
    })
    polyline.setMap(map)
    return () => polyline.setMap(null)
  }, [map, day])

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
                : google.maps.SymbolPath.CIRCLE,
            scale: point.kind === 'accommodation' ? 1 : 13,
            fillColor: day.color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
            labelOrigin:
              point.kind === 'accommodation'
                ? new google.maps.Point(0, 0)
                : undefined,
          }}
        />
      ))}
    </>
  )
}
