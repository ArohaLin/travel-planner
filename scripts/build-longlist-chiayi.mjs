/**
 * 嘉義「漏網之魚」longlist 建置腳本
 *
 * 解析 reports/chiayi-recommendation.md，抓 ▫️ 候選
 * + 從 chiayi-candidates.json 取貝氏前段尚未入選者
 * 查 place_id 後寫入 recommendations（tier='longlist'）
 *
 * 執行：node scripts/build-longlist-chiayi.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
const DB  = process.env.SUPABASE_DB_URL
if (!KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
if (!DB)  throw new Error('SUPABASE_DB_URL not set')

async function findPlace(query) {
  const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(query)}` +
    '&inputtype=textquery' +
    '&fields=place_id,geometry,photos' +
    '&language=zh-TW&region=tw' +
    `&key=${KEY}`
  try {
    const j = await fetch(url).then(r => r.json())
    const c = j.candidates?.[0]
    if (!c) return null
    return {
      placeId:  c.place_id ?? null,
      lat:      c.geometry?.location?.lat ?? null,
      lng:      c.geometry?.location?.lng ?? null,
      photoRef: c.photos?.[0]?.photo_reference ?? null,
    }
  } catch { return null }
}

async function mapPool(items, fn, concurrency = 2) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
      await new Promise(r => setTimeout(r, 650))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// ── 從 candidates JSON 取貝氏前段未入選者（每分類取前 25 筆再扣掉精選）────────
const json = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'reports', 'chiayi-candidates.json'), 'utf8'
))

// 從 MD 報告解析 ▫️ 條目（明確列為 longlist 的）
const REPORT = fs.readFileSync(
  path.join(__dirname, '..', 'reports', 'chiayi-recommendation.md'), 'utf8'
)
const explicit = []
let currentCat = null
for (const line of REPORT.split('\n')) {
  const catM = line.match(/^## (景點|美食|住宿|親子)/)
  if (catM) { currentCat = catM[1]; continue }
  if (!currentCat) continue
  if (!line.startsWith('| ▫️')) continue
  const cols = line.split('|').map(s => s.trim()).filter(Boolean)
  if (cols.length < 2) continue
  const name = cols[1].trim()
  explicit.push({ name, category: currentCat })
}

console.log(`報告中明確 ▫️ 候選：${explicit.length} 筆`)

// 額外從 JSON 候選池撈（景點/美食/住宿/親子 各取前 40 筆，貝氏排序），扣除已知名單
const EXTRA_PER_CAT = 40
const additionalNames = new Set()
for (const [cat, list] of Object.entries(json.byCategory)) {
  list.slice(0, EXTRA_PER_CAT).forEach(p => {
    if (p.rating && p.reviews >= 100) additionalNames.add(p.name)
  })
}

// 所有精選名稱（不重複）
const FEATURED_NAMES = new Set([
  '阿里山國家森林遊樂區','祝山觀日平臺','嘉義梅山太平雲梯','特富野古道',
  '新港奉天宮','優遊吧斯鄒族文化部落','嘉義市立美術館','臺灣花磚博物館',
  '嘉義市立博物館','北門驛','國定古蹟-嘉義舊監獄','奮起湖老街',
  '林聰明沙鍋魚頭','民主火雞肉飯','桃城三禾火雞肉飯','奮起湖大飯店-奮起湖便當創始店',
  '合平鴨肉羹','古早時代-現炒鴨肉羹','打貓冰果室','阿婆炸麻糬',
  '舊時光新鮮事-老屋咖哩專賣','仁芝初豆腐冰店','湯城鵝行-檜意店',
  '福義軒-成功門市','初沐鰻魚專賣社',
  '嘉義兆品酒店','星義文旅Star Yi Wen Lu','耐斯王子大飯店','十方山水 SunSweetHouse',
  '阿里山民宿-山水清暉','朵麗絲森林-包棟團體民宿（瑞里）','山間茶墅民宿',
  'Astrea星晨堡民宿','壹貳貳洋樓','翔鶴居',
  '萌寵村親子樂園','嘉大昆蟲館','咩咩上樹萌寵樂園','林業試驗所嘉義樹木園',
  '築夢森居探索生態農場','欣欣水泥森活園觀光工廠','果然茶香觀光園區',
  '八掌溪親水公園','兒童創意中心','獨角仙休閒農場',
])

// 明確的 ▫️ + 排除精選和重複
const explicitSet = new Set(explicit.map(e => e.name))

// 從 JSON 補額外候選
const extraCandidates = []
for (const [cat, list] of Object.entries(json.byCategory)) {
  for (const p of list.slice(0, EXTRA_PER_CAT)) {
    if (!FEATURED_NAMES.has(p.name) && !explicitSet.has(p.name) &&
        p.bayesian >= 4.35 && p.reviews >= 150 && p.rating >= 4.3) {
      extraCandidates.push({ name: p.name, category: cat,
        ratingSnapshot: p.rating, reviewsSnapshot: p.reviews, credibility: p.bayesian })
    }
  }
}

// 合併：明確 ▫️ + 額外補充（去重）
const seenNames = new Set()
const candidates = []
for (const e of explicit) {
  if (!seenNames.has(e.name) && !FEATURED_NAMES.has(e.name)) {
    // 從 JSON 找評分
    const allJson = Object.values(json.byCategory).flat()
    const found = allJson.find(p => p.name === e.name)
    seenNames.add(e.name)
    candidates.push({
      name: e.name, category: e.category,
      ratingSnapshot: found?.rating ?? null,
      reviewsSnapshot: found?.reviews ?? null,
      credibility: found?.bayesian ?? 4.2,
    })
  }
}
for (const e of extraCandidates) {
  if (!seenNames.has(e.name)) {
    seenNames.add(e.name)
    candidates.push(e)
  }
}

console.log(`longlist 候選總數：${candidates.length} 筆`)
console.log('開始 Places 查詢（並發 2，每筆約 0.65s）…')

const lookups = await mapPool(candidates, async (c, i) => {
  const result = await findPlace(`${c.name} 嘉義`)
  if ((i + 1) % 10 === 0) console.log(`  進度 ${i + 1}/${candidates.length}`)
  return { ...c, ...(result ?? {}) }
})

const db = new Client({ connectionString: DB })
await db.connect()

const { rows: existing } = await db.query(
  `SELECT google_place_id FROM recommendations WHERE region = '嘉義'`
)
const existingIds = new Set(existing.map(r => r.google_place_id))
console.log(`DB 現有嘉義記錄：${existingIds.size} 筆`)

let inserted = 0
const skipped = []

for (const item of lookups) {
  if (!item.placeId) { skipped.push({ name: item.name, reason: '查無 place_id' }); continue }
  if (existingIds.has(item.placeId)) { skipped.push({ name: item.name, reason: '已存在' }); continue }

  await db.query(
    `INSERT INTO recommendations
       (region, category, name, google_place_id, lat, lng,
        editorial_reason, tags, source_badges, credibility,
        rating_snapshot, reviews_snapshot, photo_ref,
        status, tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published','longlist')
     ON CONFLICT (region, google_place_id) DO NOTHING`,
    [
      '嘉義', item.category, item.name, item.placeId,
      item.lat, item.lng,
      '', [], [], item.credibility ?? 4.2,
      item.ratingSnapshot, item.reviewsSnapshot, item.photoRef,
    ]
  )
  existingIds.add(item.placeId)
  inserted++
}

await db.end()

console.log(`\n✅ 完成！插入 ${inserted} 筆 longlist`)
if (skipped.length > 0) {
  console.log(`⚠️  跳過 ${skipped.length} 筆：`)
  skipped.forEach(s => console.log(`   - ${s.name}（${s.reason}）`))
}
