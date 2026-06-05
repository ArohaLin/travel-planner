'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Itinerary, GeoLocation } from '@/lib/types/itinerary'
import { geocodeBatch, type GeocodeInput } from '@/lib/maps/geocode'
import { ItineraryMap, type MapDay, type MapPoint } from './ItineraryMap'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

// 每天的顏色（多天模式時區分用）
const DAY_COLORS = [
  '#2563eb', // 藍
  '#dc2626', // 紅
  '#059669', // 綠
  '#d97706', // 橘
  '#7c3aed', // 紫
  '#db2777', // 粉
  '#0891b2', // 青
  '#65a30d', // 黃綠
]

interface MapViewProps {
  itinerary: Itinerary
  itineraryId: string
  /** 目前選取的天（受控，由父層管理以便與行程檢視同步） */
  selectedDays: number[]
  onSelectedDaysChange: (days: number[]) => void
}

/** 判斷 location 是否已有可用座標（非空且非 0,0） */
function usableCoords(loc?: GeoLocation | null): GeoLocation | undefined {
  if (loc && (loc.lat !== 0 || loc.lng !== 0)) return loc
  return undefined
}

export function MapView(props: MapViewProps) {
  if (!MAPS_KEY) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center">
        <div className="text-gray-400 text-sm">
          地圖未設定（缺少 NEXT_PUBLIC_GOOGLE_MAPS_KEY）
        </div>
      </div>
    )
  }
  // APIProvider 由 ItineraryClient 父層提供，這裡直接使用
  return <MapViewInner {...props} />
}

interface GeoUpdate {
  dayIndex: number
  target: string
  geo: GeoLocation
}

