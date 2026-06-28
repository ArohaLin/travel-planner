import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// /share + /api/share：對外宣傳冊公開頁與其圖片 proxy（免登入）
// /api/photo：卡片與宣傳冊共用的景點照片 proxy（公開、以 photoRef 為鍵共用快取）
// /api/weather：每日天氣（公開、非敏感，只吃座標＋日期；可 CDN 快取）
// /api/health：keep-warm ping 用（無 auth/DB），須放行才能打到 function 本體而非被導去登入
const PUBLIC_ROUTES = ['/login', '/register', '/itinerary', '/share', '/api/share', '/api/photo', '/api/weather', '/api/health']

// 「公開且可被 CDN 共用快取」的資產／公開資料路由：完全不碰登入驗證。
// 為何：這些回應帶 `public`/`immutable` 快取（跨使用者共用快取鍵），若 middleware 在此
// 跑 auth 並在 token 刷新時附上 Set-Cookie，理論上可能被 CDN 連同 cookie 一起快取後派給別人
// （帳號錯置風險）。這些路由本就不需要使用者身分（用 token＋service role 或純座標），
// 故直接跳過 auth：杜絕該破口，並省去每張圖／每次天氣請求的驗證開銷。
const CACHEABLE_PUBLIC_ROUTES = ['/api/photo', '/api/weather', '/api/health', '/api/share', '/share']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (CACHEABLE_PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next({ request })
  }

  // /dev/* 僅限本機開發（NODE_ENV=development）；production 完全不通
  if (pathname.startsWith('/dev')) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.next({ request })
  }

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
