'use client'

import type { ForecastWeather, ClimatologyWeather } from '@/lib/weather/openMeteo'
import { ICON_EMOJI } from '@/lib/weather/display'

const PART_LABEL = { morning: '早', afternoon: '午', evening: '晚' } as const

function mmdd(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function WeatherDetailSheet({ weather, city, onClose }: {
  weather: ForecastWeather | ClimatologyWeather
  city: string
  onClose: () => void
}) {
  const isForecast = weather.mode === 'forecast'
  const month = Number(weather.date.split('-')[1])
  const typhoon = month >= 6 && month <= 10

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '80dvh' }}>
        <button
          onClick={onClose}
          aria-label="關閉"
          className="absolute top-3 right-3 z-[80] w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:scale-90 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div className="flex items-baseline gap-2 mb-4 pr-10">
            <span className="text-xl">{ICON_EMOJI[weather.icon]}</span>
            <h2 className="text-base font-semibold text-gray-900">{mmdd(weather.date)} {city}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isForecast ? 'bg-blue-50 text-blue-600' : 'bg-stone-100 text-stone-500'}`}>
              {isForecast ? '天氣預報' : '歷年同期'}
            </span>
          </div>

          {weather.mode === 'forecast' ? (
            <>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-2xl font-semibold text-gray-900">{weather.tempMin}° / {weather.tempMax}°</span>
                <span className="text-sm text-blue-500">💧 降雨 {weather.precipProb}%</span>
                {weather.apparentMax != null && <span className="text-sm text-gray-400">體感 {weather.apparentMax}°</span>}
              </div>
              <div className="space-y-2.5">
                {weather.parts.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 text-sm">
                    <span className="w-8 text-gray-500">{PART_LABEL[p.key]}</span>
                    <span className="text-lg w-7">{ICON_EMOJI[p.icon]}</span>
                    <span className="w-12 font-medium text-gray-800">{p.temp}°</span>
                    <span className="text-blue-500">💧 {p.precipProb}%</span>
                  </div>
                ))}
              </div>
              {(weather.sunrise || weather.sunset) && (
                <div className="flex gap-5 mt-4 pt-3 border-t border-gray-100 text-sm text-gray-500">
                  {weather.sunrise && <span>🌅 日出 {weather.sunrise}</span>}
                  {weather.sunset && <span>🌇 日落 {weather.sunset}</span>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Stat label="平均高溫" value={`${weather.avgMax}°`} />
                <Stat label="平均低溫" value={`${weather.avgMin}°`} />
                <Stat label="降雨機率（歷年）" value={`${weather.rainProb}%`} />
                <Stat label="平均雨量" value={`${weather.avgPrecip} mm`} />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                溫度區間（歷年最涼/最熱）<span className="font-medium text-gray-800"> {weather.tempLow}° – {weather.tempHigh}°</span>
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mt-1">
                近 {weather.years} 年中約 <span className="font-medium text-gray-800">{weather.yearsWithRain}</span> 年當天有雨
              </p>
              <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-[13px] text-amber-800 leading-relaxed">
                ⚠️ 這是歷年「通常值」，非預報。{typhoon && '夏季為台灣颱風季，'}實際請以接近出發（14 天內）的預報為準。
              </div>
            </>
          )}

          <p className="text-[11px] text-gray-400 mt-4">資料來源：Open-Meteo{isForecast ? '' : ' Archive（ERA5）'}・免費</p>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[12px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
