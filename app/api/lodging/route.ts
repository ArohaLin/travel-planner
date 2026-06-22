import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { mapLodging } from '@/lib/types/lodging'

/**
 * 住宿深入研究列表（探索→住宿評價）。
 * 任何登入者可讀；資料為離線研究產出（lodging_research），瀏覽不耗 AI。
 * 一次回全部（含 pros/cons），前端做列表／詳情／比較，免 N+1。
 */
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lodging_research')
    .select('*')
    .order('rating', { ascending: false, nullsFirst: false })
    .order('total_reviews', { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  return NextResponse.json({ items: (data ?? []).map(mapLodging) })
}
