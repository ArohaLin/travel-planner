/**
 * 嘉義精選推薦・Phase A 候選蒐集腳本
 *
 * 1. 多組關鍵字向 Google Places Text Search 查嘉義真實地點
 * 2. 去重（place_id 為鍵）、記 hits 計數
 * 3. 對「有名但沒搜到」的點定向補查
 * 4. 算貝氏校正分（C=4.2, M=120）
 * 5. 輸出 JSON 供人工策展
 *
 * 執行：node scripts/collect-chiayi.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
if (!KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')

// 並發 2，每筆 600ms
async function mapPool(items, fn, concurrency = 2) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
      await new Promise(r => setTimeout(r, 600))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

// Text Search（回前 20 筆）
async function textSearch(query, category) {
  const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(query)}&language=zh-TW&region=tw&key=${KEY}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const j = await res.json()
    return (j.results ?? []).map(p => ({
      placeId: p.place_id,
      name: p.name,
      address: p.formatted_address ?? '',
      rating: p.rating ?? null,
      reviews: p.user_ratings_total ?? null,
      photoRef: p.photos?.[0]?.photo_reference ?? null,
      lat: p.geometry?.location?.lat ?? null,
      lng: p.geometry?.location?.lng ?? null,
      category,
    }))
  } catch (e) {
    console.error('textSearch error', query, e.message)
    return []
  }
}

// Find Place（定向補查）
async function findPlace(name, category) {
  const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(name + ' 嘉義')}` +
    '&inputtype=textquery' +
    '&fields=place_id,name,rating,user_ratings_total,geometry,photos,formatted_address' +
    '&language=zh-TW&region=tw' +
    `&key=${KEY}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const j = await res.json()
    const c = j.candidates?.[0]
    if (!c) return null
    return {
      placeId: c.place_id,
      name: c.name ?? name,
      address: c.formatted_address ?? '',
      rating: c.rating ?? null,
      reviews: c.user_ratings_total ?? null,
      photoRef: c.photos?.[0]?.photo_reference ?? null,
      lat: c.geometry?.location?.lat ?? null,
      lng: c.geometry?.location?.lng ?? null,
      category,
    }
  } catch {
    return null
  }
}

// 貝氏校正
function bayesian(r, v, C = 4.2, M = 120) {
  if (!r || !v) return C
  return (v / (v + M)) * r + (M / (v + M)) * C
}

// 嘉義範圍判斷（lat 23.0–23.7, lng 120.2–120.8）
function isChiayi(lat, lng, address) {
  if (address && (address.includes('嘉義市') || address.includes('嘉義縣'))) return true
  if (!lat || !lng) return false
  return lat >= 22.8 && lat <= 23.8 && lng >= 120.1 && lng <= 120.9
}

// ────────────────────────────────────────────────────────────────────────────
// 查詢關鍵字組（景點/美食/住宿/親子）
// ────────────────────────────────────────────────────────────────────────────
const QUERIES = [
  // 景點
  { q: '嘉義市 景點', cat: '景點' },
  { q: '嘉義縣 景點 推薦', cat: '景點' },
  { q: '阿里山 景點', cat: '景點' },
  { q: '阿里山 森林遊樂區', cat: '景點' },
  { q: '奮起湖 景點', cat: '景點' },
  { q: '嘉義 老街 古蹟', cat: '景點' },
  { q: '梅山 太平雲梯', cat: '景點' },
  { q: '嘉義 瀑布 自然', cat: '景點' },
  { q: '嘉義 步道 登山', cat: '景點' },
  { q: '嘉義 打卡景點', cat: '景點' },
  // 美食
  { q: '嘉義 火雞肉飯', cat: '美食' },
  { q: '嘉義市 美食 餐廳 推薦', cat: '美食' },
  { q: '嘉義 小吃 特色', cat: '美食' },
  { q: '嘉義 砂鍋', cat: '美食' },
  { q: '嘉義 鴨肉飯 鴨肉羹', cat: '美食' },
  { q: '嘉義 早餐 粥', cat: '美食' },
  { q: '奮起湖 便當', cat: '美食' },
  { q: '嘉義 甜點 剉冰', cat: '美食' },
  { q: '嘉義市 排隊美食', cat: '美食' },
  { q: '嘉義縣 特色料理', cat: '美食' },
  // 住宿
  { q: '嘉義市 飯店 推薦', cat: '住宿' },
  { q: '嘉義縣 民宿', cat: '住宿' },
  { q: '阿里山 住宿', cat: '住宿' },
  { q: '嘉義 商旅 旅館', cat: '住宿' },
  { q: '嘉義 親子飯店', cat: '住宿' },
  // 親子
  { q: '嘉義 親子 景點', cat: '親子' },
  { q: '嘉義 兒童 公園 博物館', cat: '親子' },
  { q: '嘉義市立博物館', cat: '親子' },
  { q: '嘉義 動植物園', cat: '親子' },
  { q: '嘉義 農場 體驗', cat: '親子' },
]

// 定向補查（有名但不一定搜到）
const TARGETED = [
  { name: '阿里山國家森林遊樂區', cat: '景點' },
  { name: '奮起湖老街', cat: '景點' },
  { name: '祝山觀日台', cat: '景點' },
  { name: '嘉義北門驛', cat: '景點' },
  { name: '嘉義舊監獄（嘉義市獄政博物館）', cat: '景點' },
  { name: '嘉義公園射日塔', cat: '景點' },
  { name: '太平雲梯', cat: '景點' },
  { name: '達邦部落', cat: '景點' },
  { name: '天長地久橋', cat: '景點' },
  { name: '嘉義市立美術館', cat: '景點' },
  { name: '竹崎親水公園', cat: '景點' },
  { name: '噴水火雞肉飯', cat: '美食' },
  { name: '劉里長雞肉飯', cat: '美食' },
  { name: '林聰明砂鍋魚頭', cat: '美食' },
  { name: '方興雞肉飯', cat: '美食' },
  { name: '東市場（嘉義）', cat: '美食' },
  { name: '福義軒蛋捲', cat: '美食' },
  { name: '阿里山閣大飯店', cat: '住宿' },
  { name: '耐斯王子大飯店', cat: '住宿' },
  { name: '嘉義商旅', cat: '住宿' },
  { name: '嘉義市立博物館', cat: '親子' },
  { name: '嘉義市立動植物園', cat: '親子' },
  { name: '台灣原住民文化園區 嘉義', cat: '親子' },
]

// ────────────────────────────────────────────────────────────────────────────
console.log(`開始 Text Search（${QUERIES.length} 組關鍵字）…`)
const allResults = await mapPool(QUERIES, async ({ q, cat }, i) => {
  const results = await textSearch(q, cat)
  if ((i + 1) % 5 === 0) console.log(`  進度 ${i + 1}/${QUERIES.length}，本組取 ${results.length} 筆`)
  return results
})

console.log(`\n開始定向補查（${TARGETED.length} 筆）…`)
const targetedResults = await mapPool(TARGETED, async ({ name, cat }) => {
  const r = await findPlace(name, cat)
  return r ? [r] : []
})

// 合併，去重以 place_id 為鍵，記 hits
const placeMap = new Map()

function mergeResults(results) {
  for (const place of results) {
    if (!place?.placeId) continue
    if (!isChiayi(place.lat, place.lng, place.address)) continue
    if (placeMap.has(place.placeId)) {
      placeMap.get(place.placeId).hits++
    } else {
      placeMap.set(place.placeId, { ...place, hits: 1 })
    }
  }
}

allResults.forEach(group => group.forEach(p => mergeResults([p])))
targetedResults.forEach(group => group.forEach(p => mergeResults([p])))

console.log(`\n去重後候選：${placeMap.size} 筆`)

// 算貝氏分、排序
const candidates = Array.from(placeMap.values())
  .map(p => ({
    ...p,
    bayesian: parseFloat(bayesian(p.rating, p.reviews).toFixed(4)),
  }))
  .sort((a, b) => b.bayesian - a.bayesian || b.hits - a.hits)

// 按分類分組輸出
const byCategory = { '景點': [], '美食': [], '住宿': [], '親子': [] }
for (const c of candidates) {
  if (byCategory[c.category]) byCategory[c.category].push(c)
  else byCategory['景點'].push(c) // fallback
}

// 輸出 JSON
const output = {
  generatedAt: new Date().toISOString(),
  totalCandidates: candidates.length,
  byCategory,
}
const outPath = path.join(__dirname, '..', 'reports', 'chiayi-candidates.json')
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
console.log(`\n✅ 完成！寫入 ${outPath}`)

// 列出各分類前幾名
for (const [cat, list] of Object.entries(byCategory)) {
  console.log(`\n── ${cat}（${list.length} 筆）前 10：`)
  list.slice(0, 10).forEach((p, i) =>
    console.log(`  ${i + 1}. ${p.name}  ★${p.rating}(${p.reviews})  貝氏${p.bayesian}  hits:${p.hits}`)
  )
}
