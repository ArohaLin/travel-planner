import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import type { AdminUser } from '@/lib/types/collaboration'

export default async function ProfilePage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/profile')

  const db = createServiceRoleClient()

  // 取得當前使用者 profile
  const { data: profile } = await db
    .from('profiles')
    .select('id, display_name, avatar_url, global_role, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // 如果是 admin，取得所有使用者清單
  let allUsers: AdminUser[] = []

  if (profile.global_role === 'admin') {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, display_name, avatar_url, global_role, created_at')
      .order('created_at', { ascending: true })

    const { data: { users: authUsers } } = await db.auth.admin.listUsers()
    const emailMap = new Map(authUsers.map((u: { id: string; email?: string }) => [u.id, u.email ?? '']))

    allUsers = (profiles ?? []).map((p: { id: string; display_name: string; avatar_url: string | null; global_role: string; created_at: string }) => ({
      id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      global_role: p.global_role as 'admin' | 'regular' | 'guest',
      created_at: p.created_at,
      email: emailMap.get(p.id) ?? '',
    }))
  }

  // 取得所有行程（admin 用）
  const { data: allItineraries } = profile.global_role === 'admin'
    ? await db.from('itineraries').select('id, title, destination, start_date, end_date').order('created_at', { ascending: false })
    : { data: [] }

  return (
    <ProfileClient
      currentUser={{
        id: user.id,
        email: user.email ?? '',
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        global_role: profile.global_role as 'admin' | 'regular' | 'guest',
        created_at: profile.created_at,
      }}
      allUsers={allUsers}
      allItineraries={allItineraries ?? []}
    />
  )
}
