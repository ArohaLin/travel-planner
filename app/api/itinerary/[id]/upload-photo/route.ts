import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getItineraryAccess } from '@/lib/auth/access'

const BUCKET = 'card-photos'

/**
 * 上傳「使用者卡片照片」到 Supabase Storage。
 * 路徑固定 ${itineraryId}/${activityId}.jpg（upsert：換照片直接覆蓋、不留孤兒檔）。
 * 回傳公開 URL（帶 ?v=ts 破 CDN 快取）；前端再以 update_activity patch 寫進 userPhotoUrl。
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()
  const access = await getItineraryAccess(db, params.id, user.id)
  if (!access.canEdit) return NextResponse.json({ error: '無修改權限' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { activityId, data, mimeType = 'image/jpeg' } = body as { activityId?: string; data?: string; mimeType?: string }
  if (!activityId || !data) return NextResponse.json({ error: '缺少照片資料' }, { status: 400 })

  let buffer: Buffer
  try { buffer = Buffer.from(data, 'base64') } catch { return NextResponse.json({ error: '照片格式錯誤' }, { status: 400 }) }
  if (buffer.length > 5 * 1024 * 1024) return NextResponse.json({ error: '照片過大（上限 5MB）' }, { status: 413 })

  // 檔名只取安全字元，避免路徑注入
  const safeId = activityId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'card'
  const path = `${params.id}/${safeId}.jpg`

  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  })
  if (upErr) {
    console.error('[upload-photo] 上傳失敗:', upErr.message)
    return NextResponse.json({ error: '上傳失敗，請再試一次' }, { status: 500 })
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`
  return NextResponse.json({ url })
}
