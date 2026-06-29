'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MyLocationButton } from './MyLocationButton'
import type { TravelLeg } from '@/lib/types/itinerary'
import {
  getOrComputeRoute,
  splitDrivingSegments,
  signatureFor,
  legText,
  toPersistLegs,
  type PersistLeg,
  type TransitSegment,
} from '@/lib/maps/route'

export interface MapPoint {
  lat: number
  lng: number
  /** marker 上顯示的順序號（多天時可能是 "2-3" 之類） */
  label: string
  title: string
  time?: string
  /** activity=圓形景點；accommodation=當晚住宿方形；origin=路線起點菱形；port=港口（⚓，跨海轉乘點）；
   *  transit-arrival=班次型交通抵達站（不計算前一段→此點的開車路線，改畫虛直線） */
  kind: 'activity' | 'accommodation' | 'origin' | 'return' | 'port' | 'transit-arrival'
  /** 對應的識別碼：activity.id、'accommodation'、'origin'、'return'（旅程終點）或港口交通卡 id */
  id: string
}

/** 寫回 DB 用的整天路線（逐段距離/時間/折線 + 簽章） */
export interface PersistDayRoute {
  dayIndex: number
  legs: PersistLeg[]
  sig: string
}

export interface MapDay {
  dayIndex: number
  color: string
  points: MapPoint[]
  /** 班次型交通（火車/高鐵/飛機/船）的虛直線段（出發座標→到站座標） */
  transitSegments?: TransitSegment[]
  /** DB 已存的路線資料（sig 相符即可直接重用，免打 Directions） */
  stored?: { sig?: string; legs?: TravelLeg[] }
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

/**
 * 建立一個距離/時間膠囊 overlay（白底圓角，隨地圖平移/縮放跟著動）。
 * pane='floatPane' → 置頂（蓋在 marker 上）；pane='overlayLayer' → 在 marker 下層。
 */
function makeDistancePill(
  map: google.maps.Map,
  content: { from: string; to: string; dist: string },
  pos: { lat: number; lng: number },
  color: string,
  pane: 'floatPane' | 'overlayLayer',
): google.maps.OverlayView {
  let div: HTMLDivElement | null = null
  const ov = new google.maps.OverlayView()
  // 編號圓形徽章（與地圖 marker 同色、白字），避免與距離數字看混
  const badge = (t: string) =>
    `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 3px;border-radius:9999px;background:${color};color:#fff;font-size:9px;font-weight:700;line-height:1;box-sizing:border-box">${t}</span>`
  ov.onAdd = () => {
    div = document.createElement('div')
    // 「前一點 → 目的地」兩個編號徽章 + 距離/時間
    div.innerHTML =
      `${badge(content.from)}<span style="margin:0 1px;color:#9ca3af">→</span>${badge(content.to)}` +
      `<span style="margin-left:4px">${content.dist}</span>`
    div.style.cssText = [
      'position:absolute',
      'transform:translate(-50%,-50%)',
      'display:flex',
      'align-items:center',
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
      <MyLocationButton />
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
                    : selected.point.kind === 'return'
                      ? '旅程終點'
                      : selected.point.kind === 'port'
                        ? '港口（搭船轉乘）'
                        : selected.point.kind === 'transit-arrival'
                          ? '轉乘抵達站'
                          : selected.point.time}
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  )
}

/** 已解析的開車路段（以 toId 對應終點站）；pos=標籤位置，polyline=該段道路折線 */
interface RenderLeg {
  toId: string
  meters: number
  text: string
  pos: { lat: number; lng: number } | null
  polyline: string
}

/** 逐段渲染資料：path=該段要畫的線（真實道路或直線兩點），label=距離標籤，ferry=跨海段（畫虛線） */
interface RenderSegment {
  path: { lat: number; lng: number }[]
  ferry: boolean
  label: {
    from: string
    to: string
    dist: string
    meters: number
    pos: { lat: number; lng: number }
  } | null
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
  // 已解析的開車路段（以 toId 對應）；null=載入中，[]=已算但無任何開車段（全走直線）
  const [legs, setLegs] = useState<RenderLeg[] | null>(null)

