import { readFileSync } from 'node:fs'
import pg from 'pg'
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL })
await client.connect()
const { rows } = await client.query("SELECT data FROM itineraries WHERE id = '31adac01-f3e2-40f7-9992-75fb9314487b'")
let itin = rows[0].data

// 掃所有天，找座標 = (24.8046, 120.9718) 的可疑活動
console.log('=== 掃描所有天的可疑座標 (24.8046, 120.9718) ===')
for (const day of itin.days) {
  for (const a of day.activities) {
    const loc = a.location
    if (loc && Math.abs(loc.lat - 24.8046) < 0.001 && Math.abs(loc.lng - 120.9718) < 0.001) {
      console.log(`Day${day.dayIndex} ${a.id} "${a.title}" type=${a.type} loc=${JSON.stringify(loc)}`)
    }
  }
}

// 清除 Day2 D2HSR001 的 location
const day2 = itin.days.find((d: any) => d.dayIndex === 2)
let fixed = 0
day2.activities = day2.activities.map((a: any) => {
  if (a.id === 'D2HSR001') {
    console.log('\n清除 D2HSR001 location:', JSON.stringify(a.location))
    fixed++
    return { ...a, location: undefined }
  }
  return a
})
console.log(`清除 Day2 travelSig: ${day2.travelSig?.substring(0, 50)}`)
delete day2.travelSig
delete day2.travelLegs
delete day2.routePolyline

await client.query(
  "UPDATE itineraries SET data = $1 WHERE id = '31adac01-f3e2-40f7-9992-75fb9314487b'",
  [itin]
)
await client.end()
console.log(`\n完成！清除 ${fixed} 個錯誤座標 + Day2 路線快取`)
