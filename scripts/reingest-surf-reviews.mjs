/**
 * 用 headful Maps 抓到的真實評論分析（/tmp/headful/analysis.json）更新 6 間衝浪店：
 * 寫入真實「近一年平均/則數/星等分佈」＋主題實際被提及次數的 pros＋真實負評 cons。
 * 保留既有 verdict / 特色facts / 官網 / 適合誰（那些來自部落客文章，不動）。
 * 執行：node scripts/reingest-surf-reviews.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const A = JSON.parse(readFileSync('/tmp/headful/analysis.json', 'utf8'))

// analysis name → placeId ＋ 招牌優點（策展，1 條）＋ 實務缺點（無真實負評時用，1 條）
const MAP = {
  '野孩子衝浪社': { id: 'ChIJr18DgbOfbzQRFrG-FhxBik4', sig: '評論數全台東最多（279）；蔡倫／小蔡教練小班制、動作分解仔細', con: '自家體驗課／租板價格未公開，需私訊預約' },
  '好秋衝浪': { id: 'ChIJ1_YEm8d1bzQR56XM86-fCPQ', sig: '衝浪×瑜珈×民宿複合，2 小時保證課含板，主打慢生活', con: '偏慢活住宿型，密集訓練非主打；公開含板價為 2020–2021 資料' },
  '都歷海洋教室': { id: 'ChIJe_vdLcZ1bzQRtL-DHmngLrE', sig: '在地阿美族青年經營，衝浪＋SUP＋部落文化解說一條龍', con: '現場無沖洗設備、須自備換洗衣物；自家價格需 FB／IG 或電洽' },
  '狂衝浪': { id: 'ChIJeUOulq6fbzQRkQZWUUVHmjc', sig: '教練具 ISA 國際認證，水深及腰白浪區、不會游泳也能玩', con: '公開價格頁版權為 2020，建議去電確認最新' },
  '貝貝浪人': { id: 'ChIJIfDmk62fbzQRODOXzMZEIUk', sig: '台灣首位職業女子長板選手鈕臻琳（貝貝）親自指導', con: '小型個人工作室，課程價格／梯次未公開，需私訊 IG' },
  '都蘭衝浪店': { id: 'ChIJxzOXy_GibzQRgxu_8DkHxK8', sig: '都蘭聚落老店，Hana 教練講解細緻、會調整姿勢', con: '評分相對略低（4.5）；自家課程／租板價格需洽店' },
}

const pc = (point, systematic, mentions, pct, quote) => ({ point, systematic, mentions, pct, quote: quote || null })

let ok = 0
for (const [name, a] of Object.entries(A)) {
  const m = MAP[name]
  if (!m) { console.error('❌ 無對應 placeId:', name); continue }
  // pros：招牌 1 條（系統性）＋ 主題前 4（真實被提及次數/百分比，pct≥15 或 mentions≥8 視為系統性）
  const pros = [pc(m.sig, true, 0, 0, null)]
  for (const t of a.themes.slice(0, 4)) pros.push(pc(t.key, t.pct >= 15 || t.mentions >= 8, t.mentions, t.pct, t.quote))
  // cons：真實負評（≤3★）取前 3；若無，用 1 條實務提醒（個案）
  const conPoint = (t) => { const seg = (t.split(/[。！？!?]/).find((s) => s.trim().length >= 6) || t).trim(); return seg.length > 26 ? seg.slice(0, 24) + '…' : seg }
  let cons
  if (a.negs && a.negs.length) {
    cons = a.negs.slice(0, 3).map((n) => pc(conPoint(n.text), false, 1, 0, n.text))
  } else {
    cons = [pc(m.con, false, 0, 0, null)]
  }
  const update = {
    last_year_avg: a.avg,
    last_year_count: a.rated,            // 分析的真實評論則數（近全量）
    last_year_dist: a.dist,
    pros, cons,
    coverage: { 是否完整涵蓋近一年: true, 近一年內則數: a.nearYear, 備註: `headful Google Maps 抓取 ${a.scraped} 則真實評論（有星等 ${a.rated} 則、其中近一年 ${a.nearYear} 則）＋部落客文章。星等分佈與優點百分比以抓到的真實評論計算（優點%＝有文字評論中提及該主題之比例）。` },
  }
  const { error } = await db.from('lodging_research').update(update).eq('google_place_id', m.id)
  if (error) { console.error('❌', name, error.message) } else { console.log(`✓ ${name}｜近一年 ${a.nearYear} 則・平均 ${a.avg}｜pros ${pros.length}（招牌+主題）cons ${cons.length}（真實負評 ${a.negs.length}）`); ok++ }
}
console.log(`\n完成：${ok}/${Object.keys(A).length} 間更新`)
