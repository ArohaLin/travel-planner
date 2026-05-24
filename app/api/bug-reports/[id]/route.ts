import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { UpdateBugReportPayload } from '@/lib/types/bugReport'

// ── 共用：驗證 admin 身份 ─────────────────────────────────────────────────────
async function requireAdmin(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }
  const db = createServiceRoleClient()
  const { data: profile } = await db.from('profiles').select('global_role').eq('id', user.id).single()
  if (profile?.global_role !== 'admin') return { error: NextResponse.json({ error: '需要管理員權限' }, { status: 403 }) }
  return { user, db }
}

// ── PATCH：更新 Bug Report（僅 admin）────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const { db } = auth

  const body = await request.json() as UpdateBugReportPayload
  const updateData: Record<string, unknown> = {}

  if (body.status !== undefined) {
    updateData.status = body.status
    if (body.status === 'resolved' || body.status === 'closed') {
      updateData.resolved_at = new Date().toISOString()
    }
  }
  if (body.resolution !== undefined) updateData.resolution = body.resolution || null
  if (body.assignee_id !== undefined) updateData.assignee_id = body.assignee_id
  if (body.priority !== undefined) updateData.priority = body.priority

  const { data, error } = await db
    .from('bug_reports')
    .update(updateData)
    .eq('id', params.id)
    .select('id, status, resolved_at')
    .single()

  if (error) {
    console.error('[bug-reports PATCH]', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }

  return NextResponse.json({ report: data })
}

// ── DELETE：刪除 Bug Report（僅 admin）───────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const { db } = auth

  const { error } = await db
    .from('bug_reports')
    .delete()
    .eq('id', params.id)

  if (error) {
    console.error('[bug-reports DELETE]', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
