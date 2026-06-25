'use client'

import useSWR from 'swr'
import type { WeatherResult } from '@/lib/weather/openMeteo'

const fetcher = (u: string) => fetch(u).then((r) => r.json())

/** 抓每日天氣（模式由伺服器依日期決定：預報／歷年同期／none）。座標或日期缺則不抓。 */
export function useWeather(lat?: number, lng?: number, date?: string): WeatherResult | undefined {
  const key = lat != null && lng != null && date
    ? `/api/weather?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&date=${date}`
    : null
  const { data } = useSWR<WeatherResult>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3_600_000,
    shouldRetryOnError: false,
  })
  return data
}
