import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getServerMapsKey } from '@/lib/maps/places'

/**
 * 即時查地點營業時間（Google Place Details），給「智慧建議時段」避開公休/打烊用。
 * 以 place_id 為鍵；登入可用。回傳每週時段 periods 與每日文字，由前端依建議日期/時間判斷開不開。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const placeId = new URL(req.url).searchParams.get('placeId')
  const key = getServerMapsKey()
  if (!placeId || !key) return NextResponse.json({ periods: null, businessStatus: null })

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=opening_hours,business_status,name&language=zh-TW&key=${key}`
    const j = await (await fetch(url)).json()
    if (j.status !== 'OK') return NextResponse.json({ periods: null, businessStatus: null })
    const oh = j.result?.opening_hours
    return NextResponse.json(
      {
        businessStatus: j.result?.business_status ?? null,
        periods: oh?.periods ?? null,            // [{open:{day,time},close?:{day,time}}]，day 0=週日
        weekdayText: oh?.weekday_text ?? null,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
    )
  } catch {
    return NextResponse.json({ periods: null, businessStatus: null })
  }
}
