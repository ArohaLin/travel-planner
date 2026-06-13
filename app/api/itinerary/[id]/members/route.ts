import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { SignJWT, jwtVerify } from 'jose'

const jwtSecretValue = process.env.INVITE_JWT_SECRET
if (!jwtSecretValue) throw new Error('INVITE_JWT_SECRET 環境變數未設定')
const secret = new TextEncoder().encode(jwtSecretValue)

/**
 * GET — 成員管理頁資料（多人模式一層權限版）
 * 回傳目前成員；若請求者可管理（建立者或管理者），另附上「所有帳號」供勾選。
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const canManage = access.effectiveRole === 'owner'

  // user_id 與 invited_by 都指向 profiles，需指明用 user_id 的關聯
  const { data: members, error } = await db
    .from('itinerary_members')
    .select(`
      id, role, joined_at, user_id,
      profiles!itinerary_members_user_id_fkey ( id, display_name, avatar_url, global_role )
    `)
    .eq('itinerary_id', params.id)
    .order('joined_at', { ascending: true })

  if (error) return NextResponse.json({ error: '載入成員失敗' }, { status: 500 })

  let allUsers: unknown[] | undefined
  if (canManage) {
    const { data: users } = await db
      .from('profiles')
      .select('id, display_name, avatar_url, global_role')
      .order('display_name', { ascending: true })
    allUsers = users ?? []
  }

  return NextResponse.json({
    canManage,
    effectiveRole: access.effectiveRole,
    members: members ?? [],
    allUsers,
  })
}

/**
 * PUT — 勾選/取消勾選使用者可見此行程（建立者或管理者）
 * body: { userId, visible }
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (access.effectiveRole !== 'owner') {
    return NextResponse.json({ error: '只有建立者或管理者可以管理成員' }, { status: 403 })
  }

  const { userId, visible } = await request.json()
  if (typeof userId !== 'string' || typeof visible !== 'boolean') {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  // 不可動建立者
  const { data: target } = await db
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (target?.role === 'owner') {
    return NextResponse.json({ error: '建立者固定可見，無法移除' }, { status: 400 })
  }

  if (visible) {
    // 角色欄位僅作標記（能力由全域角色決定）：guest 存 viewer、其他存 editor
    const { data: profile } = await db
      .from('profiles')
      .select('global_role')
      .eq('id', userId)
      .single()
    const markerRole = profile?.global_role === 'guest' ? 'viewer' : 'editor'
    const { error } = await db.from('itinerary_members').upsert(
      {
        itinerary_id: params.id,
        user_id: userId,
        role: markerRole,
        invited_by: user.id,
      },
      { onConflict: 'itinerary_id,user_id' },
    )
    if (error) return NextResponse.json({ error: '加入失敗' }, { status: 500 })
  } else {
    const { error } = await db
      .from('itinerary_members')
      .delete()
      .eq('itinerary_id', params.id)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: '移除失敗' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// POST — 邀請連結（保留後端相容：token 加入流程；產生連結的 UI 已移除）
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await request.json()

  // Accept invite flow
  if (body.token) {
    try {
      const { payload } = await jwtVerify(body.token, secret)
      if (payload.itineraryId !== params.id) {
        return NextResponse.json({ error: '邀請連結無效' }, { status: 400 })
      }

      const db = createServiceRoleClient()
      const { error } = await db.from('itinerary_members').upsert({
        itinerary_id: params.id,
        user_id: user.id,
        role: payload.role as string,
        invited_by: payload.invitedBy as string,
      }, { onConflict: 'itinerary_id,user_id' })

      if (error) return NextResponse.json({ error: '加入失敗' }, { status: 500 })

      return NextResponse.json({ success: true, role: payload.role })
    } catch {
      return NextResponse.json({ error: '邀請連結已過期或無效' }, { status: 400 })
    }
  }

  // Create invite link flow（建立者或管理者）
  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (access.effectiveRole !== 'owner') {
    return NextResponse.json({ error: '只有建立者或管理者可以邀請成員' }, { status: 403 })
  }

  const { role = 'editor' } = body
  const token = await new SignJWT({
    itineraryId: params.id,
    role,
    invitedBy: user.id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const inviteUrl = `${baseUrl}/itinerary/${params.id}/join?token=${token}`

  return NextResponse.json({ inviteUrl, role })
}

// DELETE — 移除成員（管理者/建立者移人，或自己離開）
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { userId } = await request.json()
  const targetUserId = userId ?? user.id

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.visible) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  // 移除別人需要管理權限；自己離開不用
  if (targetUserId !== user.id && access.effectiveRole !== 'owner') {
    return NextResponse.json({ error: '只有建立者或管理者可以移除其他成員' }, { status: 403 })
  }

  // 建立者不可被移除/離開（請刪除行程）
  const { data: target } = await db
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (target?.role === 'owner') {
    return NextResponse.json({ error: '建立者無法離開行程，請直接刪除行程' }, { status: 400 })
  }

  await db.from('itinerary_members')
    .delete()
    .eq('itinerary_id', params.id)
    .eq('user_id', targetUserId)

  return NextResponse.json({ success: true })
}
