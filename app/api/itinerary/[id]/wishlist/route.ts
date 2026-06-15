import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'
import { mapWishlistItem } from '@/lib/types/recommendation'

/** 共用：驗證登入 + 取得 db / access。 */
async function auth(id: string) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: '未登入' }, { status: 401 }) }
  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, id, user.id)
  if (!access.visible) return { error: NextResponse.json({ error: '無權限' }, { status: 403 }) }
  return { db, user, access }
}

/** 列出願望清單 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const a = await auth(params.id)
  if ('error' in a) return a.error
  const { data } = await a.db
    .from('wishlist_items')
    .select('*')
    .eq('itinerary_id', params.id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ items: (data ?? []).map(mapWishlistItem) })
}

/** 加入願望清單（可編輯成員） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await auth(params.id)
  if ('error' in a) return a.error
  if (!a.access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  if (!b?.name) return NextResponse.json({ error: '缺少名稱' }, { status: 400 })

  // 同行程同地點不重複加（以 google_place_id 為準）
  if (b.googlePlaceId) {
    const { data: dup } = await a.db
      .from('wishlist_items')
      .select('id')
      .eq('itinerary_id', params.id)
      .eq('google_place_id', b.googlePlaceId)
      .maybeSingle()
    if (dup) return NextResponse.json({ error: '已在願望清單中', duplicate: true }, { status: 409 })
  }

  const { data, error } = await a.db
    .from('wishlist_items')
    .insert({
      itinerary_id: params.id,
      added_by: a.user.id,
      source: b.source ?? 'recommendation',
      recommendation_id: b.recommendationId ?? null,
      google_place_id: b.googlePlaceId ?? null,
      name: b.name,
      category: b.category ?? null,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      photo_ref: b.photoRef ?? null,
      note: b.note ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: '加入失敗' }, { status: 500 })
  return NextResponse.json({ item: mapWishlistItem(data) })
}

/** 更新願望清單項目（標記已加入行程；可編輯成員） */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await auth(params.id)
  if ('error' in a) return a.error
  if (!a.access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (!b?.itemId) return NextResponse.json({ error: '缺少 itemId' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.status) patch.status = b.status
  if (typeof b.note === 'string') patch.note = b.note
  await a.db.from('wishlist_items').update(patch).eq('id', b.itemId).eq('itinerary_id', params.id)
  return NextResponse.json({ success: true })
}

/** 刪除願望清單項目（可編輯成員） */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const a = await auth(params.id)
  if ('error' in a) return a.error
  if (!a.access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: '缺少 itemId' }, { status: 400 })
  await a.db.from('wishlist_items').delete().eq('id', itemId).eq('itinerary_id', params.id)
  return NextResponse.json({ success: true })
}
