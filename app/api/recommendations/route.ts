import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { mapRecommendation, type Recommendation } from '@/lib/types/recommendation'
import { mapLodgingToRecommendation } from '@/lib/utils/lodgingToRec'

/**
 * 精選推薦讀取。
 * - 任何登入者可讀；資料為靜態策展，瀏覽不耗 AI。
 * - `regions`：永遠回傳所有已發布地區（供前端地區選擇器）。
 * - `region` 參數：`all`＝全部地區；指定地區名＝只該區；未帶＝用目的地文字 q 比對的預設區
 *   （比對不到則回全部）。回傳 `region` 為實際生效的地區，供前端高亮對應 chip。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const region = (searchParams.get('region') ?? '').trim()

  const db = createServiceRoleClient()
  const [recResult, lodgingResult] = await Promise.all([
    db.from('recommendations').select('*').eq('status', 'published').order('credibility', { ascending: false }),
    db.from('lodging_research')
      .select('id, google_place_id, name, category, city, district, address, rating, total_reviews, photo_ref, verdict, suitable_for, researched_at, features')
      .gte('rating', 4.0),
  ])
  if (recResult.error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  const all = recResult.data ?? []
  const recPlaceIds = new Set(all.map((r: { google_place_id: string }) => r.google_place_id))

  // lodging_research → 合併進精選推薦（去除與 recommendations 重複的 place_id）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lodgingItems: Recommendation[] = (lodgingResult.data ?? [])
    .filter((lr: any) => lr.google_place_id && !recPlaceIds.has(lr.google_place_id as string))
    .map(mapLodgingToRecommendation)

  // 所有可用地區（recommendations + lodging_research）
  const recRegions = Array.from(new Set(all.map((r: { region: string }) => r.region as string)))
  const lodgingRegions = lodgingItems.map((lr) => lr.region).filter((r): r is string => !!r)
  const regions: string[] = Array.from(new Set([...recRegions, ...lodgingRegions])).filter((r): r is string => !!r)

  // 決定生效地區：明確指定 > 目的地比對 > 全部
  let effective: string
  if (region === 'all') effective = 'all'
  else if (region) effective = region
  else effective = regions.find((rg) => q && q.includes(rg)) ?? 'all'

  const filteredRecs = effective === 'all' ? all : all.filter((r: { region: string }) => r.region === effective)
  const filteredLodging = effective === 'all'
    ? lodgingItems
    : lodgingItems.filter((lr) => lr.region === effective)

  // 合併並依可信度排序
  const items = [
    ...filteredRecs.map(mapRecommendation),
    ...filteredLodging,
  ].sort((a, b) => (b.credibility ?? 0) - (a.credibility ?? 0))

  return NextResponse.json({ items, regions, region: effective })
}
