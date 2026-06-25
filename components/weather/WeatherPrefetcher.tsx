'use client'

import { useEffect } from 'react'
import { preload } from 'swr'
import type { Itinerary } from '@/lib/types/itinerary'
import { dayCoords, weatherKey } from '@/lib/weather/dayCoords'

const fetcher = (u: string) => fetch(u).then((r) => r.json())

/**
 * 一進行程就背景預抓「所有天」的天氣（不必等使用者點到某天）。
 * 用 SWR preload 同時暖 SWR 快取＋伺服器 DB 快取；之後切到任一天即時顯示。
 * 輕量錯開（每 250ms 一筆），避免一次併發太多冷算（歷年同期 archive）。
 */
export function WeatherPrefetcher({ itinerary }: { itinerary: Itinerary }) {
  const sig = itinerary.days
    .map((d) => { const c = dayCoords(d); return `${d.date}@${c?.lat ?? ''},${c?.lng ?? ''}` })
    .join('|')

  useEffect(() => {
    let cancelled = false
    const keys = itinerary.days
      .map((d) => { const c = dayCoords(d); return c ? weatherKey(c.lat, c.lng, d.date) : null })
      .filter((k): k is string => k !== null)
    keys.forEach((key, i) => setTimeout(() => { if (!cancelled) preload(key, fetcher) }, i * 250))
    return () => { cancelled = true }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
