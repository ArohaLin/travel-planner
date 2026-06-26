import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// /share + /api/share：對外宣傳冊公開頁與其圖片 proxy（免登入）
// /api/photo：卡片與宣傳冊共用的景點照片 proxy（公開、以 photoRef 為鍵共用快取）
// /api/weather：每日天氣（公開、非敏感，只吃座標＋日期；可 CDN 快取）
// /api/health：keep-warm ping 用（無 auth/DB），須放行才能打到 function 本體而非被導去登入
const PUBLIC_ROUTES = ['/login', '/register', '/itinerary', '/share', '/api/share', '/api/photo', '/api/weather', '/api/health']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: object }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // 用 getClaims 本地驗章（非對稱 JWT），取代每請求一次 getUser 網路往返。
  // getClaims 內部會在 token 過期時用 refresh token 自動刷新並寫回 cookie，故維持登入不中斷。
  // middleware 只需判斷「是否已登入」，故只看 claims 是否存在。
  let user: { id: string } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimsData } = await (supabase.auth as any).getClaims()
    if (claimsData?.claims?.sub) user = { id: claimsData.claims.sub as string }
  } catch {
    // 壞 token → 當未登入處理（下方非公開頁會導去 login）
  }

  const pathname = request.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

  if (!user && !isPublic && pathname !== '/') {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|apple-touch-icon.png|icon-192.png|icon-512.png|summary-illust.png|splash|sw.js).*)'],
}
