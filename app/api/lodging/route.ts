import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { mapLodging } from '@/lib/types/lodging'

// 永遠回最新（離線研究更新 DB 後，瀏覽端立即反映，不被 fetch 快取卡住）
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 商家深入研究列表（探索→住宿評價／店家評價）。
 * 任何登入者可讀；資料為離線研究產出（lodging_research），瀏覽不耗 AI。
 * 一次回全部（含 pros/cons），前端做列表／詳情／比較，免 N+1。
 * ?category= 指定類別（預設「住宿」）；店家評價分頁傳「台東衝浪」等。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  // category=指定類別；kind=shop→所有非住宿類別（店家評價分頁，可含多類別）；預設住宿
  const sp = new URL(req.url).searchParams
  const category = sp.get('category')
  const kind = sp.get('kind')
  const db = createServiceRoleClient()
  let q = db.from('lodging_research').select('*')
  if (category) q = q.eq('category', category)
  else if (kind === 'shop') q = q.neq('category', '住宿')
  else q = q.eq('category', '住宿')
  const { data, error } = await q
    .order('rating', { ascending: false, nullsFirst: false })
    .order('total_reviews', { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  return NextResponse.json({ items: (data ?? []).map(mapLodging) })
}
