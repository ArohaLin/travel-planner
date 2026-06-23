/**
 * 交叉核對：把 DB 既有「部落客文章特色（features.facts）」與本次 headful 抓到的真實評論對照。
 * 重點：① 真實評論裡顧客提到的價格 ② 文章關鍵事實在評論中是否被佐證 ③ 評論常見抱怨。
 * 執行：node scripts/crosscheck-surf.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const DIR = '/tmp/headful'
const clean = (t) => String(t || '').replace(/…?\s*更多\s*$/, '').replace(/\s+/g, ' ').trim()

// 檔名 → placeId（對齊 DB）＋ 要驗證的關鍵事實詞
const SHOPS = {
  'maps-野孩子衝浪社.json': { id: 'ChIJr18DgbOfbzQRFrG-FhxBik4', keys: { '教練蔡倫/小蔡': /蔡倫|小蔡|教練/, '拍照紀錄': /拍照|拍攝|錄影|相片|照片/, '住宿/客棧': /住宿|房間|客棧|過夜|住一/, '小班制': /小班|一對一|人數少/, '餐食': /煮|餐|吃|料理|食/ } },
  'maps-好秋衝浪.json': { id: 'ChIJ1_YEm8d1bzQR56XM86-fCPQ', keys: { '瑜珈': /瑜珈|瑜伽|yoga/i, '貓': /貓|喵/, '住宿': /住宿|房間|民宿|過夜/, '理髮': /理髮|剪髮|髮型|頭髮/, '廚房': /廚房|煮/ } },
  'maps-都歷海洋教室.json': { id: 'ChIJe_vdLcZ1bzQRtL-DHmngLrE', keys: { '阿美族/部落': /阿美|部落|原住民/, 'SUP立槳': /SUP|立槳|sup/i, '親子/小孩': /小孩|孩子|親子|兒童|女兒|兒子/, '馬丁教練': /馬丁/, '餐點': /餐|吃|料理|風味/ } },
  'maps-狂衝浪.json': { id: 'ChIJeUOulq6fbzQRkQZWUUVHmjc', keys: { 'ISA/認證': /ISA|認證|國際/, '不會游泳/旱鴨子': /不會游泳|旱鴨|怕水|不會游/, '住宿': /住宿|民宿|房間|過夜/, 'SUP/馬武窟': /SUP|立槳|馬武窟/i, '線上預約': /預約|報名/ } },
  'maps-貝貝浪人.json': { id: 'ChIJIfDmk62fbzQRODOXzMZEIUk', keys: { '職業選手/長板': /選手|長板|職業|國手|冠軍/, '租板': /租板|板子|租借/, '住宿/海景': /住宿|海景|房間|過夜/, '捲餅/餐': /捲餅|吃|餐|食物/ } },
  'maps-都蘭衝浪店.json': { id: 'ChIJxzOXy_GibzQRgxu_8DkHxK8', keys: { 'Hana教練': /Hana|哈娜|漢娜/i, '租板': /租板|板子|租借/, '軟浪/沙灘': /軟浪|沙灘|沙岸/, '不回訊息(抱怨)': /不回|不接|沒回|聯絡不到|沒接/ } },
}

const PRICE = /(?:NT\$?|＄|\$|台幣|新台幣)?\s?(\d{3,5})\s?(?:元|塊|NT|台幣)?(?=[^\d]|$)/g
function prices(text) {
  const out = []
  let m
  const t = text.replace(/\d{4}\/\d|\d{4}年|\d+:\d+|第\d+天|\d+月|\d+日|\d+人|\d+小時|\d+次|\d+歲|\d+分鐘|\d+米|\d+公尺|\d+號/g, ' ')
  while ((m = PRICE.exec(t))) { const n = +m[1]; if (n >= 200 && n <= 30000) out.push(n) }
  return out
}

for (const [f, cfg] of Object.entries(SHOPS)) {
  const j = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  const reviews = (j.reviews || []).map((r) => ({ ...r, text: clean(r.text) })).filter((r) => r.text)
  const { data } = await db.from('lodging_research').select('name,features').eq('google_place_id', cfg.id).single()
  console.log(`\n========== ${data.name}（真實評論 ${reviews.length} 則）==========`)
  // 文章 facts 中與價格/課程相關的
  const facts = data.features?.facts || []
  console.log('— 文章特色（DB facts）—')
  for (const ft of facts) console.log('  ·', ft.text.slice(0, 70))
  // 評論裡的價格
  const priceMap = {}
  const priceCtx = {}
  for (const r of reviews) for (const p of prices(r.text)) { priceMap[p] = (priceMap[p] || 0) + 1; if (!priceCtx[p]) priceCtx[p] = r.text.slice(Math.max(0, r.text.search(String(p)) - 18), r.text.search(String(p)) + 18) }
  const topPrices = Object.entries(priceMap).filter(([, c]) => c >= 1).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log('— 真實評論提到的金額（次數）—')
  console.log('  ', topPrices.map(([p, c]) => `$${p}×${c}`).join('  ') || '（無明確金額）')
  for (const [p] of topPrices.slice(0, 4)) console.log(`     $${p}: …${priceCtx[p]}…`)
  // 關鍵事實佐證
  console.log('— 文章關鍵事實 vs 評論佐證 —')
  for (const [k, re] of Object.entries(cfg.keys)) {
    const hits = reviews.filter((r) => re.test(r.text))
    const sample = hits.find((h) => h.text.length < 80)?.text || hits[0]?.text?.slice(0, 60) || ''
    console.log(`  [${hits.length ? '✓' : '✗'}] ${k}：${hits.length} 則${hits.length ? `　例「${sample.slice(0, 50)}」` : ''}`)
  }
}
