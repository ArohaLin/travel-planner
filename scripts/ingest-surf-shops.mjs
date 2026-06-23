/**
 * 台東衝浪店入庫（一次性）：把 6 間衝浪店寫入 lodging_research（category='台東衝浪'）。
 * 資料 = Google Places（評分/評論/官網/地址，存於 skill results/shop-*.json）
 *      + 部落客文章研究（子代理）+ 衝浪專屬事實（課程/價格/裝備/新手/距Day2-3）。
 * 評論深度誠實標示：地圖商家無法取得近一年全量，故 last_year_* 留空、評論重點放 pros/cons quote。
 * 執行：node scripts/ingest-surf-shops.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// 讀 skill 產出的 Places 結果（placeId / rating / total / address / photoRef / district）
const RES = path.join(env.HOME || '/Users/aroha', 'travel-planner/.claude/skills/lodging-review/results')
const places = {}
for (const f of readdirSync(RES).filter((x) => x.startsWith('shop-') && x.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(path.join(RES, f), 'utf8'))
  places[j.resolution.placeId] = j
}

const pc = (point, systematic, quote) => ({ point, systematic, mentions: 0, pct: 0, quote })

// ── 每間的判讀內容（keyed by placeId）──
const CONTENT = {
  // 野孩子衝浪社 Yeah Surf House
  'ChIJr18DgbOfbzQRFrG-FhxBik4': {
    district: '東河鄉',
    verdict: '台東評論數最多（279 則）的衝浪店，蔡倫／小蔡教練小班制、動作分解仔細，多位初學者一兩堂課就成功站板；衝浪＋衝浪客棧住宿一站式。',
    pros: [
      pc('教練教學細緻，初學一堂就站板', true, '小蔡教練真的教得非常仔細…第一次學衝浪就上手了'),
      pc('小班制、全程鼓勵並有助教拍照紀錄', true, '特色是小班制，很用心指導你每個動作和技巧…旁邊助教的拍攝紀錄'),
      pc('可衝浪＋住宿一站式（衝浪客棧）', false, '店家同時提供住宿，步行約 10 分鐘可達東河衝浪點'),
    ],
    cons: [
      pc('自家體驗課／租板價格未公開，需私訊預約', false, '官方部落格停留在 2018 年，價格、課程梯次以 FB／IG 為主'),
      pc('步行可達的東河浪點為中階石頭底，初學需教練帶往都歷沙灘', false, null),
    ],
    suitableFor: '想要評價最多、教練細心帶、初學一次就想站板，且偏好衝浪＋住宿一站式的人。',
    notFor: '想當天現場報名（建議先預約）、或預期淡季（5–9 月以外）穩定開課的人。',
    category: '衝浪教學＋衝浪客棧',
    amenitiesHas: ['浪板出租', '教練全程陪同', '拍照／錄影紀錄', '衝浪客棧住宿', '淋浴', '餐食', '寄板／修板', '線上預約'],
    sourceYears: '2018–2026',
    official: 'https://www.instagram.com/yeahsurfhouse/',
    facts: [
      { text: '教學採教練全程陪同小班制，課程含拍照／錄影紀錄學員下水過程', sources: ['https://swelleye.com/shops-hostels/yeah-surf-house/'] },
      { text: '鄰近都歷沙岸海灘（相對安全的初學浪點）；步行可達的東河浪點本身為石頭底、屬中階，初學請跟教練到都歷', sources: ['https://swelleye.com/surf-spots/donghe/'] },
      { text: '服務含衝浪教學、租板、帶團、賣／修／寄板、淋浴、住宿、餐食；電話 08-989-6316、線上預約 bit.ly/yeahsurfbooking', sources: ['https://swelleye.com/shops-hostels/yeah-surf-house/'] },
      { text: '自家初學體驗課價格未公開；東河一帶他家行情約 NT$1,500–2,000／人（2–3 小時、依人數遞減，2024–2026 參考、非本店報價）', sources: [] },
      { text: '距第 2 天「都歷」衝浪點約 6 km、距第 3 天「東河海岸」約 11 km', sources: [] },
      { text: '適合季節約 5–9 月（暑假）及東北季風期，行前先確認當期是否開課與浪況', sources: ['https://www.klook.com/zh-TW/blog/surfing-guide-taiwan/'] },
    ],
  },

  // 好秋·瑜珈·衝浪 How Chill Surf Yoga
  'ChIJ1_YEm8d1bzQR56XM86-fCPQ': {
    district: '成功鎮',
    verdict: '都歷海灘旁的衝浪×瑜珈×民宿複合店，2 小時保證教學課含板約 NT$1,500，先陸上後下水的完整入門流程；還能擼貓、做瑜珈、剪髮，主打慢生活。',
    pros: [
      pc('衝浪保證教學課含板，入門流程完整', true, '先在陸上學基本動作（划水、起乘）並認識衝浪板，再下水實作、判讀浪況'),
      pc('都歷浪況對新手特別友善', true, '文章明確指出都歷浪況對剛入門新手特別友善'),
      pc('環境舒適可長住，有貓、有瑜珈、有廚房', true, '空間舒適、環境很乾淨…在客廳用電腦還有貓陪你超療癒…還有廚房可以使用'),
    ],
    cons: [
      pc('公開價格為 2020–2021 資料，可能已調整', false, '衝浪保證教學課約 NT$1,500／2 小時（含板），約 2020–2021 年資料'),
      pc('偏慢活／住宿型，密集衝浪訓練未必是主打', false, null),
    ],
    suitableFor: '想衝浪兼放鬆慢活、想要含板價格透明、順便瑜珈／長住／擼貓的人；都歷就在門口。',
    notFor: '只想高強度密集衝浪訓練、不需住宿的人。',
    category: '衝浪教學＋瑜珈＋民宿',
    amenitiesHas: ['含板教學課', '瑜珈課', '民宿住宿', '廚房可用', '貓咪', '專業理髮', '頌缽療癒'],
    sourceYears: '2020–2021',
    official: 'https://www.facebook.com/HowChillsurfyogaStudio/',
    facts: [
      { text: '地址台東縣成功鎮都歷路 211 號（台 11 線旁），電話 0925-857-657', sources: ['https://www.eastcoast-nsa.gov.tw/zh-tw/consume/detail/3593'] },
      { text: '衝浪保證教學課約 2 小時 NT$1,500（含板）；單純租板每日 NT$500（約 2020–2021 年資料，請以最新公告為準）', sources: ['https://spot.line.me/detail/560574292287295674'] },
      { text: '入門流程：先陸上學基本動作與認識衝浪板，再下水實作、判讀浪況；下水點為都歷「巴茲風岸」，距工作室步行約 5 分鐘', sources: ['https://ecnsatw.pixnet.net/blog/post/559455565'] },
      { text: '另有瑜珈（住客 NT$200／非住客 NT$300）、主題房型民宿、廚房、理髮與頌缽療癒', sources: ['https://lindseywonderland.medium.com/'] },
      { text: '距第 2 天「都歷」衝浪點約 0.8 km（步行可達）、距第 3 天「東河海岸」約 17 km', sources: [] },
    ],
  },

  // 都歷海洋教室 Torik Ocean Surf
  'ChIJe_vdLcZ1bzQRtL-DHmngLrE': {
    district: '成功鎮',
    verdict: '都歷部落在地阿美族青年經營，衝浪＋SUP 立槳＋部落文化解說一條龍，馬丁／小雨教練手把手、連未滿 7 歲孩子都帶；最貼近都歷在地特色。',
    pros: [
      pc('教練手把手，含觀浪、離岸流、自救教學', true, '馬丁教練手把手教學…如何看離岸流、要怎麼追浪，被浪帶走要如何等待救援'),
      pc('親子友善，小小孩也能帶', true, '我孩子還沒滿七歲…小雨教練很細心教學，親自呵護小小孩，手把手教學'),
      pc('在地阿美族經營，結合部落文化與 SUP', true, '由一群熱愛海洋的在地阿美族青年共同經營，傳承部落與大海的文化連結'),
    ],
    cons: [
      pc('自家課程／租板價格未公開，需 FB／IG 或電洽', false, '未查得本店明確公開價格，需透過 FB／IG 或電話 0988-947-150 詢問'),
      pc('現場無沖洗設備、須自備換洗衣物；活動受天氣可能取消', false, '參加須自備泳裝或快乾衣物…現場無沖洗設備；可能因天氣臨時取消'),
    ],
    suitableFor: '帶小孩、想學完整海洋安全知識、想體驗在地阿美族文化＋SUP 的人；都歷就在門口。',
    notFor: '需要現場沖洗設備、想先看到明確公開價目比價的人。',
    category: '衝浪教學＋SUP＋部落文化',
    amenitiesHas: ['衝浪課', 'SUP 立槳', '浮潛', '租板', '部落料理', '阿美族文化解說', '寵物友善'],
    sourceYears: '2019–2025',
    official: 'https://www.facebook.com/oceantorik/',
    facts: [
      { text: '由在地阿美族青年經營，提供衝浪、SUP 立槳、浮潛、租板及部落料理，並結合阿美族文化解說', sources: ['https://www.eastcoast-taiwan.com/chn'] },
      { text: '地址台東縣成功鎮都歷路 117 號（都歷海灘旁），電話 0988-947-150', sources: ['https://travelss.net/2025/08/01/'] },
      { text: '另有三仙台 SUP 日出團、海灘跳島 SUP 團、阿美族傳統竹筏體驗等季節進階行程', sources: ['https://www.eastcoast-taiwan.com/chn'] },
      { text: '都歷海灘沙岸、靠岸水域平穩且淺、海域寬廣，被多方描述為較安全、適合初學者與親子的浪點', sources: ['https://tour.taitung.gov.tw/zh-tw/experience/surfing'] },
      { text: '注意：須自備泳裝與換洗衣物、現場無沖洗設備；取消須提前三天通知；建議日出／黃昏穩定時段並提前預約', sources: ['https://www.eastcoast-taiwan.com/chn'] },
      { text: '距第 2 天「都歷」衝浪點約 0.6 km（步行可達）、距第 3 天「東河海岸」約 17 km', sources: [] },
    ],
  },

  // 狂衝浪 Brave Surf Taiwan
  'ChIJeUOulq6fbzQRkQZWUUVHmjc': {
    district: '東河鄉',
    verdict: '東河老牌名店，教練具 ISA 國際指導／裁判／救生認證，課程約 3 小時（岸上＋水下）、在水深及腰的白浪區，不會游泳／8 歲孩童都能玩；體驗課 NT$1,800、可線上預約、附住宿。',
    pros: [
      pc('教練具 ISA 國際認證，安全把關佳', true, '官網明列 ISA SURF COACH LV2、ISA 國際衝浪裁判、國際衝浪救生資格'),
      pc('初學／不會游泳也能玩（水深及腰白浪區）', true, '教練專業的指導，讓初學者也敢勇闖海洋；體驗在水深僅到腰部、踩得到地的安全範圍'),
      pc('教練有耐心、拍照技術好、回覆親切快速', true, '教練專業又有耐心…拍照技術很好…在 FB 只有他們回覆快速、親切'),
    ],
    cons: [
      pc('公開價格頁版權為 2020 年，可能非最新', false, '衝浪體驗課與 SUP 課皆 NT$1,800（預約頁標示 © 2020，可能非最新）'),
      pc('Google 代表評論偏舊（多為 4–5 年前）', false, null),
    ],
    suitableFor: '重視教練專業認證與安全、不會游泳的初學者、想線上預約＋衝浪＋住宿一站式的人；第 3 天東河首選。',
    notFor: '想要當下最新即時口碑（代表評論偏舊）、或行程偏都歷一帶（本店在東河）的人。',
    category: '衝浪教學（ISA 認證）＋住宿',
    amenitiesHas: ['ISA 認證教練', '含板教學', 'SUP 課', '裝備出租／販售', '附設住宿', '線上預約', '不會游泳可玩'],
    sourceYears: '2019–2024',
    official: 'https://www.taiwansurftaitung.com/',
    facts: [
      { text: '地址台東縣東河鄉南東河 60 號（台 11 線、與 7-11 同一條路），電話 0965-665-993', sources: ['https://www.taiwansurftaitung.com/'] },
      { text: '教練具 ISA SURF COACH LV2（國際指導教練）、ISA 國際衝浪裁判、ISA／ILS 國際衝浪救生資格', sources: ['https://www.taiwansurftaitung.com/'] },
      { text: '衝浪體驗課與 SUP 課線上預約皆 NT$1,800／人、約 3 小時（岸上一堂＋水下一堂）；早場 7:00–10:00、午場 14:00–17:00（© 2020）', sources: ['https://www.taiwansurftaitung.com/book-online'] },
      { text: '適合初學者與不會游泳者：教練全程陪同、在水深及腰、踩得到地的白浪花區進行，官方部落格有 8 歲孩童體驗紀錄', sources: ['https://imreadygo.com/109962/'] },
      { text: '提供衝浪板／腳繩／舵出租販售，並附設住宿（雙人房 NT$1,200、四人海景房 NT$2,800 等）', sources: ['https://www.taiwansurftaitung.com/'] },
      { text: '距第 2 天「都歷」衝浪點約 7 km、距第 3 天「東河海岸」約 10 km；下水點以東河沙岸為主', sources: [] },
    ],
  },

  // 貝貝浪人工作室 BayBay Surf Studio
  'ChIJIfDmk62fbzQRODOXzMZEIUk': {
    district: '東河鄉',
    verdict: '台灣首位職業女子長板選手鈕臻琳（貝貝）主理，依程度與 style 客製教學、第一天就上板；海景第一排住宿、東河沙灘下水。屬選手個人小型工作室。',
    pros: [
      pc('職業選手親自教、依程度客製、第一天上板', true, '衝浪教練貝貝超專業，會按程度跟 style 去教…第一天就學會上板'),
      pc('教學仔細、會帶過浪協助上板', true, '教練教的很仔細…還有帶著我過浪、協助上板，是目前體驗過最棒的衝浪過程'),
      pc('海景第一排住宿，可衝浪＋吃＋買一站', false, '房間很漂亮，海景第一排…來衝浪、來吃、來買東西也很好'),
    ],
    cons: [
      pc('小型個人工作室，課程價格／梯次／小班制未公開，需私訊 IG', false, '查無第三方公開資料記載課程價格，建議私訊官方 IG @baybay_niu'),
      pc('規模小、評論數較少（36 則）', false, null),
    ],
    suitableFor: '想跟職業選手學、重視客製化教學與海景住宿、不介意私訊預約的人。',
    notFor: '想要明確公開價目、大型店規模與大量評論佐證的人。',
    category: '衝浪教學（職業選手）＋住宿',
    amenitiesHas: ['職業選手教學', '客製化指導', '租板', '衝浪營隊', 'SUP', '海景住宿', '餐食'],
    sourceYears: '2012–2026',
    official: 'https://www.instagram.com/baybay_niu/',
    facts: [
      { text: '主理人鈕臻琳（貝貝）為台灣首位長期征戰國際賽事的女性長板選手、首位獲 WSL 外卡邀請的台灣女性衝浪手', sources: ['https://www.curito.co/curito-stories/ride-the-waves-baybay-niu'] },
      { text: '不會游泳者也能學（衝浪板本身即為浮具，貝貝表示衝浪比游泳安全）；強調初學者應緊跟教練下水', sources: ['https://www.thecan.com.tw/tw/log/detail/632'] },
      { text: '據點台東縣東河鄉，東河沙灘為公認適合初學者的沙岸浪點；服務含教學、租板、衝浪營、SUP、住宿', sources: ['https://www.gvm.com.tw/article/34055'] },
      { text: '課程價格／梯次未公開，預約與報價以官方 IG @baybay_niu 與 FB 粉專為主', sources: ['https://www.instagram.com/baybay_niu/'] },
      { text: '距第 2 天「都歷」衝浪點約 7 km、距第 3 天「東河海岸」約 10 km', sources: [] },
    ],
  },

  // 都蘭衝浪店 Doulan Surf Shop
  'ChIJxzOXy_GibzQRgxu_8DkHxK8': {
    district: '東河鄉',
    verdict: '都蘭藝文聚落的老字號衝浪店，Hana 教練講解細緻、會調整姿勢，初學一次就站起來；門口標示水溫潮汐風向，都蘭沙灘軟浪適合新手。',
    pros: [
      pc('Hana 教練細心鼓勵，初學一次就站板', true, '第一次學衝浪就可以站起來了，謝謝 Hana 教練，很用心也很有耐心'),
      pc('講解仔細、會調整姿勢，適合初學', true, '初學者很適合，哈娜教練講解過程很仔細，動作上也會注意姿勢調整'),
      pc('門口標示海況，都蘭軟浪沙灘新手友善', false, '店家門口標示氣溫、水溫、漲退潮與風向；都蘭沙地、軟浪為主，適合初學'),
    ],
    cons: [
      pc('評分相對略低（4.5），兩處地址來源不一致', false, '名錄兩處地址（459-2 號 vs 420 之 3 號）不一致，建議以官方粉專為準'),
      pc('自家課程／租板價格未逐字公告，需粉專或來電', false, '未取得本店逐字公告的價格，請以官方粉專／來電查證'),
    ],
    suitableFor: '行程偏都蘭／金樽一帶、喜歡都蘭藝文聚落氛圍、想找細心鼓勵型教練的初學者。',
    notFor: '行程集中在都歷／東河北段（本店在都蘭，距兩處衝浪點約 15–20 km）、想要明確公開價目的人。',
    category: '衝浪教學＋SUP',
    amenitiesHas: ['衝浪教學', 'SUP', '租板', '修板', '訂製板', '寄板', '淋浴', '門口海況標示'],
    sourceYears: '2013–2026',
    official: 'https://www.facebook.com/doulansurfshop/',
    facts: [
      { text: '位於台東縣東河鄉都蘭村（台 11 線），電話 0980-000-476；服務含基礎／進階衝浪教學、SUP、租板、修板、訂製板、寄板與淋浴', sources: ['https://swelleye.com/shops-hostels/doulan-surf-shop/'] },
      { text: '門口貼心標示氣溫、水溫、漲退潮與風向風速，方便下水前判斷海況', sources: ['https://yafufu.life/taitung/'] },
      { text: '都蘭沙灘沙地、軟浪為主，適合初學練習；鄰近另有金樽浪點（海灣較穩定）', sources: ['https://eyesonplace.net/2022/08/10/21357/'] },
      { text: '自家價格未逐字公告；都蘭一帶區域行情：2 小時教學約 NT$1,300–2,000／人（依人數遞減）、租板約 NT$300–500／天（2022–2026 參考、非本店報價）', sources: [] },
      { text: '距第 2 天「都歷」衝浪點約 20 km、距第 3 天「東河海岸」約 14 km（本店偏南、在都蘭）', sources: [] },
    ],
  },
}

// ── 組 row 並 upsert ──
let ok = 0
for (const [placeId, c] of Object.entries(CONTENT)) {
  const p = places[placeId]
  if (!p) { console.error('❌ 找不到 Places 結果:', placeId); continue }
  const row = {
    google_place_id: placeId,
    category: '台東衝浪',
    name: p.business.name,
    city: '台東縣',
    district: c.district,
    address: p.business.address,
    rating: p.overall.rating,
    total_reviews: p.overall.totalReviews,
    star_class: null,
    last_year_avg: null, last_year_count: null, last_year_dist: null,
    pros: c.pros,
    cons: c.cons,
    verdict: c.verdict,
    suitable_for: c.suitableFor,
    not_for: c.notFor,
    confidence: 'high',
    query_name: p.resolution.queryName,
    resolved_name: p.resolution.resolvedName,
    photo_ref: p.resolution.photoRef,
    coverage: { 備註: `Google 官方評分 ${p.overall.rating}★／${p.overall.totalReviews} 則＋代表評論 ${p.reviews.length} 則＋部落客文章（${c.sourceYears}）。地圖商家無法取得近一年全量評論，評論重點以代表評論呈現。` },
    features: {
      summary: p.placeFeatures.summary,
      category: c.category,
      amenities: { has: c.amenitiesHas, lacks: [] },
      facts: c.facts,
      roomTypes: [],
      sourceYears: c.sourceYears,
      official: c.official,
    },
    model: 'claude',
  }
  const { error } = await db.from('lodging_research').upsert(row, { onConflict: 'google_place_id' })
  if (error) { console.error('❌', row.name, error.message) } else { console.log(`✓ ${row.name} | ${row.rating}★/${row.total_reviews} | ${row.district} | pros${row.pros.length} cons${row.cons.length} facts${row.features.facts.length}`); ok++ }
}
console.log(`\n完成：${ok}/${Object.keys(CONTENT).length} 間入庫`)
