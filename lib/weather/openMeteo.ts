// Open-Meteo 天氣（免費、免金鑰）：≤14 天用實際預報，>14 天用歷年同期統計（ERA5 archive）。

export type WeatherIconKey = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'storm' | 'snow'

export interface ForecastPart {
  key: 'morning' | 'afternoon' | 'evening'
  icon: WeatherIconKey
  temp: number
  precipProb: number
}
export interface ForecastWeather {
  mode: 'forecast'
  date: string
  icon: WeatherIconKey
  label: string
  tempMax: number
  tempMin: number
  precipProb: number
  apparentMax: number | null
  sunrise: string | null
  sunset: string | null
  parts: ForecastPart[]
}
export interface ClimatologyWeather {
  mode: 'climatology'
  date: string
  icon: WeatherIconKey
  label: string
  avgMax: number
  avgMin: number
  rainProb: number
  avgPrecip: number
  tempLow: number
  tempHigh: number
  years: number
  yearsWithRain: number
}
export type WeatherResult = ForecastWeather | ClimatologyWeather | { mode: 'none' }

export function codeToIcon(c: number): WeatherIconKey {
  if (c === 0) return 'sun'
  if (c === 1 || c === 2) return 'partly'
  if (c === 3) return 'cloud'
  if (c === 45 || c === 48) return 'fog'
  if (c >= 51 && c <= 67) return 'rain'
  if (c >= 71 && c <= 77) return 'snow'
  if (c >= 80 && c <= 82) return 'rain'
  if (c >= 85 && c <= 86) return 'snow'
  if (c >= 95) return 'storm'
  return 'cloud'
}
export function iconLabel(k: WeatherIconKey): string {
  return { sun: '晴', partly: '多雲時晴', cloud: '多雲', fog: '有霧', rain: '有雨', storm: '雷雨', snow: '下雪' }[k]
}

const r = (n: number) => Math.round(n)
const hhmm = (iso?: string) => (iso && iso.length >= 16 ? iso.slice(11, 16) : null)

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  return res.json()
}

/** ≤14 天：實際每日預報 ＋ 早/午/晚逐時 */
export async function getForecast(lat: number, lng: number, date: string): Promise<ForecastWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
    + `&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,sunrise,sunset`
    + `&hourly=temperature_2m,precipitation_probability,weathercode&timezone=auto&start_date=${date}&end_date=${date}`
  const j = await fetchJson(url)
  const d = j.daily
  if (!d || !d.time || d.time.length === 0) return null
  const code = d.weathercode?.[0] ?? 3
  const parts: ForecastPart[] = []
  const times: string[] = j.hourly?.time ?? []
  for (const [key, hh] of [['morning', 'T09:00'], ['afternoon', 'T14:00'], ['evening', 'T19:00']] as const) {
    const i = times.findIndex((t) => t.endsWith(hh) && t.startsWith(date))
    if (i >= 0) parts.push({
      key,
      icon: codeToIcon(j.hourly.weathercode?.[i] ?? code),
      temp: r(j.hourly.temperature_2m?.[i] ?? 0),
      precipProb: r(j.hourly.precipitation_probability?.[i] ?? 0),
    })
  }
  return {
    mode: 'forecast', date,
    icon: codeToIcon(code), label: iconLabel(codeToIcon(code)),
    tempMax: r(d.temperature_2m_max?.[0] ?? 0),
    tempMin: r(d.temperature_2m_min?.[0] ?? 0),
    precipProb: r(d.precipitation_probability_max?.[0] ?? 0),
    apparentMax: d.apparent_temperature_max?.[0] != null ? r(d.apparent_temperature_max[0]) : null,
    sunrise: hhmm(d.sunrise?.[0]), sunset: hhmm(d.sunset?.[0]),
    parts,
  }
}

function dayOfYear(y: number, m: number, d: number): number {
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000)
}

/** >14 天：歷年同期（近 ~10 年同一天 ±3 天平均；ERA5 archive） */
export async function getClimatology(lat: number, lng: number, date: string): Promise<ClimatologyWeather | null> {
  const [, tm, td] = date.split('-').map(Number)
  // archive 有約數日延遲；取到「今天 -5 天」往前約 11 年
  const now = new Date()
  const end = new Date(now.getTime() - 5 * 86400000)
  const endStr = end.toISOString().slice(0, 10)
  const startStr = `${end.getUTCFullYear() - 10}-01-01`
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`
    + `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
    + `&start_date=${startStr}&end_date=${endStr}`
  const j = await fetchJson(url, 22000)
  const t: string[] = j.daily?.time ?? []
  if (t.length === 0) return null
  const target = dayOfYear(2001, tm, td) // 用非閏年基準算「年內第幾天」
  const maxs: number[] = [], mins: number[] = [], precs: number[] = []
  const yearWet = new Map<number, boolean>() // 每年「目標日當天」是否有雨（>1mm）
  for (let i = 0; i < t.length; i++) {
    const [yy, mm, dd] = t[i].split('-').map(Number)
    let dist = Math.abs(dayOfYear(2001, mm, dd) - target)
    if (dist > 182) dist = 365 - dist // 跨年環繞
    if (dist > 3) continue
    const mx = j.daily.temperature_2m_max?.[i], mn = j.daily.temperature_2m_min?.[i], pr = j.daily.precipitation_sum?.[i]
    if (mx != null) maxs.push(mx)
    if (mn != null) mins.push(mn)
    if (pr != null) precs.push(pr)
    if (dist === 0 && pr != null) yearWet.set(yy, pr > 1)
  }
  if (maxs.length === 0) return null
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const years = yearWet.size
  const yearsWithRain = Array.from(yearWet.values()).filter(Boolean).length
  const rainProb = years > 0 ? Math.round((yearsWithRain / years) * 100) : Math.round((precs.filter((p) => p > 1).length / Math.max(1, precs.length)) * 100)
  const icon: WeatherIconKey = rainProb >= 55 ? 'rain' : rainProb >= 30 ? 'partly' : 'sun'
  return {
    mode: 'climatology', date,
    icon, label: iconLabel(icon),
    avgMax: r(mean(maxs)), avgMin: r(mean(mins)),
    rainProb,
    avgPrecip: Math.round(mean(precs) * 10) / 10,
    tempLow: r(Math.min(...mins)), tempHigh: r(Math.max(...maxs)),
    years, yearsWithRain,
  }
}
