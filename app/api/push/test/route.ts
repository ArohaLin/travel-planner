import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * 推播診斷端點：登入後在 PWA 開啟 /api/push/test，會嘗試發一則測試推播，
 * 並回傳每一步的結果（環境變數是否齊全、訂閱數、Apple 回應碼），用來定位
 * 「AI 完成卻沒收到通知」的卡點。錯誤不吞，全部回報。
 */
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, step: 'auth', error: '未登入' }, { status: 401 })

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  const envOk = !!(pub && priv && subject)

  const result: Record<string, unknown> = {
    ok: false,
    userId: user.id,
    env: {
      hasPublicKey: !!pub,
      hasPrivateKey: !!priv,
      hasSubject: !!subject,
      publicKeyPrefix: pub ? pub.slice(0, 8) : null,
    },
  }
  if (!envOk) {
    result.step = 'env'
    result.error = 'VAPID 環境變數不齊全（伺服器端缺 key）'
    return NextResponse.json(result, { status: 500 })
  }

  webpush.setVapidDetails(subject!, pub!, priv!)
  const db = createServiceRoleClient()
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', user.id)

  if (error) {
    result.step = 'query'
    result.error = error.message
    return NextResponse.json(result, { status: 500 })
  }
  result.subscriptionCount = subs?.length ?? 0
  if (!subs || subs.length === 0) {
    result.step = 'no-subscription'
    result.error = '此帳號在此裝置沒有推播訂閱（請先在 AI 視窗點 🔔 開啟通知）'
    return NextResponse.json(result, { status: 200 })
  }

  const sends = []
  for (const row of subs) {
    try {
      const res = await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify({ title: '🔔 診斷推播', body: '若看到這則，伺服器發送鏈路正常', url: '/dashboard' }),
      )
      sends.push({ id: row.id.slice(0, 8), statusCode: res.statusCode })
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string }
      sends.push({ id: row.id.slice(0, 8), statusCode: err.statusCode ?? null, error: String(err.body ?? err.message).slice(0, 200) })
    }
  }
  result.ok = sends.some((s) => s.statusCode === 201)
  result.sends = sends
  return NextResponse.json(result, { status: 200 })
}
