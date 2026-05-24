import { NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/itinerary/[id]/thread?mode=adjust|consult
 * Returns the threadId for this itinerary+mode combo.
 * Creates a new thread if one doesn't exist yet.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const db = createServiceRoleClient()

  // Check that user has at least some access to this itinerary
  const { data: member } = await db
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: '無存取權限' }, { status: 403 })

  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') === 'consult' ? 'consult' : 'adjust'

  // Try to find an existing thread for this itinerary+mode
  const { data: thread } = await db
    .from('chat_threads')
    .select('id')
    .eq('itinerary_id', params.id)
    .eq('mode', mode)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (thread) {
    return NextResponse.json({ threadId: thread.id })
  }

  // Create a new thread for this mode
  const { data: newThread, error } = await db
    .from('chat_threads')
    .insert({ itinerary_id: params.id, mode })
    .select('id')
    .single()

  if (error || !newThread) {
    console.error('[thread] Create error:', error)
    return NextResponse.json({ error: '建立對話串失敗' }, { status: 500 })
  }

  return NextResponse.json({ threadId: newThread.id })
}
