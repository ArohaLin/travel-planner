'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import type { ItineraryDay } from '@/lib/types/itinerary'
import { useWeather } from '@/lib/hooks/useWeather'
import { ICON_EMOJI } from '@/lib/weather/display'
import { dayCoords } from '@/lib/weather/dayCoords'
import { WeatherDetailSheet } from './WeatherDetailSheet'

export function WeatherChip({ day }: { day: ItineraryDay }) {
  const coords = dayCoords(day)
  const w = useWeather(coords?.lat, coords?.lng, day.date)
  const [open, setOpen] = useState(false)

  if (!coords || !w || w.mode === 'none') return null

  const isForecast = w.mode === 'forecast'
  const lo = isForecast ? w.tempMin : w.avgMin
  const hi = isForecast ? w.tempMax : w.avgMax
  const rain = isForecast ? w.precipProb : w.rainProb

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(true)}
        aria-label="當日天氣"
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1 text-[13px] bg-white active:scale-[0.97] transition',
          isForecast ? 'border border-gray-200' : 'border border-dashed border-stone-300',
        )}
      >
        {!isForecast && (
          <span className="text-[11px] font-medium text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">歷年</span>
        )}
        <span className="text-[15px] leading-none">{ICON_EMOJI[w.icon]}</span>
        <span className="font-medium text-gray-800">{lo}° / {hi}°</span>
        <span className="text-gray-300">·</span>
        <span className="text-blue-500">💧{rain}%</span>
      </button>

      {open && (
        <WeatherDetailSheet weather={w} city={day.city} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
