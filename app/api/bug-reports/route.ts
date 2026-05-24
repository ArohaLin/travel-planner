import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateBugReportPayload } from '@/lib/types/bugReport'

// ── POST：新增 Bug Report ──────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await request.json() as CreateBugReportPayload

  if (!body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json({ error: '標題與問題描述為必填' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('bug_reports')
    .insert({
      title: body.title.trim(),
      description: body.description.trim(),
      expected: body.expected?.trim() || null,
      page_name: body.page_name?.trim() || '未指定',
      page_url: body.page_url || null,
      category: body.category || 'other',
      priority: body.priority || 'medium',
      reporter_id: user.id,
      browser_info: body.browser_info || null,
    })
    .select('id, bug_number')
    .single()

  if (error) {
    console.error('[bug-reports POST]', error)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, bugNumber: data.bug_number }, { status: 201 })
}

// ── GET：列出所有 Bug Reports（僅 admin）────────────────────────────────────
export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  // Check admin role
  const db = createServiceRoleClient()
  const { data: profile } = await db
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (profile?.global_role !== 'admin') {
    return NextResponse.json({ error: '需要管理員權限' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // optional filter
  const limit = parseInt(searchParams.get('limit') ?? '50')

  let query = db
    .from('bug_reports')
    .select(`
      *,
      reporter:reporter_id ( display_name, avatar_url ),
      assignee:assignee_id ( display_name, avatar_url )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[bug-reports GET]', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  return NextResponse.json({ reports: data })
}
