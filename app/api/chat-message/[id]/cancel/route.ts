import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * POST /api/chat-message/[id]/cancel
 * Marks a pending plan message as cancelled.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()

  // Fetch the message to verify it belongs to a thread the user can access
  const { data: msg } = await db
    .from('chat_messages')
    .select('id, thread_id, patch_status')
    .eq('id', params.id)
    .single()

  if (!msg) return NextResponse.json({ error: '訊息不存在' }, { status: 404 })
  if (msg.patch_status !== 'pending_selection') {
    return NextResponse.json({ error: '狀態已變更，無法取消' }, { status: 409 })
  }

  await db
    .from('chat_messages')
    .update({ patch_status: 'cancelled' })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
