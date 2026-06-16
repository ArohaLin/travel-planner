import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { mapRecommendation } from '@/lib/types/recommendation'

/**
 * 精選推薦讀取。
 * - 任何登入者可讀；資料為靜態策展，瀏覽不耗 AI。
 * - `regions`：永遠回傳所有已發布地區（供前端地區選擇器）。
 * - `region` 參數：`all`＝全部地區；指定地區名＝只該區；未帶＝用目的地文字 q 比對的預設區
 *   （比對不到則回全部）。回傳 `region` 為實際生效的地區，供前端高亮對應 chip。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const region = (searchParams.get('region') ?? '').trim()

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('recommendations')
    .select('*')
    .eq('status', 'published')
    .order('credibility', { ascending: false })
  if (error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  const all = data ?? []
  const regions: string[] = Array.from(new Set(all.map((r: { region: string }) => r.region as string)))

  // 決定生效地區：明確指定 > 目的地比對 > 全部
  let effective: string
  if (region === 'all') effective = 'all'
  else if (region) effective = region
  else effective = regions.find((rg) => q && q.includes(rg)) ?? 'all'

  const rows = effective === 'all' ? all : all.filter((r: { region: string }) => r.region === effective)
  const items = rows.map(mapRecommendation)
  return NextResponse.json({ items, regions, region: effective })
}
