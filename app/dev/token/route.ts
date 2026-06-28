import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 本機開發專用：生成 magic link hashed_token（由 /dev/login 前端 verifyOtp 使用）
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const email = request.nextUrl.searchParams.get('email') ?? 'aroha0530@hotmail.com'
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${request.nextUrl.origin}/dashboard` },
  })

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? 'generateLink failed' }, { status: 500 })
  }

  return NextResponse.json({ token: data.properties.hashed_token, email })
}
