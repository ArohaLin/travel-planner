import type { Metadata } from 'next'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { BrochureView } from '@/components/brochure/BrochureView'
import { BrochureBackButton } from '@/components/brochure/BrochureBackButton'
import type { Itinerary } from '@/lib/types/itinerary'
import type { BrochureCache } from '@/lib/types/brochure'

// token 讀取、需即時反映開關狀態，不做整頁靜態快取
export const dynamic = 'force-dynamic'

interface ShareRow {
  data: Itinerary
  public_share: boolean
  brochure_cache: BrochureCache | null
}

async function getShare(token: string): Promise<ShareRow | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('itineraries')
    .select('data, public_share, brochure_cache')
    .eq('share_token', token)
    .maybeSingle()
  if (!data || !data.public_share) return null
  return data as ShareRow
}

export async function generateMetadata({
  params,
}: {
  params: { token: string }
}): Promise<Metadata> {
  const row = await getShare(params.token)
  if (!row) return { title: '行程連結｜旅遊規劃' }
  const { metadata } = row.data
  return {
    title: `${metadata.title}｜旅程手冊`,
    description: `${metadata.destination} ${row.data.days.length} 天旅程`,
  }
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const row = await getShare(params.token)

  if (!row) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🧳</div>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">找不到這份行程</h1>
          <p className="text-sm text-gray-500">
            這個分享連結可能已被關閉，或網址不正確。請向分享者重新索取連結。
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <BrochureBackButton />
      <BrochureView itinerary={row.data} cache={row.brochure_cache} token={params.token} />
    </main>
  )
}