  // 取得開車路段：優先重用 DB（sig 相符），否則呼叫 Directions（分段，transit-arrival 處切斷）。
  // 以原始座標為基準，zoom in/out 不會觸發重抓。
  useEffect(() => {
    if (rawDay.points.length < 2) {
      setLegs([])
      return
    }
    const currentSig = signatureFor(rawDay.points)
    const stored = rawDay.stored

    // 1) DB 已新鮮 → 直接用 stored.legs（每段含自己的折線）
    if (stored?.sig && stored.sig === currentSig && stored.legs) {
      setLegs(
        stored.legs.map((l) => ({
          toId: l.toId,
          meters: l.meters,
          text: legText(l.meters, l.seconds),
          pos:
            typeof l.midLat === 'number' && typeof l.midLng === 'number'
              ? { lat: l.midLat, lng: l.midLng }
              : null,
          polyline: l.polyline ?? '',
        })),
      )
      return
    }

    // 2) 否則算（需 geometry 才能把每段道路編碼存起來）
    // 在 transit-arrival 處切斷，各段獨立呼叫 Directions，避免跨縣市錯誤開車路線
    if (!routesLib || !geometryLib) return
    let cancelled = false
    setLegs(null)

    const segs = splitDrivingSegments(rawDay.points)
    Promise.all(segs.map((seg) => getOrComputeRoute(routesLib, seg).catch(() => null)))
      .then((results) => {
        if (cancelled) return
        const allLegs: RenderLeg[] = []
        const allPersist: PersistLeg[] = []
        for (const computed of results) {
          if (!computed) continue
          for (const l of computed.legs) {
            allLegs.push({ toId: l.toId, meters: l.meters, text: l.text, pos: l.pos, polyline: l.polyline })
          }
          allPersist.push(...toPersistLegs(computed))
        }
        setLegs(allLegs)
        if (allPersist.length > 0) {
          onRoute?.({ dayIndex: rawDay.dayIndex, legs: allPersist, sig: currentSig })
        } else {
          setLegs([]) // 全部無法開車 → 全走直線
        }
      })
      .catch(() => {
        if (!cancelled) setLegs([])
      })
    return () => {
      cancelled = true
    }
    // onRoute 不列依賴：只在實際抓取時於 .then 內呼叫一次，不應因上層重繪而重抓。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesLib, geometryLib, rawDay])

  // 逐段渲染：每段「有開車路線→真實道路」「無→直線箭頭」。載入中（null）不畫，等結果。
  const segments = useMemo<RenderSegment[] | null>(() => {
    if (legs === null) return null
    const pts = rawDay.points
    if (pts.length < 2) return []
    // 注意：本檔 `Map` 名稱被 @vis.gl 地圖元件佔用，用 globalThis.Map 取原生 Map
    const byTo = new globalThis.Map(legs.map((l) => [l.toId, l]))
    const segs: RenderSegment[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      // transit-arrival：前一點→此點是班次型交通（虛直線），不計算也不顯示開車路線
      if (b.kind === 'transit-arrival') continue
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
      const straight = [
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      ]
      const leg = byTo.get(b.id)
      let path: { lat: number; lng: number }[]
      let distText: string
      let meters: number
      let pos: { lat: number; lng: number }
      if (leg && leg.polyline && geometryLib) {
        const decoded = geometryLib.encoding.decodePath(leg.polyline).map((p) => ({ lat: p.lat(), lng: p.lng() }))
        path = decoded.length >= 2 ? decoded : straight
        distText = leg.text
        meters = leg.meters
        pos = leg.pos ?? mid
      } else if (leg) {
        // 有開車距離但沒折線 → 直線 + 開車距離文字
        path = straight
        distText = leg.text
        meters = leg.meters
        pos = leg.pos ?? mid
      } else {
        // 無開車路線（跨海/無法開車）→ 直線 + 直線距離
        path = straight
        const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
        distText = formatKm(km)
        meters = km * 1000
        pos = mid
      }
      // 跨海段：無開車路線（leg 不存在）且兩端有港口 → 畫虛線（船程）
      const ferry = !leg && (a.kind === 'port' || b.kind === 'port')
      // 標籤帶「起點編號 → 目的地編號」（與 marker 上的編號一致）+ 距離/時間
      segs.push({ path, ferry, label: { from: a.label, to: b.label, dist: distText, meters, pos } })
    }
    return segs
  }, [legs, geometryLib, rawDay])

  // 轉乘虛直線（火車/高鐵/飛機/船）：出發→到站，比 ferry 更長的虛線，不含距離標籤
  useEffect(() => {
    if (!map) return
    const segs = rawDay.transitSegments ?? []
    if (segs.length === 0) return
    const polylines = segs.map((s) =>
      new google.maps.Polyline({
        path: [{ lat: s.from.lat, lng: s.from.lng }, { lat: s.to.lat, lng: s.to.lng }],
        strokeOpacity: 0,
        icons: [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.55, strokeColor: day.color, scale: 3 },
            offset: '0',
            repeat: '20px',
          },
        ],
        map,
        zIndex: 0,
      })
    )
    return () => polylines.forEach((p) => p.setMap(null))
  }, [map, rawDay.transitSegments, day.color])

  // 折線：逐段畫。開車段＝實線＋方向箭頭；跨海段（ferry）＝虛線（船程，與陸路區隔）
  useEffect(() => {
    if (!map || !segments) return
    const polylines = segments
      .filter((s) => s.path.length >= 2)
      .map((s) => {
        const pl = new google.maps.Polyline(
          s.ferry
            ? {
                // 跨海虛線：透明主線 + 重複短劃，不畫前進箭頭（搭船非自駕）
                path: s.path,
                strokeOpacity: 0,
                icons: [
                  {
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: day.color, scale: 3 },
                    offset: '0',
                    repeat: '14px',
                  },
                ],
              }
            : {
                path: s.path,
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
              },
        )
        pl.setMap(map)
        return pl
      })
    return () => polylines.forEach((p) => p.setMap(null))
  }, [map, segments, day.color])

  // 距離/時間標籤：層級依 distanceMode；該段 < MIN_LABEL_KM 公里不顯示。
  useEffect(() => {
    if (!map || !segments || distanceMode === 'hidden') return
    const pane = distanceMode === 'top' ? 'floatPane' : 'overlayLayer'
    const overlays = segments
      .map((s) => s.label)
      .filter(
        (
          l,
        ): l is {
          from: string
          to: string
          dist: string
          meters: number
          pos: { lat: number; lng: number }
        } => !!l && l.meters >= MIN_LABEL_KM * 1000,
      )
      .map((l) => makeDistancePill(map, { from: l.from, to: l.to, dist: l.dist }, l.pos, day.color, pane))
    return () => overlays.forEach((o) => o.setMap(null))
  }, [map, segments, day.color, distanceMode])

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
                : point.kind === 'origin' || point.kind === 'return'
                  ? 'M 0 -13 L 13 0 L 0 13 L -13 0 Z'
                  : google.maps.SymbolPath.CIRCLE,
            // 港口用圓點但較小、固定海藍色（與當天景點色區隔，一眼看出是轉乘港）
            scale: point.kind === 'activity' ? 13 : point.kind === 'port' ? 11 : 1,
            fillColor: point.kind === 'port' ? '#0e7490' : day.color,
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
