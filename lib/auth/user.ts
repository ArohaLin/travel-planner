import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 用 `getClaims()` 本地驗章取得使用者身分（非對稱 ES256 JWT → crypto.subtle 驗簽，零網路往返；
 * JWKS 公鑰只在每個 warm 實例第一次抓一次、之後快取）。
 *
 * 取代熱讀路徑的 `auth.getUser()`（每次都向 Supabase Auth 伺服器發網路驗證）。
 * 回傳與 getUser 常用欄位相容的最小物件（id / email），無有效 token 回 null。
 *
 * ⚠️ 取捨：getClaims 只驗「簽章有效 + 未過期」，不會即時反映帳號被停用（最長一個 token
 * 效期的空窗，通常 1 小時）。故**敏感／管理／寫入**路由仍用 `getUser()` 即時向伺服器確認；
 * 此 helper 只用於高頻的「讀取」路徑（dashboard、探索、行程瀏覽…）以省下每請求一次往返。
 */
export async function getAuthUser(
  supabase: SupabaseClient,
): Promise<{ id: string; email?: string } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.auth as any).getClaims()
    const claims = data?.claims as { sub?: string; email?: string } | undefined
    if (!claims?.sub) return null
    return { id: claims.sub, email: claims.email }
  } catch {
    // 壞掉/無法解析的 token → 當作未登入（讓上層導去登入），不讓頁面 500
    return null
  }
}
