import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Web Push 發送（AI 完成通知）。
 * 失效的訂閱（410/404，例如使用者移除 PWA 或撤銷權限）會自動清除。
 * 任何錯誤都不拋出——推播失敗不能影響主流程（AI 結果已存 DB）。
 */

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return false
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  /** 點通知後開啟的路徑，例如 /itinerary/xxx */
  url: string
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return
    const db = createServiceRoleClient()
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId)
    if (!subs || subs.length === 0) return

    const body = JSON.stringify(payload)
    await Promise.all(
      subs.map(async (row: { id: string; subscription: webpush.PushSubscription }) => {
        try {
          await webpush.sendNotification(row.subscription, body)
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 410 || status === 404) {
            // 訂閱已失效 → 清除
            await db.from('push_subscriptions').delete().eq('id', row.id)
          } else {
            console.warn('[push] send failed:', status, String(e).slice(0, 120))
          }
        }
      }),
    )
  } catch (e) {
    console.warn('[push] sendPushToUser error:', String(e).slice(0, 160))
  }
}
