import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

/** 列出某問題的所有留言（時間升序） */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('bug_report_comments')
    .select('*')
    .eq('bug_report_id', params.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: '讀取留言失敗', details: error.message }, { status: 500 })
  }
  return NextResponse.json({ comments: data ?? [] })
}

/** 新增一則留言（回饋 / 回覆） */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await req.json()
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const kind = ['feedback', 'reply', 'status'].includes(body.kind) ? body.kind : 'feedback'
  if (!text) return NextResponse.json({ error: '留言內容不可為空' }, { status: 400 })

  const db = createServiceRoleClient()

  // 取得作者顯示名稱
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, global_role')
    .eq('id', user.id)
    .single()

  const { data, error } = await db
    .from('bug_report_comments')
    .insert({
      bug_report_id: params.id,
      author_id: user.id,
      author_name: profile?.display_name ?? user.email ?? '使用者',
      body: text,
      kind,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: '新增留言失敗', details: error.message }, { status: 500 })
  }

  // 若使用者回饋「驗證未過」，可選擇把問題狀態改回 open（前端傳 reopenStatus 時）
  if (body.reopenStatus && ['open', 'in_progress'].includes(body.reopenStatus)) {
    await db.from('bug_reports').update({ status: body.reopenStatus }).eq('id', params.id)
  }

  return NextResponse.json({ comment: data })
}