function MapViewInner({ itinerary, itineraryId, selectedDays, onSelectedDaysChange }: MapViewProps) {
  const geocodingLib = useMapsLibrary('geocoding')
  // 本次 session geocode 得到的座標，key = `${dayIndex}:${target}`
  const [geoCache, setGeoCache] = useState<Record<string, GeoLocation>>({})
  const [geocoding, setGeocoding] = useState(false)

  const destination = itinerary.metadata?.destination

  const getGeo = useCallback(
    (dayIndex: number, target: string, existing?: GeoLocation | null): GeoLocation | undefined => {
      const ok = usableCoords(existing)
      if (ok) return ok
      return geoCache[`${dayIndex}:${target}`]
    },
    [geoCache],
  )

  // 對選中的天，找出缺座標的項目並 geocode
  useEffect(() => {
    if (!geocodingLib) return

    const inputs: GeocodeInput[] = []
    const refs: { dayIndex: number; target: string }[] = []

    for (const dayIndex of selectedDays) {
      const day = itinerary.days.find((d) => d.dayIndex === dayIndex)
      if (!day) continue
      for (const a of day.activities) {
        if (a.type === 'transport') continue // 交通類不標在地圖上，免 geocode
        if (getGeo(dayIndex, a.id, a.location)) continue
        // 用地點簡稱 / 地址 / 標題查座標（placeLabel 通常較精準）
        const query = a.placeLabel || a.location?.address || a.title
        if (!query) continue
        inputs.push({ query, region: destination })
        refs.push({ dayIndex, target: a.id })
      }
      if (day.accommodation && !getGeo(dayIndex, 'accommodation', day.accommodation.location)) {
        const query = day.accommodation.location?.address || day.accommodation.name
        if (query) {
          inputs.push({ query, region: destination })
          refs.push({ dayIndex, target: 'accommodation' })
        }
      }
    }

    if (inputs.length === 0) return

    let cancelled = false
    setGeocoding(true)
    geocodeBatch(inputs).then((results) => {
      if (cancelled) return
      const newCache: Record<string, GeoLocation> = {}
      const updates: GeoUpdate[] = []
      results.forEach((geo, i) => {
        if (!geo) return
        const { dayIndex, target } = refs[i]
        newCache[`${dayIndex}:${target}`] = geo
        updates.push({ dayIndex, target, geo })
      })
      if (Object.keys(newCache).length > 0) {
        setGeoCache((prev) => ({ ...prev, ...newCache }))
        persistGeo(itineraryId, updates)
      }
      setGeocoding(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodingLib, selectedDays, itinerary, itineraryId, destination])

  const sortedSelected = useMemo(
    () => [...selectedDays].sort((a, b) => a - b),
    [selectedDays],
  )

  // 組裝地圖資料
  const mapDays: MapDay[] = useMemo(() => {
    return sortedSelected
      .map((dayIndex, colorIdx) => {
        const day = itinerary.days.find((d) => d.dayIndex === dayIndex)
        if (!day) return null
        const points: MapPoint[] = []
        // 只標「實際地點」：排除交通類（transport 是兩點間移動，不是地圖上的點），
        // 並連續編號（①②③…不跳號），與行程表上的景點順序一致。
        const placeActivities = day.activities.filter((a) => a.type !== 'transport')
        placeActivities.forEach((a, i) => {
          const geo = getGeo(dayIndex, a.id, a.location)
          if (!geo) return
          const time = a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime
          points.push({
            lat: geo.lat,
            lng: geo.lng,
            label: String(i + 1),
            title: a.title,
            time,
            kind: 'activity',
          })
        })
        if (day.accommodation) {
          const geo = getGeo(dayIndex, 'accommodation', day.accommodation.location)
          if (geo) {
            points.push({
              lat: geo.lat,
              lng: geo.lng,
              label: '宿',
              title: day.accommodation.name,
              kind: 'accommodation',
            })
          }
        }
        return { dayIndex, color: DAY_COLORS[colorIdx % DAY_COLORS.length], points }
      })
      .filter((d): d is MapDay => d !== null && d.points.length > 0)
  }, [sortedSelected, itinerary, getGeo])

  function toggleDay(dayIndex: number) {
    const next = selectedDays.includes(dayIndex)
      ? selectedDays.length === 1
        ? selectedDays // 至少保留一天
        : selectedDays.filter((d) => d !== dayIndex)
      : [...selectedDays, dayIndex]
    onSelectedDaysChange(next)
  }

  const hasAnyPoint = mapDays.some((d) => d.points.length > 0)

  return (
    <div className="relative h-full w-full">
      {/* 天數選擇器 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 bg-white/95 backdrop-blur rounded-full shadow-md px-2 py-1.5 min-w-max">
          {itinerary.days.map((day) => {
            const active = selectedDays.includes(day.dayIndex)
            return (
              <button
                key={day.dayIndex}
                onClick={() => toggleDay(day.dayIndex)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[36px] ${
                  active ? 'text-white' : 'bg-gray-100 text-gray-600'
                }`}
                style={
                  active
                    ? { backgroundColor: DAY_COLORS[sortedSelected.indexOf(day.dayIndex) % DAY_COLORS.length] }
                    : undefined
                }
              >
                第 {day.dayIndex + 1} 天
              </button>
            )
          })}
        </div>
      </div>

      {/* geocoding 載入提示 */}
      {geocoding && !hasAnyPoint && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 rounded-full px-4 py-2 text-sm text-gray-500 shadow">
            定位景點中...
          </div>
        </div>
      )}

      {!geocoding && !hasAnyPoint && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
          <div className="bg-white/90 rounded-xl px-4 py-3 text-sm text-gray-500 shadow text-center">
            這天沒有可定位的景點
          </div>
        </div>
      )}

      <ItineraryMap days={mapDays} />
    </div>
  )
}

async function persistGeo(itineraryId: string, updates: GeoUpdate[]) {
  try {
    await fetch(`/api/itinerary/${itineraryId}/geo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
  } catch {
    // 持久化失敗不影響地圖顯示（session 內已有 cache）
  }
}
