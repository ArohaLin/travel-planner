/**
 * 補回各事實的「多個佐證來源連結」（子代理研究找到多篇佐證，先前入庫被精簡成一個）。
 * 以事實文字前綴比對既有 features.facts，設定完整 sources（合併去重）。執行：node scripts/update-surf-sources.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// placeId → { 事實文字前綴: [全部佐證來源URL] }（取自 6 個研究子代理的 articles/sources）
const SRC = {
  // 野孩子衝浪社
  'ChIJr18DgbOfbzQRFrG-FhxBik4': {
    '教學採教練全程陪同': ['https://yeahsurfhouse.blogspot.com/', 'https://swelleye.com/shops-hostels/yeah-surf-house/'],
    '鄰近都歷沙岸海灘': ['https://swelleye.com/surf-spots/donghe/', 'https://tour.taitung.gov.tw/zh-tw/experience/surfing'],
    '服務含衝浪教學、租板': ['https://swelleye.com/shops-hostels/yeah-surf-house/', 'https://www.facebook.com/yeahsurfhouse/', 'https://hopout.com.tw/adventure/surfing-taitung-county-with-yeahsurfhouse-3535'],
    '適合季節約 5–9 月': ['https://www.klook.com/zh-TW/blog/surfing-guide-taiwan/', 'https://tour.taitung.gov.tw/zh-tw/experience/surfing'],
  },
  // 好秋·瑜珈·衝浪
  'ChIJ1_YEm8d1bzQR56XM86-fCPQ': {
    '地址台東縣成功鎮都歷路 211': ['https://www.eastcoast-nsa.gov.tw/zh-tw/consume/detail/3593', 'https://spot.line.me/detail/560574292287295674'],
    '衝浪保證教學課約 2 小時': ['https://spot.line.me/detail/560574292287295674', 'https://magic105.pixnet.net/blog/post/44208271'],
    '入門流程：先陸上學基本動作': ['https://ecnsatw.pixnet.net/blog/post/559455565'],
    '另有瑜珈': ['https://lindseywonderland.medium.com/', 'https://indoor-lodging-2106.business.site/', 'https://www.facebook.com/HowChillsurfyogaStudio/'],
  },
  // 都歷海洋教室
  'ChIJe_vdLcZ1bzQRtL-DHmngLrE': {
    '由在地阿美族青年經營': ['https://www.eastcoast-taiwan.com/chn', 'https://travelss.net/2025/08/01/'],
    '另有三仙台 SUP 日出團': ['https://www.eastcoast-taiwan.com/chn', 'https://travelss.net/2025/08/01/'],
    '都歷海灘沙岸': ['https://tour.taitung.gov.tw/zh-tw/experience/surfing', 'https://www.eastcoast-taiwan.com/chn', 'https://travel.yam.com/article/119888'],
    '注意：須自備泳裝': ['https://www.eastcoast-taiwan.com/chn'],
  },
  // 狂衝浪 Brave Surf
  'ChIJeUOulq6fbzQRkQZWUUVHmjc': {
    '地址台東縣東河鄉南東河 60': ['https://www.taiwansurftaitung.com/', 'https://imreadygo.com/109962/'],
    '教練具 ISA SURF COACH': ['https://www.taiwansurftaitung.com/', 'https://www.taiwansurf.com.tw/'],
    '衝浪體驗課與 SUP 課線上預約': ['https://www.taiwansurftaitung.com/book-online'],
    '適合初學者與不會游泳者': ['https://imreadygo.com/109962/', 'https://www.taiwansurftaitung.com/blog', 'https://www.taiwansurftaitung.com/book-online'],
    '提供衝浪板／腳繩／舵': ['https://www.taiwansurftaitung.com/', 'https://www.taiwansurftaitung.com/home'],
  },
  // 貝貝浪人工作室
  'ChIJIfDmk62fbzQRODOXzMZEIUk': {
    '主理人鈕臻琳（貝貝）': ['https://www.curito.co/curito-stories/ride-the-waves-baybay-niu', 'https://www.gvm.com.tw/article/34055', 'https://www.persona-media.com/tw/7331/interview-surf-niou-jhen-lin'],
    '不會游泳者也能學': ['https://www.thecan.com.tw/tw/log/detail/632'],
    '據點台東縣東河鄉': ['https://www.gvm.com.tw/article/34055', 'https://travel.ettoday.net/article/24461.htm'],
    '課程價格／梯次未公開': ['https://www.instagram.com/baybay_niu/'],
  },
  // 都蘭衝浪店
  'ChIJxzOXy_GibzQRgxu_8DkHxK8': {
    '位於台東縣東河鄉都蘭村': ['https://swelleye.com/shops-hostels/doulan-surf-shop/', 'https://www.facebook.com/doulansurfshop/', 'https://www.betelnut.co/doulan-surf-shop'],
    '門口貼心標示氣溫': ['https://yafufu.life/taitung/'],
    '都蘭沙灘沙地': ['https://eyesonplace.net/2022/08/10/21357/', 'https://yafufu.life/taitung/'],
    '自家價格未逐字公告': ['https://www.surfingtaitung.com/surf-camp-lesson', 'https://tour.taitung.gov.tw/zh-tw/experience/surfing'],
  },
}

let total = 0
for (const [id, map] of Object.entries(SRC)) {
  const { data } = await db.from('lodging_research').select('name,features').eq('google_place_id', id).single()
  const features = data.features || {}
  const facts = Array.isArray(features.facts) ? features.facts : []
  let touched = 0
  for (const f of facts) {
    const key = Object.keys(map).find((k) => (f.text || '').startsWith(k))
    if (!key) continue
    const merged = Array.from(new Set([...(f.sources || []), ...map[key]]))
    if (merged.length !== (f.sources || []).length) { f.sources = merged; touched++ }
    else f.sources = merged
  }
  features.facts = facts
  const { error } = await db.from('lodging_research').update({ features }).eq('google_place_id', id)
  const multi = facts.filter((f) => (f.sources || []).length > 1).length
  console.log(error ? `❌ ${data.name} ${error.message}` : `✓ ${data.name}：補來源 ${touched} 條｜多來源事實 ${multi} 條`)
  total += touched
}
console.log(`\n完成：共補 ${total} 條事實的多來源連結`)
