// 驗證住宿時間軸修正：鏡像 DayView 的 accTimelineTime 邏輯，印 old→new（唯讀）
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { estimateLeg } from '../lib/maps/estimateLeg'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const toMin = (t?: string) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m }
const fromMin = (m: number) => { const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}` }

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL })
await client.connect()
const { rows } = await client.query("SELECT data FROM itineraries WHERE id = '15251c86-e7b7-4b2e-a065-eeb8e11638a0'")
await client.end()
const itin = rows[0].data

let allAfterLast = true
for (const d of itin.days) {
  const acts = d.activities ?? []
  const last = acts[acts.length - 1]
  const acc = d.accommodation
  if (!acc) { console.log(`D${d.dayIndex + 1}: 無住宿`); continue }
  const legByTo = new Map((d.travelLegs ?? []).map((l: any) => [l.toId, l]))
  const accLeg: any = legByTo.get('accommodation')
  const accEst = estimateLeg(last?.location, acc.location)
  const endMin = toMin(last?.endTime ?? last?.startTime)
  const legMin = accLeg ? Math.round(accLeg.seconds / 60) : (accEst?.min ?? 0)
  const checkInMin = toMin(acc.checkInTime)
  const newTime = endMin == null ? acc.checkInTime : fromMin(checkInMin != null ? Math.max(endMin + legMin, checkInMin) : endMin + legMin)
  const lastT = last ? (last.endTime || last.startTime) : '—'
  const okOrder = endMin == null || toMin(newTime)! >= endMin
  if (!okOrder) allAfterLast = false
  console.log(`D${d.dayIndex + 1}: 最後活動 ${lastT}｜舊顯示 ${acc.checkInTime}  →  新顯示 ${newTime}  (車程${legMin}分) ${okOrder ? '✓不早於最後活動' : '✗仍倒退'}`)
}
console.log(`\n${allAfterLast ? '✅ 全部新時間都 ≥ 當天最後活動（不再倒退）' : '❌ 仍有倒退'}`)
