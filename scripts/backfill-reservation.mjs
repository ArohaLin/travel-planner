/**
 * 回填 reservationStatus：現有行程裡 bookingRequired=true 或文字註明「需預訂/預約/訂位」的活動 → 'needed'。
 * 其餘維持未設（=無需預訂）。執行：node scripts/backfill-reservation.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const NEED_RE = /需.{0,3}(預訂|預約|訂位|預定)|事先.{0,3}(預訂|預約|訂位)|必.{0,2}(預訂|預約|訂位)|建議.{0,3}(預訂|預約|訂位)|提前.{0,3}(預訂|預約|訂位)/
const textOf = (a) => [a.title, a.highlight, a.notes, a.intro, a.tips, a.description, a.recommendation, a.transport].filter(Boolean).join(' ')

const { data, error } = await db.from('itineraries').select('id,title,data')
if (error) { console.error('讀取失敗', error.message); process.exit(1) }

let totalItin = 0, totalSet = 0
for (const it of data) {
  const d = it.data
  if (!d?.days) continue
  let changed = 0
  for (const day of d.days) {
    for (const a of (day.activities || [])) {
      if (a.type === 'transport') continue              // 交通不需預約狀態
      if (a.reservationStatus) continue                 // 已設過就不動
      const need = a.bookingRequired === true || NEED_RE.test(textOf(a))
      if (need) { a.reservationStatus = 'needed'; changed++ }
    }
  }
  if (changed) {
    const { error: e2 } = await db.from('itineraries').update({ data: d }).eq('id', it.id)
    console.log(e2 ? `❌ ${it.title} ${e2.message}` : `✓ ${it.title}：${changed} 個活動設為「需要預訂」`)
    if (!e2) { totalItin++; totalSet += changed }
  } else {
    console.log(`・ ${it.title}：無需回填`)
  }
}
console.log(`\n完成：${totalItin} 份行程、共 ${totalSet} 個活動設為「需要預訂」`)
