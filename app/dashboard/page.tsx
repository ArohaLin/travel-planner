import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDateRange } from '@/lib/utils/date'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { BugReportSheet } from '@/components/ui/BugReportSheet'
import type { GlobalRole } from '@/lib/types/collaboration'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已發布',
  archived: '已封存',
}

const ROLE_LABELS: Record<string, string> = {
  owner: '擁有者',
  editor: '編輯者',
  viewer: '觀看者',
}

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: members } = await supabase
    .from('itinerary_members')
    .select(`
      role,
      itineraries (
        id, title, destination, start_date, end_date,
        status, updated_at
      )
    `)
    .eq('user_id', user!.id)
    .order('joined_at', { ascending: false })

  const itineraries = (members ?? []).map((m) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(m.itineraries as any),
    role: m.role,
  }))

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, global_role')
    .eq('id', user!.id)
    .single()

  const globalRole = (profile?.global_role ?? 'regular') as GlobalRole

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
            <Link href="/itinerary/new">
              <Button size="sm" className="gap-1">
                <span>＋</span> 新建
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Itinerary list */}
      <div className="p-4 flex flex-col gap-3">
        {itineraries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">✈️</div>
            <p className="text-lg font-medium text-gray-700 mb-2">還沒有行程</p>
            <p className="text-sm mb-6">建立第一個 AI 旅遊行程吧！</p>
            <Link href="/itinerary/new">
              <Button>開始規劃</Button>
            </Link>
          </div>
        ) : (
          itineraries.map((trip) => (
            <Link key={trip.id} href={`/itinerary/${trip.id}`}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 active:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="font-semibold text-gray-900 leading-snug flex-1">{trip.title}</h2>
                  <div className="flex gap-1 flex-shrink-0">
                    {trip.role !== 'owner' && (
                      <Badge variant="default">{ROLE_LABELS[trip.role]}</Badge>
                    )}
                    {trip.status === 'draft' && (
                      <Badge variant="yellow">{STATUS_LABELS[trip.status]}</Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-1">📍 {trip.destination}</p>
                <p className="text-sm text-gray-400">
                  {formatDateRange(trip.start_date, trip.end_date)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
