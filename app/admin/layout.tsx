import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

export const metadata = { title: '開發報告' }

/**
 * /admin 區獨立路由樹：只有管理員可進，且不套用 dashboard 底部導覽或行程頁外殼，
 * 因此完全不影響平時看行程的介面。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/reports')

  const db = createServiceRoleClient()
  const { data: profile } = await db
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (profile?.global_role !== 'admin') redirect('/dashboard')

  return <div className="min-h-[100dvh] bg-gray-50">{children}</div>
}
