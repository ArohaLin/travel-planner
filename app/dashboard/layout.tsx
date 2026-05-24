import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import { BottomNav } from '@/components/ui/BottomNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50 pb-[calc(64px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav />
    </ToastProvider>
  )
}
