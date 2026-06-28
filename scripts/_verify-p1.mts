// P1 切片2 驗證：用真實 Google Places API 驗 place_id 解析座標正確
// 跑法：npx tsx scripts/_verify-p1.mts
import { readFileSync } from 'node:fs'
import { findPlace, placeDetailsById, getServerMapsKey } from '../lib/maps/places'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const key = getServerMapsKey()
if (!key) { console.error('無 Google 金鑰'); process.exit(1) }

let pass = 0
let fail = 0
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log('✓', n) } else { fail++; console.error('✗ FAIL:', n) } }

const byName = await findPlace('台東 都歷沙灘', key)
console.log('findPlace(台東 都歷沙灘):', JSON.stringify(byName))
ok('findPlace 回 place_id ＋座標', !!byName.placeId && byName.lat != null && byName.lng != null)

if (byName.placeId) {
  const byId = await placeDetailsById(byName.placeId, key)
  console.log('placeDetailsById(同 place_id):', JSON.stringify(byId))
  ok('placeDetailsById 回座標', byId.lat != null && byId.lng != null)
  ok('place_id 解析座標 ≈ findPlace（<~0.5km）',
    byId.lat != null && Math.abs(byId.lat - (byName.lat ?? 0)) < 0.005 && Math.abs((byId.lng ?? 0) - (byName.lng ?? 0)) < 0.005)
  ok('都歷沙灘座標落在台東（22.8~23.3 / 121.0~121.6）',
    (byId.lat ?? 0) > 22.8 && (byId.lat ?? 0) < 23.3 && (byId.lng ?? 0) > 121.0 && (byId.lng ?? 0) < 121.6)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
