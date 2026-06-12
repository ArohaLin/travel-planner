// 診斷：找出行程卡「該顯示距離卻沒顯示」的原因
// 用法：node scripts/diag-legs.mjs            → 列出所有 6 天以上的行程供挑選
//      node scripts/diag-legs.mjs <itinId>    → 詳細分析該行程第 3/4/6 天
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// 讀 .env.local
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const hasCoords = (loc) => !!loc && (loc.lat !== 0 || loc.lng !== 0)

const target = process.argv[2]

const { data: rows, error } = await db.from('itineraries').select('id, title, data')
if (error) { console.error(error); process.exit(1) }

if (!target) {
  console.log('=== 行程清單（天數 >= 6）===')
  for (const r of rows) {
    const days = r.data?.days?.length ?? 0
    if (days >= 6) console.log(`${r.id}  天數=${days}  ${r.title}`)
  }
  console.log('\n指定 id 再跑一次以詳細分析：node scripts/diag-legs.mjs <id>')
  process.exit(0)
}

const row = rows.find((r) => r.id === target)
if (!row) { console.error('找不到該行程'); process.exit(1) }
const days = row.data.days

console.log(`行程：${row.title}\n`)

for (const di of [2, 3, 5]) { // 第 3/4/6 天（0-based）
  const day = days.find((d) => d.dayIndex === di)
  if (!day) { console.log(`第 ${di + 1} 天：不存在\n`); continue }
  console.log(`========== 第 ${di + 1} 天 (dayIndex=${di}) ==========`)
  console.log(`travelLegs: ${day.travelLegs ? day.travelLegs.length + ' 段' : '無'}` +
    `　travelSig: ${day.travelSig ? '有' : '無'}　routePolyline: ${day.routePolyline ? '有' : '無'}`)
  const legByTo = new Map((day.travelLegs ?? []).map((l) => [l.toId, l]))

  const acts = day.activities
  acts.forEach((a, idx) => {
    const prev = idx > 0 ? acts[idx - 1] : undefined
    const leg = legByTo.get(a.id)
    let verdict
    if (a.type === 'transport') verdict = '不顯示：本身是交通卡'
    else if (idx === 0) verdict = '不顯示：第一站（出發地→此站不放卡片）'
    else if (prev && prev.type === 'transport') verdict = '不顯示：前一張是交通卡（避免重複）'
    else if (!leg) verdict = '★不顯示：查無路段（此景點可能無座標，未納入路線）'
    else if (leg.meters < 50) verdict = `不顯示：距離過近(${leg.meters}m)`
    else verdict = `顯示：${(leg.meters / 1000).toFixed(1)}km`
    console.log(
      `  [${idx}] ${a.type.padEnd(11)} coords=${hasCoords(a.location) ? 'Y' : 'N'}  leg=${leg ? 'Y' : '-'}  ${verdict}  | ${a.title}`,
    )
  })
  // 住宿
  if (day.accommodation) {
    const last = acts[acts.length - 1]
    const leg = legByTo.get('accommodation')
    let verdict
    if (!last || last.type === 'transport') verdict = '不顯示：最後一張是交通卡或無活動'
    else if (!leg) verdict = '★不顯示：查無住宿路段'
    else if (leg.meters < 50) verdict = `不顯示：距離過近(${leg.meters}m)`
    else verdict = `顯示：${(leg.meters / 1000).toFixed(1)}km`
    console.log(`  [宿] accommodation  coords=${hasCoords(day.accommodation.location) ? 'Y' : 'N'}  leg=${leg ? 'Y' : '-'}  ${verdict}  | ${day.accommodation.name}`)
  }
  console.log()
}
