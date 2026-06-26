/**
 * 效能體檢：量測各 API route 實際跑的 Supabase 查詢延遲。
 * 用 .env.local 的 service role 直連，複製各 route 的真實查詢。
 * ⚠️ 從本機量到的延遲含「我的網路→Supabase」往返，Vercel（與 DB 較近）通常更低；
 *    但相對成本與「哪支查詢慢」的結論成立。
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// 讀 .env.local
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function time(label, fn, runs = 4) {
  const ms = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    await fn()
    ms.push(Math.round(performance.now() - t))
  }
  console.log(`${label.padEnd(42)} 各次: ${ms.map((m) => `${m}ms`).join('  ')}   (熱:${ms.slice(1).reduce((a, b) => a + b, 0) / (runs - 1)}ms)`)
  return ms
}

// 找一個真實行程 id 與一個 user id 來複製查詢
const { data: anyItin } = await db.from('itineraries').select('id').limit(1).single()
const { data: anyUser } = await db.from('profiles').select('id').limit(1).single()
const itinId = anyItin?.id
const userId = anyUser?.id
console.log(`測試用 itineraryId=${itinId}  userId=${userId}\n`)

console.log('───── (2) Dashboard 我的行程列表 ─────')
await time('itinerary_members JOIN itineraries', () =>
  db.from('itinerary_members').select(`role, itineraries ( id, title, destination, start_date, end_date, status, updated_at )`).eq('user_id', userId).order('joined_at', { ascending: false }),
)
await time('profiles 單筆（global_role）', () =>
  db.from('profiles').select('display_name, global_role').eq('id', userId).single(),
)

console.log('\n───── (2) 進入行程頁 getItineraryAccess ─────')
await time('access: profiles + members（並行2查）', () =>
  Promise.all([
    db.from('profiles').select('global_role').eq('id', userId).single(),
    db.from('itinerary_members').select('role').eq('itinerary_id', itinId).eq('user_id', userId).maybeSingle(),
  ]),
)

console.log('\n───── (3) 探索·精選推薦 ─────')
await time('recommendations + lodging_research（並行2查）', () =>
  Promise.all([
    db.from('recommendations').select('*').eq('status', 'published').order('credibility', { ascending: false }),
    db.from('lodging_research').select('id, google_place_id, name, category, city, district, address, rating, total_reviews, photo_ref, verdict, suitable_for, researched_at, features').gte('rating', 4.0),
  ]),
)

console.log('\n───── (3) 探索·住宿評價 / 店家評價 ─────')
await time('lodging_research 全欄（住宿分頁）', () =>
  db.from('lodging_research').select('*').order('researched_at', { ascending: false }),
)

console.log('\n───── (4) 願望清單 ─────')
await time('wishlist_items + access（3查）', () =>
  Promise.all([
    db.from('profiles').select('global_role').eq('id', userId).single(),
    db.from('itinerary_members').select('role').eq('itinerary_id', itinId).eq('user_id', userId).maybeSingle(),
    db.from('wishlist_items').select('*').eq('itinerary_id', itinId).order('created_at', { ascending: false }),
  ]),
)

console.log('\n完成。')
process.exit(0)
