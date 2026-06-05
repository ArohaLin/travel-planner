'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Itinerary, GeoLocation } from '@/lib/types/itinerary'
import { geocodeBatch, type GeocodeInput } from '@/lib/maps/geocode'
import { buildDayPoints } from '@/lib/maps/route'
import {
  ItineraryMap,
  type MapDay,
  type DistanceMode,
  type PersistDayRoute,
} from './ItineraryMap'

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

// 距離標籤層級輪替順序與顯示文字/樣式
const DIST_MODES: DistanceMode[] = ['top', 'below', 'hidden']
const DIST_LABEL: Record<DistanceMode, string> = {
  top: '置頂',
  below: '下層',
  hidden: '隱藏',
}
const DIST_STYLE: Record<DistanceMode, string> = {
  top: 'bg-blue-600 text-white',
  below: 'bg-emerald-600 text-white',
  hidden: 'bg-white/95 text-gray-400',
}

interface MapViewProps {
  itinerary: Itinerary
  itineraryId: string
  /** 目前選取的天（受控，由父層管理以便與行程檢視同步） */
  selectedDays: number[]
  onSelectedDaysChange: (days: number[]) => void
  /** 路段距離/時間寫回 DB 後呼叫（讓行程卡即時刷新顯示連接器） */
  onLegsSaved?: () => void
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

function MapViewInner({ itinerary, itineraryId, selectedDays, onSelectedDaysChange, onLegsSaved }: MapViewProps) {
  const geocodingLib = useMapsLibrary('geocoding')
  // 本次 session geocode 得到的座標，key = `${dayIndex}:${target}`
  const [geoCache, setGeoCache] = useState<Record<string, GeoLocation>>({})
  const [geocoding, setGeocoding] = useState(false)
  // 距離/時間標籤層級（地圖右上角輪替鈕；預設「下層」不遮 marker）
  const [distanceMode, setDistanceMode] = useState<DistanceMode>('below')

  const destination = itinerary.metadata?.destination
  const originCity = itinerary.metadata?.originCity

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
    const seen = new Set<string>()

    // 排入一筆 geocode；自動去重、且已有座標就跳過。
    // 重點：query 帶完整地址（含縣市）時「不可」再附加 destination，
    // 否則像「太魯閣 台東」會把花蓮景點誤定位到台東。
    const enqueue = (
      di: number,
      target: string,
      existing: GeoLocation | null | undefined,
      fullAddress: string | undefined,
      fallbackQuery: string | undefined,
    ) => {
      const key = `${di}:${target}`
      if (seen.has(key)) return
      if (getGeo(di, target, existing)) return
      const addr = fullAddress?.trim()
      const query = addr || fallbackQuery
      if (!query) return
      seen.add(key)
      inputs.push({ query, region: addr ? undefined : destination })
      refs.push({ dayIndex: di, target })
    }

    for (const dayIndex of selectedDays) {
      const day = itinerary.days.find((d) => d.dayIndex === dayIndex)
      if (!day) continue

      // Issue B 起點：第一天用出發地，後續天用「前一晚住宿」（需先有座標）
      if (dayIndex === 0) {
        // 出發城市本身即縣市，query 直接用城市名、不附加 destination
        enqueue(0, 'origin', undefined, originCity, originCity)
      } else {
        const prevDay = itinerary.days.find((d) => d.dayIndex === dayIndex - 1)
        if (prevDay?.accommodation) {
          enqueue(
            dayIndex - 1,
            'accommodation',
            prevDay.accommodation.location,
            prevDay.accommodation.location?.address,
            prevDay.accommodation.name,
          )
        }
      }

      for (const a of day.activities) {
        if (a.type === 'transport') continue // 交通類不標在地圖上，免 geocode
        enqueue(dayIndex, a.id, a.location, a.location?.address, a.placeLabel || a.title)
      }
      if (day.accommodation) {
        enqueue(
          dayIndex,
          'accommodation',
          day.accommodation.location,
          day.accommodation.location?.address,
          day.accommodation.name,
        )
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

  // 組裝地圖資料（點位用共用 buildDayPoints，確保與背景 prefetch 一致 → sig 可正確比對重用）
  const mapDays: MapDay[] = useMemo(() => {
    const out: MapDay[] = []
    sortedSelected.forEach((dayIndex, colorIdx) => {
      const day = itinerary.days.find((d) => d.dayIndex === dayIndex)
      if (!day) return
      const points = buildDayPoints(itinerary, dayIndex, getGeo)
      if (points.length === 0) return
      out.push({
        dayIndex,
        color: DAY_COLORS[colorIdx % DAY_COLORS.length],
        points,
        stored: { sig: day.travelSig, polyline: day.routePolyline, legs: day.travelLegs },
      })
    })
    return out
  }, [sortedSelected, itinerary, getGeo])

  function toggleDay(dayIndex: number) {
    const next = selectedDays.includes(dayIndex)
      ? selectedDays.length === 1
        ? selectedDays // 至少保留一天
        : selectedDays.filter((d) => d !== dayIndex)
      : [...selectedDays, dayIndex]
    onSelectedDaysChange(next)
  }

  // onLegsSaved 以 ref 保存，避免 handleLegs 依賴變動；去抖動把多天的儲存合併成一次刷新
  const onLegsSavedRef = useRef(onLegsSaved)
  useEffect(() => {
    onLegsSavedRef.current = onLegsSaved
  }, [onLegsSaved])
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 地圖算出某天整條路線後，寫回 DB（距離/時間＋編碼折線＋簽章）。handleRoute 身分穩定，不觸發重抓。
  // 成功後去抖動觸發一次行程刷新 → 行程卡即時出現連接器（DB 已新鮮或座標快取命中時不會重新 persist，故無迴圈）。
  const handleRoute = useCallback(
    (payload: PersistDayRoute) => {
      persistDayRoute(itineraryId, payload).then((saved) => {
        if (!saved) return
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          onLegsSavedRef.current?.()
        }, 1200)
      })
    },
    [itineraryId],
  )

  // 卸載時清掉去抖動計時器
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

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

      {/* 距離/時間標籤層級輪替：置頂 → 下層 → 隱藏（天數選擇器下方右側） */}
      <button
        onClick={() =>
          setDistanceMode((m) => DIST_MODES[(DIST_MODES.indexOf(m) + 1) % DIST_MODES.length])
        }
        title="距離標籤：置頂／下層／隱藏（點一下輪替）"
        className={`absolute top-16 right-3 z-20 flex items-center gap-1 rounded-full shadow-md px-3 py-2 text-xs font-medium min-h-[36px] transition-colors ${DIST_STYLE[distanceMode]}`}
      >
        <span>📏</span>
        <span>距離 {DIST_LABEL[distanceMode]}</span>
      </button>

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

      <ItineraryMap days={mapDays} distanceMode={distanceMode} onRoute={handleRoute} />
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

async function persistDayRoute(
  itineraryId: string,
  payload: PersistDayRoute,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/itinerary/${itineraryId}/legs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days: [
          {
            dayIndex: payload.dayIndex,
            legs: payload.legs,
            polyline: payload.polyline,
            sig: payload.sig,
          },
        ],
      }),
    })
    if (!res.ok) return false
    const json = await res.json().catch(() => null)
    return !!json?.updated // 有實際寫入才需要刷新
  } catch {
    // 持久化失敗不影響地圖顯示
    return false
  }
}
