import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const category = new URL(req.url).searchParams.get('category') || '住宿'
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lodging_research')
    .select('*')
    .eq('category', category)
    .order('rating', { ascending: false, nullsFirst: false })
    .order('total_reviews', { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  return NextResponse.json({ items: (data ?? []).map(mapLodging) })
}
