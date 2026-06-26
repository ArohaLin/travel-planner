import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { getAuthUser } from '@/lib/auth/user'
import { ToastProvider } from '@/components/ui/Toast'

export default async function ItineraryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)

  if (!user) redirect('/login')

  // 可見性檢查（成員或管理者）
  const access = await getItineraryAccess(createServiceRoleClient(), params.id, user.id)
  if (!access.visible) redirect('/dashboard')

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
