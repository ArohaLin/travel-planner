import { NextResponse } from 'next/server'

// 輕量健康檢查：無 auth、無 DB，純粹給 keep-warm ping 用，讓 serverless function 保持熱。
// force-dynamic 確保每次真的執行到 function（不被靜態化／快取掉），才能達到保溫效果。
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
