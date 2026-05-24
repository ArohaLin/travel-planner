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

// GET /api/admin/users/[userId]/itineraries — 取得使用者行程存取清單
export async function GET(
  request: Request,
  { params }: { params: { userId: string } },
) {
  const { db, error } = await requireAdmin()
  if (error) return error

  const { userId } = params

  // 取得該使用者已加入的行程
  const { data: memberships } = await db!
    .from('itinerary_members')
    .select('itinerary_id, role, itineraries(id, title, destination, start_date, end_date)')
    .eq('user_id', userId)

  // 取得所有行程（admin 可看全部）
  const { data: allItineraries } = await db!
    .from('itineraries')
    .select('id, title, destination, start_date, end_date')
    .order('created_at', { ascending: false })

  const memberMap = new Map(
    (memberships ?? []).map((m: { itinerary_id: string; role: string }) => [m.itinerary_id, m.role])
  )

  const result = (allItineraries ?? []).map((it: { id: string; title: string; destination: string; start_date: string; end_date: string }) => ({
    ...it,
    currentRole: memberMap.get(it.id) ?? null,
  }))

  return NextResponse.json(result)
}

// POST /api/admin/users/[userId]/itineraries — 批次設定行程存取
export async function POST(
  request: Request,
  { params }: { params: { userId: string } },
) {
  const { db, error } = await requireAdmin()
  if (error) return error

  const { userId } = params
  const body = await request.json()

  // assignments: Array<{ itineraryId: string, role: 'owner'|'editor'|'viewer'|null }>
  // role = null 表示移除存取
  const { assignments } = body as {
    assignments: { itineraryId: string; role: 'owner' | 'editor' | 'viewer' | null }[]
  }

  if (!Array.isArray(assignments)) {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }

  for (const { itineraryId, role } of assignments) {
    if (role === null) {
      // 移除存取
      await db!.from('itinerary_members')
        .delete()
        .eq('itinerary_id', itineraryId)
        .eq('user_id', userId)
    } else {
      // 新增或更新
      await db!.from('itinerary_members').upsert({
        itinerary_id: itineraryId,
        user_id: userId,
        role,
      }, { onConflict: 'itinerary_id,user_id' })
    }
  }

  return NextResponse.json({ success: true })
}
