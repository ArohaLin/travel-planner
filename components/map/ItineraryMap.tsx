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

/**
 * 將座標極近（含完全相同，例如 geocode 落到同一個市中心）的 marker 散開，
 * 避免完全疊住看不到數字。以群組中心為圓心，把同群的點平均分布在小圓上。
 * 位移量約 30 公尺，不影響實際判讀但能清楚區分。
 */
const SAME_SPOT_EPS = 0.0006 // 約 60 公尺內視為「同一點」
const SPREAD_RADIUS = 0.00028 // 散開半徑，約 30 公尺

function spreadOverlappingPoints(days: MapDay[]): MapDay[] {
  // 收集所有點（跨天）做整體分群
  type Ref = { d: number; p: number }
  const all: { lat: number; lng: number; ref: Ref }[] = []
  days.forEach((day, d) =>
    day.points.forEach((pt, p) => all.push({ lat: pt.lat, lng: pt.lng, ref: { d, p } })),
  )

  const used = new Array(all.length).fill(false)
  // 複製一份可變座標
  const moved = days.map((day) => day.points.map((pt) => ({ ...pt })))

  for (let i = 0; i < all.length; i++) {
    if (used[i]) continue
    const group = [i]
    used[i] = true
    for (let j = i + 1; j < all.length; j++) {
      if (used[j]) continue
      if (
        Math.abs(all[i].lat - all[j].lat) < SAME_SPOT_EPS &&
        Math.abs(all[i].lng - all[j].lng) < SAME_SPOT_EPS
      ) {
        group.push(j)
        used[j] = true
      }
    }
    if (group.length < 2) continue
    // 同群多點 → 以群中心為圓心散開
    const cLat = group.reduce((s, k) => s + all[k].lat, 0) / group.length
    const cLng = group.reduce((s, k) => s + all[k].lng, 0) / group.length
    group.forEach((k, idx) => {
      const angle = (2 * Math.PI * idx) / group.length
      // 經度位移需依緯度修正，台灣約 cos(23°)≈0.92
      const dLat = SPREAD_RADIUS * Math.sin(angle)
      const dLng = (SPREAD_RADIUS * Math.cos(angle)) / Math.cos((cLat * Math.PI) / 180)
      const { d, p } = all[k].ref
      moved[d][p].lat = cLat + dLat
      moved[d][p].lng = cLng + dLng
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

  const days = useMemo(() => spreadOverlappingPoints(rawDays), [rawDays])
  const allPoints = days.flatMap((d) => d.points)

  // 自動縮放到所有可見景點
  useEffect(() => {
    if (!map || allPoints.length === 0) return
    if (allPoints.length === 1) {
      map.setCenter({ lat: allPoints[0].lat, lng: allPoints[0].lng })
      map.setZoom(14)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    for (const p of allPoints) bounds.extend({ lat: p.lat, lng: p.lng })
    map.fitBounds(bounds, 64)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(allPoints.map((p) => [p.lat, p.lng]))])

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
