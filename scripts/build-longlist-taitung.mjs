/**
 * 台東「漏網之魚」longlist 建置腳本
 *
 * 1. 解析 reports/taitung-recommendation.md，抓出所有 ▫️ 候選（名額不足者）
 * 2. 每筆用 Google Places findplacefromtext 查 place_id / 座標 / photoRef
 * 3. 寫入 recommendations（tier='longlist'）
 *    - 已在 featured（place_id 相同）的跳過
 *    - 查無結果者記錄到 skipped
 *
 * 執行方式：
 *   node scripts/build-longlist-taitung.mjs
 *
 * 需要 .env.local 的 NEXT_PUBLIC_GOOGLE_MAPS_KEY 與 SUPABASE_DB_URL
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// ── 載入 .env.local ────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
const DB_URL   = process.env.SUPABASE_DB_URL
if (!MAPS_KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
if (!DB_URL)   throw new Error('SUPABASE_DB_URL not set')

// ── 解析報告 ───────────────────────────────────────────────────────────────
const REPORT = fs.readFileSync(
  path.join(__dirname, '..', 'reports', 'taitung-recommendation.md'), 'utf8'
)

// 找出目前所在分類（### 景點 / 美食 / 住宿 / 親子）
const CATEGORY_MAP = { '景點': '景點', '美食': '美食', '住宿': '住宿', '親子': '親子' }
const candidates = []
let currentCategory = null

for (const line of REPORT.split('\n')) {
  // 偵測分類標題
  const catMatch = line.match(/^###\s+(景點|美食|住宿|親子)/)
  if (catMatch) { currentCategory = catMatch[1]; continue }

  if (!currentCategory) continue

  // 只收 ▫️ 開頭的列（名額不足）
  if (!line.startsWith('| ▫️') && !line.includes('▫️ 貝氏') && !line.includes('▫️ 品質尚可')) continue

  // 表格列：| 名稱 | 評分(評論) | 貝氏 | 結果與原因 |
  const cols = line.split('|').map(s => s.trim()).filter(Boolean)
  if (cols.length < 3) continue

  const name = cols[0]
  const ratingStr = cols[1]  // e.g. "4.5★(1850)"
  const credStr   = cols[2]  // e.g. "4.482"

  const ratingM = ratingStr.match(/([\d.]+)★\((\d+)\)/)
  const rating   = ratingM ? parseFloat(ratingM[1]) : null
  const reviews  = ratingM ? parseInt(ratingM[2])   : null
  const cred     = credStr ? parseFloat(credStr) : 0

  candidates.push({
    category: currentCategory,
    name: name.replace(/^\*+|\*+$/g, '').trim(), // 去掉 **bold**
    ratingSnapshot: rating,
    reviewsSnapshot: reviews,
    credibility: cred,
  })
}

console.log(`解析到 ▫️ 候選：${candidates.length} 筆`)

// ── Places findplacefromtext ───────────────────────────────────────────────
async function findPlace(query) {
  const url =
    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(query)}` +
    '&inputtype=textquery' +
    '&fields=place_id,geometry,photos' +
    '&language=zh-TW&region=tw' +
    `&key=${MAPS_KEY}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const c = json.candidates?.[0]
    if (!c) return null
    return {
      placeId:  c.place_id ?? null,
      lat:      c.geometry?.location?.lat ?? null,
      lng:      c.geometry?.location?.lng ?? null,
      photoRef: c.photos?.[0]?.photo_reference ?? null,
    }
  } catch {
    return null
  }
}

// 並發 2，遵守 1 QPS 上限
async function mapPool(items, fn, concurrency = 2) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
      // 每次查詢後等 600ms，確保 < 2 QPS
      await new Promise(r => setTimeout(r, 600))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// ── 查詢所有候選 ────────────────────────────────────────────────────────────
console.log('開始 Places 查詢（並發 2，每筆約 0.6s）…')
const lookups = await mapPool(candidates, async (c, i) => {
  const query = `${c.name} 台東`
  const result = await findPlace(query)
  if ((i + 1) % 10 === 0) console.log(`  查詢進度 ${i + 1}/${candidates.length}`)
  return { ...c, ...result }
})

// ── 連接 DB，過濾已存在的 place_id ──────────────────────────────────────────
const db = new Client({ connectionString: DB_URL })
await db.connect()

// 取得所有已存在的 place_id（featured + longlist）
const { rows: existing } = await db.query(
  `SELECT google_place_id FROM recommendations WHERE region = '台東'`
)
const existingIds = new Set(existing.map(r => r.google_place_id))
console.log(`DB 現有 台東 記錄：${existingIds.size} 筆`)

// ── 寫入 ────────────────────────────────────────────────────────────────────
const skipped = []
let inserted = 0

for (const item of lookups) {
  if (!item.placeId) {
    skipped.push({ name: item.name, reason: '查無 place_id' })
    continue
  }
  if (existingIds.has(item.placeId)) {
    skipped.push({ name: item.name, reason: '已在 featured 或 longlist' })
    continue
  }

  await db.query(
    `INSERT INTO recommendations
       (region, category, name, google_place_id, lat, lng,
        editorial_reason, tags, source_badges, credibility,
        rating_snapshot, reviews_snapshot, photo_ref,
        status, tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published','longlist')
     ON CONFLICT (region, google_place_id) DO NOTHING`,
    [
      '台東',
      item.category,
      item.name,
      item.placeId,
      item.lat,
      item.lng,
      '',               // editorial_reason 留空（未策展）
      '{}',             // tags
      '{}',             // source_badges
      item.credibility,
      item.ratingSnapshot,
      item.reviewsSnapshot,
      item.photoRef,
    ]
  )
  existingIds.add(item.placeId)
  inserted++
}

await db.end()

// ── 結果報告 ─────────────────────────────────────────────────────────────────
console.log(`\n✅ 完成！插入 ${inserted} 筆 longlist`)
if (skipped.length) {
  console.log(`\n⚠️  跳過 ${skipped.length} 筆：`)
  for (const s of skipped) console.log(`   - ${s.name}（${s.reason}）`)
}
