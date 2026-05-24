import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, db: null, error: NextResponse.json({ error: '未登入' }, { status: 401 }) }

  const db = createServiceRoleClient()
  const { data: profile } = await db.from('profiles').select('global_role').eq('id', user.id).single()
  if (profile?.global_role !== 'admin') {
    return { user: null, db: null, error: NextResponse.json({ error: '無管理員權限' }, { status: 403 }) }
  }
  return { user, db, error: null }
}

// PATCH /api/admin/users/[userId] — 更新使用者（名稱、角色、密碼）
export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } },
) {
  const { db, error } = await requireAdmin()
  if (error) return error

  const { userId } = params
  const body = await request.json()
  const { display_name, global_role, password } = body

  // 更新密碼（如有）
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: '密碼至少6位' }, { status: 400 })
    }
    const { error: pwErr } = await db!.auth.admin.updateUserById(userId, { password })
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 })
  }

  // 更新 profile（名稱 / 角色）
  const updates: Record<string, unknown> = {}
  if (display_name !== undefined) updates.display_name = display_name.trim()
  if (global_role !== undefined) updates.global_role = global_role

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await db!.from('profiles').update(updates).eq('id', userId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/admin/users/[userId] — 刪除使用者
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } },
) {
  const { user, db, error } = await requireAdmin()
  if (error) return error

  const { userId } = params

  // 不能刪除自己
  if (userId === user!.id) {
    return NextResponse.json({ error: '不能刪除自己的帳號' }, { status: 400 })
  }

  const { error: deleteErr } = await db!.auth.admin.deleteUser(userId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
