import { NextResponse } from 'next/server'
import { getForecast, getClimatology, type WeatherResult } from '@/lib/weather/openMeteo'

// 公開、非敏感（只吃景點座標＋日期）；模式由伺服器依「距今天數」決定：
//   過去 → none；≤14 天 → 實際預報；>14 天 → 歷年同期統計。
export const runtime = 'nodejs'
export const maxDuration = 30 // 歷年同期 archive 查詢可能需數秒

function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / 86400000)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const date = searchParams.get('date') ?? ''
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const du = daysUntil(date)
  let result: WeatherResult = { mode: 'none' }
  let sMaxage = 600
  try {
    if (du < 0) {
      result = { mode: 'none' } // 過去的日期不顯示天氣
    } else if (du <= 14) {
      result = (await getForecast(lat, lng, date)) ?? { mode: 'none' }
      sMaxage = 3600 // 預報 1 小時
    } else {
      result = (await getClimatology(lat, lng, date)) ?? { mode: 'none' }
      sMaxage = 604800 // 歷年統計幾乎不變 → 7 天
    }
  } catch (e) {
    console.warn('[weather] 失敗:', String(e).slice(0, 120))
    result = { mode: 'none' }
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': `public, s-maxage=${sMaxage}, stale-while-revalidate=${sMaxage * 4}` },
  })
}
