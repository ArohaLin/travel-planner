import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { BugReportSheet } from '@/components/ui/BugReportSheet'
import { ItineraryCardItem } from '@/components/dashboard/ItineraryCardItem'
import type { GlobalRole } from '@/lib/types/collaboration'

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const db = createServiceRoleClient()
  const [{ data: members }, { data: profile }] = await Promise.all([
    db
      .from('itinerary_members')
      .select(`
        role,
        itineraries (
          id, title, destination, start_date, end_date,
          status, updated_at
        )
      `)
      .eq('user_id', user!.id)
      .order('joined_at', { ascending: false }),
    db.from('profiles').select('display_name, global_role').eq('id', user!.id).single(),
  ])

  const globalRole = (profile?.global_role ?? 'regular') as GlobalRole
  const isGuest = globalRole === 'guest'

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const itineraries: any[] = (members ?? []).map((m: any) => ({
    ...(m.itineraries as any),
    // 一層權限：能力由全域角色決定（建立者標 owner 供刪除/改名判斷）
    role: isGuest ? 'viewer' : m.role === 'owner' ? 'owner' : 'editor',
  }))

  // 管理者：自動看到系統內所有行程（自己參與的之外，列在「管理檢視」）
  let adminItineraries: any[] = []
  if (globalRole === 'admin') {
    const memberIds = new Set(itineraries.map((t: any) => t.id))
    const { data: all } = await db
      .from('itineraries')
      .select('id, title, destination, start_date, end_date, status, updated_at')
      .order('updated_at', { ascending: false })
    adminItineraries = (all ?? [])
      .filter((t: any) => !memberIds.has(t.id))
      .map((t: any) => ({ ...t, role: 'owner' }))
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div
        className="bg-white sticky top-0 z-10 px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">我的行程</h1>
            <p className="text-sm text-gray-500">{profile?.display_name ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <BugReportSheet globalRole={globalRole} />
            <Link href="/profile" className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm flex-shrink-0" title="會員資料">
              {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
            </Link>
            {!isGuest && (
              <Link href="/itinerary/new">
                <Button size="sm" className="gap-1">
                  <span>＋</span> 新建
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Itinerary list */}
      <div className="p-4 flex flex-col gap-3">
        {itineraries.length === 0 && adminItineraries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">✈️</div>
            <p className="text-lg font-medium text-gray-700 mb-2">還沒有行程</p>
            <p className="text-sm mb-6">建立第一個 AI 旅遊行程吧！</p>
            <Link href="/itinerary/new">
              <Button>開始規劃</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {itineraries.map((trip: any) => <ItineraryCardItem key={trip.id} trip={trip} />)}
            {adminItineraries.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 mt-2 px-1">
                  🛡️ 管理檢視（其他成員的行程）
                </p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {adminItineraries.map((trip: any) => <ItineraryCardItem key={trip.id} trip={trip} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
