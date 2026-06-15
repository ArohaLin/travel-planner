import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { mapRecommendation } from '@/lib/types/recommendation'

/**
 * 精選推薦讀取：依行程目的地文字 q 比對 region（q 含 region 即回傳）。
 * 任何登入者可讀；資料為靜態策展，瀏覽不耗 AI。
 */
export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('recommendations')
    .select('*')
    .eq('status', 'published')
    .order('credibility', { ascending: false })
  if (error) return NextResponse.json({ error: '讀取失敗' }, { status: 500 })

  // 以目的地文字比對 region（例：destination「台東」⊇ region「台東」）
  const rows = (data ?? []).filter((r: { region: string }) => !q || q.includes(r.region))
  const items = rows.map(mapRecommendation)
  const regions = Array.from(new Set(items.map((r: { region: string }) => r.region)))
  return NextResponse.json({ items, regions })
}
