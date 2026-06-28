// 一次性：同一 id 跨多天的住宿，取「最完整版」套用到該 id 的所有天（寫 DB）
// 跑法：npx tsx scripts/_sync-acc-byid.mts
import { readFileSync } from 'node:fs'
import pg from 'pg'
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const ID = '15251c86-e7b7-4b2e-a065-eeb8e11638a0'
const richness = (a: any) => Object.values(a ?? {}).filter((v) => v != null && v !== '').length

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL })
await client.connect()
const { rows } = await client.query('SELECT data FROM itineraries WHERE id = $1', [ID])
const itin = rows[0].data

// 依 accommodation.id 分組
const groups = new Map<string, any[]>()
for (const d of itin.days) {
  const acc = d.accommodation
  if (acc?.id) { if (!groups.has(acc.id)) groups.set(acc.id, []); groups.get(acc.id)!.push(d) }
}

let changed = 0
for (const [accId, daysArr] of groups) {
  if (daysArr.length < 2) continue
  // 取最完整的當基準
  const canonical = daysArr.map((d) => d.accommodation).sort((a, b) => richness(b) - richness(a))[0]
  console.log(`住宿 id ${accId}「${canonical.name}」跨 ${daysArr.length} 天 → 以最完整版同步`)
  for (const d of daysArr) {
    const before = JSON.stringify(d.accommodation)
    d.accommodation = JSON.parse(JSON.stringify(canonical))
    if (JSON.stringify(d.accommodation) !== before) { console.log(`  D${d.dayIndex + 1} 已更新`); changed++ }
  }
}

if (changed === 0) { console.log('無需同步'); await client.end() }
else {
  await client.query('UPDATE itineraries SET data = $1 WHERE id = $2', [itin, ID])
  await client.end()
  console.log(`\n✅ 已同步 ${changed} 天`)
}
