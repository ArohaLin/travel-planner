import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { GlobalRole } from '@/lib/types/collaboration'

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

// GET /api/admin/users — 列出所有使用者（含 email）
export async function GET() {
  const { db, error } = await requireAdmin()
  if (error) return error

  // 從 profiles 取得基本資料
  const { data: profiles, error: profilesErr } = await db!
    .from('profiles')
    .select('id, display_name, avatar_url, global_role, created_at')
    .order('created_at', { ascending: true })

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 })

  // 從 auth.users 取得 email（使用 Admin API）
  const { data: { users: authUsers }, error: authErr } = await db!.auth.admin.listUsers()
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const emailMap = new Map(authUsers.map((u: { id: string; email?: string }) => [u.id, u.email ?? '']))

  const result = (profiles ?? []).map((p: { id: string; display_name: string; avatar_url: string | null; global_role: string; created_at: string }) => ({
    ...p,
    email: emailMap.get(p.id) ?? '',
  }))

  return NextResponse.json(result)
}

// POST /api/admin/users — 建立新使用者
export async function POST(request: Request) {
  const { db, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const { display_name, email, password, global_role = 'regular' } = body

  if (!display_name?.trim() || !email?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: '請填寫完整資訊（密碼至少6位）' }, { status: 400 })
  }

  // 建立 auth 使用者
  const { data: newUser, error: createErr } = await db!.auth.admin.createUser({
    email: email.trim(),
    password,
    user_metadata: { display_name: display_name.trim() },
    email_confirm: true, // 跳過 email 確認
  })

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 })
  }

  // 確保 profile 存在，並設定 global_role
  // （trigger handle_new_user 會自動建立 profile，但 global_role 需要手動更新）
  await db!.from('profiles').upsert({
    id: newUser.user.id,
    display_name: display_name.trim(),
    global_role: global_role as GlobalRole,
  }, { onConflict: 'id' })

  return NextResponse.json({ id: newUser.user.id, email, display_name, global_role }, { status: 201 })
}
