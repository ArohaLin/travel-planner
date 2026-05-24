import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ItineraryClient } from './ItineraryClient'
import type { Itinerary } from '@/lib/types/itinerary'
import type { MemberRole, GlobalRole } from '@/lib/types/collaboration'

export default async function ItineraryPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: row }, { data: member }, { data: profile }] = await Promise.all([
    supabase.from('itineraries').select('data, version').eq('id', params.id).single(),
    supabase.from('itinerary_members').select('role').eq('itinerary_id', params.id).eq('user_id', user.id).single(),
    supabase.from('profiles').select('display_name, avatar_url, global_role').eq('id', user.id).single(),
  ])

  if (!row || !member) redirect('/dashboard')

  return (
    <ItineraryClient
      itineraryId={params.id}
      initialItinerary={row.data as Itinerary}
      initialVersion={row.version}
      role={member.role as MemberRole}
      currentUser={{
        userId: user.id,
        displayName: profile?.display_name ?? user.email ?? '使用者',
        avatarUrl: profile?.avatar_url ?? null,
        globalRole: (profile?.global_role ?? 'regular') as GlobalRole,
      }}
    />
  )
}
