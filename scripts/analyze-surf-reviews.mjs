/**
 * 分析 headful Maps 抓到的真實評論（/tmp/headful/maps-*.json 與 reviews-*.json）：
 * 近一年過濾、星等分佈、主題關鍵字實際被提及次數/百分比、負評抽取。
 * 輸出 /tmp/headful/analysis.json（給 re-ingest 用）＋ 終端摘要。
 * 執行：node scripts/analyze-surf-reviews.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const DIR = '/tmp/headful'
const WINDOW = 365

function relDays(s) {
  s = String(s || '').replace(/\(Google\)|在 Google.*|上次編輯[：:]/g, '').trim()
  const cn = { 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const n = /\d/.test(s) ? parseInt(s.match(/\d+/)[0], 10) : (cn[(s.match(/[一兩二三四五六七八九十]/) || [''])[0]] || 1)
  if (/小時|分鐘|今天|剛剛/.test(s)) return 0
  if (/天前/.test(s)) return n
  if (/週|周/.test(s)) return n * 7
  if (/個月/.test(s)) return n * 30
  if (/年/.test(s)) return n * 365
  return 9999
}

// 衝浪店正向主題（關鍵字）
const THEMES = [
  { key: '教練專業有耐心', re: /教練.{0,6}(專業|仔細|細心|耐心|用心|清楚)|(專業|仔細|細心|耐心|用心).{0,4}教練|很會教|教得(很|超|非常)?(好|仔細|清楚)|手把手|分解(動作|教學)/ },
  { key: '新手友善・能站板', re: /第一次|初學|新手|沒(衝過|玩過)|站(起來|上|立)|上板|成功(站|衝)|旱鴨子|不會游泳/ },
  { key: '拍照錄影紀錄', re: /拍(照|攝)|照片|紀錄|錄影|影片|相片/ },
  { key: '鼓勵親切氛圍', re: /鼓勵|親切|熱情|友善|貼心|nice|很(好|棒)的(體驗|經驗)|開心|好玩/ },
  { key: '環境/住宿舒適', re: /環境|乾淨|舒適|住宿|房間|海景|空間|民宿|客棧/ },
  { key: '安全把關', re: /安全|放心|救生|淺水|腰部|踩得到|保護/ },
  { key: '裝備/器材', re: /裝備|浪板|防磨衣|器材|租板|板子/ },
]

const files = readdirSync(DIR).filter((f) => /^maps-.*\.json$/.test(f))
const all = {}
const clean = (t) => String(t || '').replace(/…?\s*更多\s*$/, '').replace(/\s+/g, ' ').trim()
for (const f of files) {
  const j = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  const reviews = (j.reviews || []).map((r) => ({ ...r, text: clean(r.text), daysAgo: relDays(r.date) }))
  // 用「全部抓到的真實評論」算分佈/主題（大樣本、histogram 有意義）；近一年另計供備註
  const rated = reviews.filter((r) => r.rating)
  const nearYearCount = rated.filter((r) => r.daysAgo <= WINDOW).length
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  rated.forEach((r) => { const s = Math.round(r.rating); if (dist[s] != null) dist[s]++ })
  const avg = rated.length ? +(rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2) : null
  // 主題統計（全部有文字評論）
  const withText = rated.filter((r) => r.text && r.text.length >= 8)
  const themesRaw = THEMES.map((t) => ({ key: t.key, hits: withText.filter((r) => t.re.test(r.text)) })).filter((t) => t.hits.length > 0).sort((a, b) => b.hits.length - a.hits.length)
  const usedQuote = new Set()
  const themes = themesRaw.map((t) => {
    // 偏好約 40–90 字的精簡引言、且未被其他主題用過
    const cand = [...t.hits].sort((a, b) => Math.abs(a.text.length - 55) - Math.abs(b.text.length - 55))
    const pick = cand.find((h) => h.text.length >= 16 && h.text.length <= 110 && !usedQuote.has(h.text)) || cand.find((h) => !usedQuote.has(h.text)) || t.hits[0]
    if (pick) usedQuote.add(pick.text)
    const q = pick ? (pick.text.length > 100 ? pick.text.slice(0, 100) + '…' : pick.text) : null
    return { key: t.key, mentions: t.hits.length, pct: withText.length ? +(t.hits.length / withText.length * 100).toFixed(0) : 0, quote: q }
  })
  const negs = rated.filter((r) => r.rating <= 3 && r.text && r.text.length >= 10).sort((a, b) => a.daysAgo - b.daysAgo).map((r) => ({ rating: r.rating, date: r.date, text: r.text.slice(0, 180) }))
  all[j.name] = {
    name: j.name, placeId: j.placeId,
    scraped: reviews.length, rated: rated.length, withText: withText.length, nearYear: nearYearCount,
    avg, dist: [5, 4, 3, 2, 1].map((s) => ({ star: s, count: dist[s], percent: rated.length ? +(dist[s] / rated.length * 100).toFixed(1) : 0 })),
    themes, negCount: negs.length, negs: negs.slice(0, 8),
  }
  console.log(`\n===== ${j.name} =====`)
  console.log(`抓 ${reviews.length} 則（有星等 ${rated.length}・有文 ${withText.length}）｜近一年 ${nearYearCount} 則｜平均 ${avg}`)
  console.log('分佈:', all[j.name].dist.map((d) => `${d.star}★ ${d.count}(${d.percent}%)`).join(' '))
  console.log('主題:', themes.map((t) => `${t.key} ${t.mentions}(${t.pct}%)`).join('｜'))
  console.log('負評:', negs.length, negs.slice(0, 3).map((n) => `[${n.rating}★]${n.text.slice(0, 44)}`).join(' ｜ ') || '無')
}
writeFileSync(`${DIR}/analysis.json`, JSON.stringify(all, null, 2))
console.log(`\n✅ 已寫 ${DIR}/analysis.json（${Object.keys(all).length} 間）`)
