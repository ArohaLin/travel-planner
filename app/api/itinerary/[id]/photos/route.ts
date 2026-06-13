import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { fetchAndStoreActivityPhotos } from '@/lib/maps/activityPhotos'

// 抓圖可能要打數十次 Places
export const maxDuration = 60

/**
 * 為既有行程「補抓」缺少的景點照片（給尚未在生成時抓圖的舊行程）。
 * 由行程頁前端偵測到有景點缺 photoRef 時觸發一次；只補缺的，成本有上限。
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: '無編輯權限' }, { status: 403 })

  const updated = await fetchAndStoreActivityPhotos(db, params.id)
  return NextResponse.json({ updated })
}
