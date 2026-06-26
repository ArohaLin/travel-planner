import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { ToastProvider } from '@/components/ui/Toast'
import { BottomNav } from '@/components/ui/BottomNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const user = await getAuthUser(supabase)

  if (!user) redirect('/login')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#FBFAF7] pb-[calc(64px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav />
    </ToastProvider>
  )
}
