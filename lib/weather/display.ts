import type { WeatherIconKey } from './openMeteo'

// iPhone 原生 emoji 顯示佳、跨平台一致；不另畫 SVG。
export const ICON_EMOJI: Record<WeatherIconKey, string> = {
  sun: '☀️', partly: '⛅', cloud: '☁️', fog: '🌫️', rain: '🌧️', storm: '⛈️', snow: '❄️',
}
