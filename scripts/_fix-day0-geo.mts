// 清除花蓮行程 Day0 候車卡的錯誤座標 + travelSig/travelLegs，讓 RoutePrefetcher 重新 geocode
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

// 清除 Day 0 候車卡 D0Wait00 的 location
const day0 = itin.days.find((d: any) => d.dayIndex === 0)
let fixedCount = 0
day0.activities = day0.activities.map((a: any) => {
  if (a.id === 'D0Wait00') {
    console.log('清除 D0Wait00 location:', JSON.stringify(a.location))
    fixedCount++
    return { ...a, location: undefined }
  }
  return a
})

// 清除 Day 0 的 travelSig 和 travelLegs
console.log('清除 Day0 travelSig:', day0.travelSig?.substring(0, 50))
console.log('清除 Day0 travelLegs count:', day0.travelLegs?.length)
delete day0.travelSig
delete day0.travelLegs
delete day0.routePolyline

// 寫回
await client.query(
  "UPDATE itineraries SET data = $1 WHERE id = '31adac01-f3e2-40f7-9992-75fb9314487b'",
  [itin]
)
await client.end()
console.log(`\n完成！修正 ${fixedCount} 個候車卡座標，清除 Day0 路線快取`)
