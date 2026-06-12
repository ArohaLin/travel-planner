import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'
import { runAfterResponse } from '@/lib/push/waitUntil'

/**
 * 臨時自測端點：驗證 waitUntil 能否在「HTTP 回應結束/連線中斷後」仍完成背景工作
 * （= 修好「滑掉 App 後通知漏發」的核心機制）。token 保護，測完即移除。
 *
 * 呼叫端可在收到回應後立刻中斷連線（模擬強制關閉 App）；若數秒後 push_log 仍出現
 * 'selftest-waituntil' 一列，代表 waitUntil 在斷線後照常把背景工作跑完。
 * 帶 ?push=1 則同時實際發一則推播給最近訂閱的使用者（可在手機端確認）。
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!process.env.SELFTEST_TOKEN || token !== process.env.SELFTEST_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const doPush = req.nextUrl.searchParams.get('push') === '1'
  const db = createServiceRoleClient()

  // 取最近一筆訂閱的 user_id（測試對象）
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('user_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const userId = sub?.user_id ?? null

  // 回應「立刻」返回，背景工作排進 waitUntil：延遲 4 秒後才寫 push_log（並可選擇實發推播）
  runAfterResponse(
    (async () => {
      await new Promise((r) => setTimeout(r, 4000))
      await db.from('push_log').insert({
        user_id: userId,
        context: 'selftest-waituntil',
        status_code: 999,
        detail: 'ran after response settled',
      })
      if (doPush && userId) {
        await sendPushToUser(userId, {
          title: '🔔 斷線後自測通知',
          body: '若你在斷線後仍收到這則，代表強制關閉情境也修好了',
          url: '/dashboard',
        })
      }
    })(),
  )

  return NextResponse.json({ scheduled: true, userId: userId ? userId.slice(0, 8) : null, doPush })
}
