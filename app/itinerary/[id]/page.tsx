import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { getAuthUser } from '@/lib/auth/user'
import { ItineraryClient } from './ItineraryClient'
import type { Itinerary } from '@/lib/types/itinerary'
import type { GlobalRole } from '@/lib/types/collaboration'

export default async function ItineraryPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)

  if (!user) redirect('/login')

  const db = createServiceRoleClient()
  const [access, { data: row }, { data: profile }] = await Promise.all([
    getItineraryAccess(db, params.id, user.id),
    db.from('itineraries').select('data, version').eq('id', params.id).single(),
    db.from('profiles').select('display_name, avatar_url, global_role').eq('id', user.id).single(),
  ])

  if (!row || !access.visible) redirect('/dashboard')

  return (
    <ItineraryClient
      itineraryId={params.id}
      initialItinerary={row.data as Itinerary}
      initialVersion={row.version}
      role={access.effectiveRole!}
      currentUser={{
        userId: user.id,
        displayName: profile?.display_name ?? user.email ?? '使用者',
        avatarUrl: profile?.avatar_url ?? null,
        globalRole: (profile?.global_role ?? 'regular') as GlobalRole,
      }}
    />
  )
}
