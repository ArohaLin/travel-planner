import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

const BUCKET = 'temp-uploads'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { fileName } = body as { fileName?: string }
  if (!fileName) return NextResponse.json({ error: '缺少 fileName' }, { status: 400 })

  const db = createServiceRoleClient()

  // 確保 bucket 存在（私有，不公開）
  const { data: buckets } = await db.storage.listBuckets()
  if (!buckets?.find((b: { name: string }) => b.name === BUCKET)) {
    await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 })
  }

  // 固定路徑格式：{userId}/{timestamp}-{sanitizedFileName}
  const safe = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 80)
  const path = `${user.id}/${Date.now()}-${safe}`

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[request-upload] signed URL 失敗:', error)
    return NextResponse.json({ error: '無法產生上傳連結' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path })
}
