import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('itinerary_members')
    .select(`
      role,
      itineraries (
        id, title, destination, start_date, end_date,
        currency, status, created_at, updated_at,
        owner_id
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '載入行程失敗' }, { status: 500 })
  }

  const itineraries = (data ?? []).map((item) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(item.itineraries as any),
    role: item.role,
  }))

  return NextResponse.json(itineraries)
}
