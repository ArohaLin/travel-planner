import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'

export default async function ItineraryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify access
  const { data: member } = await supabase
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!member) redirect('/dashboard')

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
