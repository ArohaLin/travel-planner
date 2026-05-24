import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { SignJWT, jwtVerify } from 'jose'

const jwtSecretValue = process.env.INVITE_JWT_SECRET
if (!jwtSecretValue) throw new Error('INVITE_JWT_SECRET 環境變數未設定')
const secret = new TextEncoder().encode(jwtSecretValue)

// GET — list members
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { data, error } = await supabase
    .from('itinerary_members')
    .select(`
      id, role, joined_at, invited_by,
      profiles ( id, display_name, avatar_url )
    `)
    .eq('itinerary_id', params.id)
    .order('joined_at', { ascending: true })

  if (error) return NextResponse.json({ error: '載入成員失敗' }, { status: 500 })

  return NextResponse.json(data)
}

// POST — create invite link or accept invite
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

      const { error } = await supabase.from('itinerary_members').upsert({
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

  // Create invite link flow (owner only)
  const { data: member } = await supabase
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'owner') {
    return NextResponse.json({ error: '只有擁有者可以邀請成員' }, { status: 403 })
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

// DELETE — remove member (owner removes others, or self-leave)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { userId } = await request.json()
  const targetUserId = userId ?? user.id

  const { data: requester } = await supabase
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!requester) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  // Can remove self (leave) or owner can remove others
  if (targetUserId !== user.id && requester.role !== 'owner') {
    return NextResponse.json({ error: '只有擁有者可以移除其他成員' }, { status: 403 })
  }

  // Owner cannot leave (must delete or transfer)
  if (targetUserId === user.id && requester.role === 'owner') {
    return NextResponse.json({ error: '擁有者無法離開行程，請先轉移擁有權或刪除行程' }, { status: 400 })
  }

  await supabase.from('itinerary_members')
    .delete()
    .eq('itinerary_id', params.id)
    .eq('user_id', targetUserId)

  return NextResponse.json({ success: true })
}
