'use client'

import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Itinerary, GeoLocation } from '@/lib/types/itinerary'
import { geocodeBatch, type GeocodeInput } from '@/lib/maps/geocode'
import {
  buildDayPoints,
  signatureFor,
  getOrComputeRoute,
  toPersistLegs,
  type CoordResolver,
} from '@/lib/maps/route'

/**
 * 背景路線預抓：開行程時於背景檢查每天的距離/時間是否需要更新（比對簽章），
 * 過期或缺漏才補座標 + 算開車路線並寫回 DB。算一次到處重用：
 * - 行程卡免開地圖即有距離
 * - 開地圖時直接讀 DB 的編碼折線畫線，不再重打 Directions
 *
 * 必須渲染在 <APIProvider> 內（才能用 useMapsLibrary）。本元件不顯示任何 UI。
 */

function usable(loc?: GeoLocation | null): GeoLocation | undefined {
  if (loc && (loc.lat !== 0 || loc.lng !== 0)) return loc
  return undefined
}

interface Props {
  itinerary: Itinerary | null
  itineraryId: string
  /** 有任何天被更新後呼叫（觸發行程刷新，讓卡片即時顯示） */
  onSaved?: () => void
}

export function RoutePrefetcher({ itinerary, itineraryId, onSaved }: Props) {
  const geocodingLib = useMapsLibrary('geocoding')
  const routesLib = useMapsLibrary('routes')
  // 載入 geometry：逐段計算（跨海日）需用它把路徑編碼成折線存 DB
  const geometryLib = useMapsLibrary('geometry')
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])
  // 本 session 已算過的 (day:sig)，避免在 persist+refresh 還沒回來前重複計算
  const doneRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!itinerary || !geocodingLib || !routesLib || !geometryLib) return
    let cancelled = false

    const run = async () => {
      const cache: Record<string, GeoLocation> = {}
      const resolve: CoordResolver = (di, target, existing) =>
        usable(existing) ?? cache[`${di}:${target}`]

      // 1) 補齊缺漏座標（所有天）
      const inputs: GeocodeInput[] = []
      const refs: { dayIndex: number; target: string }[] = []
      const seen = new Set<string>()
      const destination = itinerary.metadata?.destination
      const originCity = itinerary.metadata?.originCity

      const enqueue = (
        di: number,
        target: string,
        existing: GeoLocation | null | undefined,
        fullAddress: string | undefined,
        fallbackQuery: string | undefined,
      ) => {
        const key = `${di}:${target}`
        if (seen.has(key)) return
        if (resolve(di, target, existing)) return
        const addr = fullAddress?.trim()
        const query = addr || fallbackQuery
        if (!query) return
        seen.add(key)
        inputs.push({ query, region: addr ? undefined : destination })
        refs.push({ dayIndex: di, target })
      }

      for (const day of itinerary.days) {
        if (day.dayIndex === 0 && originCity) {
          enqueue(0, 'origin', undefined, originCity, originCity)
        }
        for (const a of day.activities) {
          if (a.type === 'transport') continue
          enqueue(day.dayIndex, a.id, a.location, a.location?.address, a.placeLabel || a.title)
        }
        if (day.accommodation) {
          enqueue(
            day.dayIndex,
            'accommodation',
            day.accommodation.location,
            day.accommodation.location?.address,
            day.accommodation.name,
          )
        }
      }

      if (inputs.length > 0) {
        const results = await geocodeBatch(inputs)
        if (cancelled) return
        const updates: { dayIndex: number; target: string; geo: GeoLocation }[] = []
        results.forEach((geo, i) => {
          if (!geo) return
          const { dayIndex, target } = refs[i]
          cache[`${dayIndex}:${target}`] = geo
          updates.push({ dayIndex, target, geo })
        })
        if (updates.length > 0) {
          fetch(`/api/itinerary/${itineraryId}/geo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          }).catch(() => {})
        }
      }

      // 2) 每天比對簽章，過期才算路線並寫回
      let anySaved = false
      for (const day of itinerary.days) {
        if (cancelled) return
        const points = buildDayPoints(itinerary, day.dayIndex, resolve)
        if (points.length < 2) continue
        const sig = signatureFor(points)
        // DB 已新鮮 → 跳過
        if (day.travelSig === sig && day.routePolyline) continue
        // 本 session 已算過（persist/refresh 尚未回來）→ 跳過
        if (doneRef.current.has(`${day.dayIndex}:${sig}`)) continue

        try {
          const route = await getOrComputeRoute(routesLib, points)
          if (cancelled) return
          if (!route) continue
          doneRef.current.add(`${day.dayIndex}:${sig}`)
          const res = await fetch(`/api/itinerary/${itineraryId}/legs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              days: [{ dayIndex: day.dayIndex, legs: toPersistLegs(route), sig: route.sig }],
            }),
          })
          if (res.ok) anySaved = true
        } catch {
          // 單天失敗不影響其他天
        }
      }

      if (anySaved && !cancelled) onSavedRef.current?.()
    }

    // 稍微延遲，避開首屏載入忙碌；itinerary 內容變化時會重跑（重新比對簽章）
    const timer = setTimeout(run, 800)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, geocodingLib, routesLib, geometryLib, itineraryId])

  return null
}
