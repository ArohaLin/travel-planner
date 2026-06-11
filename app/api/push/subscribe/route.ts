import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Web Push 訂閱管理。
 * POST：儲存（upsert by endpoint）目前裝置的推播訂閱
 * DELETE：移除目前裝置的訂閱（關閉通知）
 */

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sub = body?.subscription
  if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint) {
    return NextResponse.json({ error: '訂閱資料不完整' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, subscription: sub },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('[push/subscribe] upsert error:', error)
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const endpoint = body?.endpoint
  if (!endpoint) return NextResponse.json({ error: '缺少 endpoint' }, { status: 400 })

  const db = createServiceRoleClient()
  await db
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
  return NextResponse.json({ success: true })
}
