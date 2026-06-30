'use client'

import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Itinerary, GeoLocation } from '@/lib/types/itinerary'
import { geocodeBatch, type GeocodeInput } from '@/lib/maps/geocode'
import {
  buildDayPoints,
  splitDrivingSegments,
  signatureFor,
  getOrComputeRoute,
  toPersistLegs,
  type CoordResolver,
} from '@/lib/maps/route'
import { hasNoPlace } from '@/lib/itinerary/activityFlags'

/**
 * 背景路線預抓：開行程時於背景檢查每天的距離/時間是否需要更新（比對簽章），
 * 過期或缺漏才補座標 + 算開車路線並寫回 DB。算一次到處重用：
 * - 行程卡免開地圖即有距離
 * - 開地圖時直接讀 DB 的編碼折線畫線，不再重打 Directions
 *
 * 必須渲染在 <APIProvider> 內（才能用 useMapsLibrary）。本元件不顯示任何 UI。
 */

function usable(loc?: GeoLocation | null): GeoLocation | undefined {
  if (
    loc &&
    typeof loc.lat === 'number' && isFinite(loc.lat) &&
    typeof loc.lng === 'number' && isFinite(loc.lng) &&
    (loc.lat !== 0 || loc.lng !== 0)
  ) return loc
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
        regionBias?: string,
        allowArea?: boolean,
      ) => {
        const key = `${di}:${target}`
        if (seen.has(key)) return
        if (resolve(di, target, existing)) return
        const addr = fullAddress?.trim()
        const query = addr || fallbackQuery
        if (!query) return
        seen.add(key)
        // 沒地址時用「該天的城市」當地區偏好（跨縣市行程才不會被全程單一 destination 拉錯）
        inputs.push({ query, region: addr ? undefined : (regionBias || destination), allowArea })
        refs.push({ dayIndex: di, target })
      }

      for (const day of itinerary.days) {
        if (day.dayIndex === 0 && originCity) {
          const originAddr = itinerary.metadata?.originAddress
          // 有精確地址 → 不需 allowArea；只有城市 → 允許行政區結果（否則被防呆誤擋）
          enqueue(0, 'origin', undefined, originAddr, originAddr || originCity, undefined, !originAddr)
        }
        for (const a of day.activities) {
          if (a.type === 'transport') {
            // 班次型交通卡（火車/高鐵/飛機）：geocode toLabel（到站地點）
            if (a.boardingPairId && a.toLabel) {
              enqueue(day.dayIndex, a.id, a.location, undefined, a.toLabel, day.city || destination)
            }
            continue
          }
          // 候車卡（rest + boardingPairId）：geocode 出發車站，讓「家→出發站」開車路線正確出現
          // 注意：站名（如「新竹高鐵站」）已含地名，不加 day.city（否則「新竹高鐵站 花蓮市」誤定位）
          if (a.type === 'rest' && a.boardingPairId) {
            const stationName = a.title.replace(/[候等]車$|轉乘候車$/, '').trim()
            if (stationName) {
              enqueue(day.dayIndex, a.id, a.location, undefined, stationName, undefined)
            }
            continue
          }
          if (hasNoPlace(a)) continue // 無實體地點（rest 純動作/hasPlace=false）不需獨立座標
          enqueue(day.dayIndex, a.id, a.location, a.location?.address, a.placeLabel || a.title, day.city)
        }
        if (day.accommodation) {
          enqueue(
            day.dayIndex,
            'accommodation',
            day.accommodation.location,
            day.accommodation.location?.address,
            day.accommodation.name,
            day.city,
          )
        }
        // 旅程終點（#41）：最後一天且無住宿 → geocode 返回城市（城市查詢需允許行政區結果）
        if (day.dayIndex === Math.max(...itinerary.days.map((d) => d.dayIndex)) && !day.accommodation) {
          const returnCity = itinerary.metadata?.returnCity ?? originCity
          const returnAddr = itinerary.metadata?.returnAddress || itinerary.metadata?.originAddress
          const returnQuery = returnAddr || returnCity
          if (returnQuery) enqueue(day.dayIndex, 'return', undefined, returnAddr, returnQuery, undefined, !returnAddr)
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
      // 路線在 transit-arrival 處切斷分段，各段獨立呼叫 Directions（防止跨縣市錯誤開車路線）
      let anySaved = false
      for (const day of itinerary.days) {
        if (cancelled) return
        const { points } = buildDayPoints(itinerary, day.dayIndex, resolve)
        if (points.length < 2) continue
        const sig = signatureFor(points)
        // DB 已新鮮 → 跳過
        if (day.travelSig === sig && day.routePolyline) continue
        // 本 session 已算過（persist/refresh 尚未回來）→ 跳過
        if (doneRef.current.has(`${day.dayIndex}:${sig}`)) continue

        try {
          const drivingSegs = splitDrivingSegments(points)
          const allLegs: ReturnType<typeof toPersistLegs> = []
          for (const seg of drivingSegs) {
            if (cancelled) return
            const route = await getOrComputeRoute(routesLib, seg)
            if (route) allLegs.push(...toPersistLegs(route))
          }
          if (cancelled) return
          if (allLegs.length === 0) continue
          doneRef.current.add(`${day.dayIndex}:${sig}`)
          const res = await fetch(`/api/itinerary/${itineraryId}/legs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              days: [{ dayIndex: day.dayIndex, legs: allLegs, sig }],
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
