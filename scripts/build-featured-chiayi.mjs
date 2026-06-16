/**
 * 嘉義精選推薦・Featured 建置腳本（Phase C 策展結果）
 *
 * 對每筆精選地點做 findplacefromtext 確認 place_id + 座標 + photoRef，
 * 寫入 recommendations（tier='featured'）。
 *
 * 執行：node scripts/build-featured-chiayi.mjs
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

const KEY   = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
const DB    = process.env.SUPABASE_DB_URL
if (!KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
if (!DB)  throw new Error('SUPABASE_DB_URL not set')

async function findPlace(name) {
  const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(name + ' 嘉義')}` +
    '&inputtype=textquery' +
    '&fields=place_id,geometry,photos,rating,user_ratings_total' +
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
      rating:   c.rating ?? null,
      reviews:  c.user_ratings_total ?? null,
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

// ── 精選清單（Phase C 策展結果）────────────────────────────────────────────
const FEATURED = [
  // === 景點 12 筆 ===
  {
    category: '景點', name: '阿里山國家森林遊樂區',
    editorial: '台灣最具代表性高山景區。神木、祝山日出、雲海、阿里山鐵路，四季皆美，觀光署認證必遊。',
    tags: ['觀光署', '阿里山', '森林', '日出', '雲海', '鐵路'],
    badges: ['觀光署', '媒體推薦'],
    credibility: 4.5989,
  },
  {
    category: '景點', name: '祝山觀日平臺',
    editorial: '阿里山看日出的最佳地點。搭小火車抵達後漫步至平台，望向雲海上的曙光，旅遊書必推。',
    tags: ['日出', '雲海', '阿里山', '鐵路', '拍照'],
    badges: ['媒體推薦'],
    credibility: 4.5912,
  },
  {
    category: '景點', name: '嘉義梅山太平雲梯',
    editorial: '懸掛山谷間的雲端天梯，長約281公尺，腳下雲霧繚繞。媒體爆紅，是梅山最熱打卡地標。',
    tags: ['打卡', '雲海', '梅山', '步道', '拍照'],
    badges: ['媒體推薦'],
    credibility: 4.5793,
  },
  {
    category: '景點', name: '特富野古道',
    editorial: '阿里山鄒族傳統古道，廢棄林道與森林步道交疊，竹林隧道與巨木群，部落客一致推薦最美古道之一。',
    tags: ['古道', '竹林', '原住民', '步道', '自然'],
    badges: ['觀光署', '媒體推薦'],
    credibility: 4.5932,
  },
  {
    category: '景點', name: '新港奉天宮',
    editorial: '嘉義縣最具代表性的媽祖廟，全台香火鼎盛廟宇，農曆繞境時人潮達百萬，建築規模壯觀。',
    tags: ['廟宇', '媽祖', '文化', '宗教', '嘉義縣'],
    badges: ['觀光署', '媒體推薦'],
    credibility: 4.5968,
  },
  {
    category: '景點', name: '優遊吧斯鄒族文化部落',
    editorial: '嘉義唯一鄒族主題文化園區。鄒族歌舞表演、獵寮、傳統建築、射箭體驗，官方認證原住民觀光。',
    tags: ['原住民', '鄒族', '文化', '表演', '體驗'],
    badges: ['觀光署'],
    credibility: 4.4939,
  },
  {
    category: '景點', name: '嘉義市立美術館',
    editorial: '前菸酒公賣局廳舍改建，保留日治時代建築元素，展覽多元。嘉義文化藝術中心，觀光署推薦。',
    tags: ['美術館', '藝術', '日治', '文化', '免費'],
    badges: ['觀光署'],
    credibility: 4.4936,
  },
  {
    category: '景點', name: '臺灣花磚博物館',
    editorial: '全台唯一以台灣老花磚為主題的博物館，收藏超過千件日治時代古建築花磚，媒體多次報導。',
    tags: ['博物館', '花磚', '日治', '文化', '特色'],
    badges: ['媒體推薦'],
    credibility: 4.4932,
  },
  {
    category: '景點', name: '嘉義市立博物館',
    editorial: '嘉義市歷史文物與自然科學綜合博物館，恐龍化石、嘉義原住民文化展覽，官方設施，免費入場。',
    tags: ['博物館', '歷史', '自然', '文化', '免費'],
    badges: ['觀光署'],
    credibility: 4.3935,
  },
  {
    category: '景點', name: '北門驛',
    editorial: '嘉義市定古蹟，阿里山林業鐵路起點站。日治時代木造車庫建築，是嘉義林業文化最重要地標。',
    tags: ['古蹟', '鐵路', '日治', '木造', '林業'],
    badges: ['觀光署', '古蹟'],
    credibility: 4.2,
  },
  {
    category: '景點', name: '國定古蹟-嘉義舊監獄',
    editorial: '全台保存最完整的日治時代監獄，國定古蹟。扇形放射狀牢房、老榕樹環繞，導覽體驗獨特。',
    tags: ['古蹟', '日治', '歷史', '導覽', '特色'],
    badges: ['觀光署', '古蹟'],
    credibility: 4.2982,
  },
  {
    category: '景點', name: '奮起湖老街',
    editorial: '阿里山鐵路最重要中繼站，日治時代懷舊老街，木造建築保留完整，便當聞名全台，是鐵道小鎮的縮影。',
    tags: ['老街', '鐵路', '日治', '便當', '懷舊'],
    badges: ['媒體推薦'],
    credibility: 4.2,
  },

  // === 美食 13 筆 ===
  {
    category: '美食', name: '林聰明沙鍋魚頭',
    editorial: '嘉義沙鍋魚頭聖地，米其林必比登（Bib Gourmand）、各大旅遊書必推。Google 星等偏低但代表性無庸置疑，不靠星等推薦。',
    tags: ['沙鍋', '魚頭', '必比登', '老店', '嘉義必吃'],
    badges: ['必比登', '媒體推薦'],
    credibility: 4.2, // 以代表性取代貝氏
  },
  {
    category: '美食', name: '民主火雞肉飯',
    editorial: '嘉義火雞肉飯中評論最多的店之一（逾萬則），肉質軟嫩、醬汁適中，多家媒體和部落客推薦。',
    tags: ['火雞肉飯', '嘉義小吃', '平價', '排隊'],
    badges: ['媒體推薦'],
    credibility: 4.2,
  },
  {
    category: '美食', name: '桃城三禾火雞肉飯',
    editorial: '嘉義火雞肉飯老店，飯粒Q彈、火雞肉鮮嫩，評分在火雞肉飯店中較高，評論量多。',
    tags: ['火雞肉飯', '嘉義小吃', '老店'],
    badges: [],
    credibility: 4.394,
  },
  {
    category: '美食', name: '奮起湖大飯店-奮起湖便當創始店',
    editorial: '奮起湖便當的百年聖地，阿里山鐵路旅遊必吃。竹籃便當飯菜豐盛，媒體無數次報導，旅遊書必提。',
    tags: ['便當', '阿里山', '百年老店', '鐵路', '必吃'],
    badges: ['媒體推薦'],
    credibility: 4.3964,
  },
  {
    category: '美食', name: '合平鴨肉羹',
    editorial: '嘉義傳統鴨肉羹代表，湯頭濃郁、鴨肉軟嫩，在地人與旅人都愛的家常小吃。',
    tags: ['鴨肉羹', '嘉義小吃', '傳統', '平價'],
    badges: [],
    credibility: 4.7986,
  },
  {
    category: '美食', name: '古早時代-現炒鴨肉羹',
    editorial: '嘉義老字號鴨肉羹，搭配藥頭排骨，早點豐盛，評論量與評分俱佳的市場早餐代表。',
    tags: ['鴨肉羹', '排骨', '早餐', '傳統', '市場'],
    badges: [],
    credibility: 4.6434,
  },
  {
    category: '美食', name: '打貓冰果室',
    editorial: '「打貓」是嘉義民雄鄉的舊地名，傳統剉冰老店，仙草、愛玉、紅豆等配料道地，評論超多。',
    tags: ['冰品', '傳統', '老店', '平價', '剉冰'],
    badges: [],
    credibility: 4.4925,
  },
  {
    category: '美食', name: '阿婆炸麻糬',
    editorial: '嘉義市區傳統現炸麻糬，外酥內Q，花生芝麻口味，觀光客必吃的街頭小吃。',
    tags: ['麻糬', '炸物', '傳統', '街頭小吃', '伴手禮'],
    badges: [],
    credibility: 4.634,
  },
  {
    category: '美食', name: '舊時光新鮮事-老屋咖哩專賣',
    editorial: '嘉義老屋改建咖哩餐廳，多家媒體報導，文青空間搭配用心咖哩，hits:3，嘉義文創餐飲代表。',
    tags: ['咖哩', '老屋', '文青', '媒體推薦', '午餐'],
    badges: ['媒體推薦'],
    credibility: 4.5917,
  },
  {
    category: '美食', name: '仁芝初豆腐冰店',
    editorial: '嘉義特色豆腐冰，以嫩豆腐為基底的創意冰品，清爽解熱，評分高且評論量合理的甜點店。',
    tags: ['豆腐冰', '甜點', '特色', '嘉義限定'],
    badges: [],
    credibility: 4.7253,
  },
  {
    category: '美食', name: '湯城鵝行-檜意店',
    editorial: '嘉義在地鵝油品牌，鵝油拌飯是招牌，也販售各式鵝肉熟食。位於檜意森活村商圈，伴手禮首選。',
    tags: ['鵝油', '伴手禮', '特色', '鵝肉'],
    badges: [],
    credibility: 4.699,
  },
  {
    category: '美食', name: '福義軒-成功門市',
    editorial: '嘉義蛋捲品牌的百年老店，旅遊書必提伴手禮，口感酥脆傳統。Google 星等偏低（排隊服務口碑），但代表性強，收錄不靠星等。',
    tags: ['蛋捲', '伴手禮', '百年老店', '嘉義必買'],
    badges: ['媒體推薦'],
    credibility: 4.0, // 以代表性取代低貝氏
  },
  {
    category: '美食', name: '初沐鰻魚專賣社',
    editorial: '朴子市特色鰻魚料理專賣，食材新鮮、評分評論俱佳，是嘉義縣海線美食代表之一。',
    tags: ['鰻魚', '海鮮', '特色', '朴子'],
    badges: [],
    credibility: 4.679,
  },

  // === 住宿 10 筆 ===
  {
    category: '住宿', name: '嘉義兆品酒店',
    editorial: '嘉義市首屈一指的商務飯店，評論超過兩萬則，服務穩定，地點便利，媒體常推薦。',
    tags: ['商務', '嘉義市區', '高評論', '便利'],
    badges: ['媒體推薦'],
    credibility: 4.797,
  },
  {
    category: '住宿', name: '星義文旅Star Yi Wen Lu',
    editorial: '嘉義市文創設計風精品旅館，近嘉義市立美術館，空間質感佳，評分高且評論量合理。',
    tags: ['文青', '設計', '嘉義市區', '精品旅館'],
    badges: [],
    credibility: 4.846,
  },
  {
    category: '住宿', name: '耐斯王子大飯店',
    editorial: '嘉義老牌大飯店，品牌知名度高、hits:3，設施完整。Google 評分達均值，誠實標注品質較為普通。',
    tags: ['老牌', '嘉義市區', '完整設施', '大飯店'],
    badges: [],
    credibility: 4.2,
  },
  {
    category: '住宿', name: '十方山水 SunSweetHouse',
    editorial: '隙頂觀雲海路段質感民宿，評論超過千則，山景壯觀、服務好評，適合喜歡大自然的旅客。',
    tags: ['山景', '隙頂', '雲海', '質感民宿'],
    badges: [],
    credibility: 4.662,
  },
  {
    category: '住宿', name: '阿里山民宿-山水清暉',
    editorial: '竹崎石棹地區阿里山質感民宿，評論逾千則，靜謐山居氛圍，觀雲賞霧首選。',
    tags: ['阿里山', '山景', '霧氣', '質感民宿', '竹崎'],
    badges: [],
    credibility: 4.6546,
  },
  {
    category: '住宿', name: '朵麗絲森林-包棟團體民宿（瑞里）',
    editorial: '瑞里雲霧帶特色森林包棟民宿，山林圍繞，適合家庭或好友包棟，評論量合理。',
    tags: ['包棟', '森林', '瑞里', '雲霧'],
    badges: [],
    credibility: 4.6316,
  },
  {
    category: '住宿', name: '山間茶墅民宿',
    editorial: '梅山茶鄉主題民宿，四周茶園環繞，早晨雲海壯觀，是體驗嘉義茶鄉生活的住宿首選。',
    tags: ['茶鄉', '梅山', '雲海', '山景', '主題民宿'],
    badges: [],
    credibility: 4.7056,
  },
  {
    category: '住宿', name: 'Astrea星晨堡民宿',
    editorial: '阿里山公路途中的觀星主題民宿，遠離光害、星空清晰，是天文愛好者與情侶旅遊首選。',
    tags: ['觀星', '阿里山', '主題民宿', '山景', '夜景'],
    badges: [],
    credibility: 4.7178,
  },
  {
    category: '住宿', name: '壹貳貳洋樓',
    editorial: '嘉義市區百年老洋樓改建，設計質感與歷史感並存，文青設計旅宿，評論量合理。',
    tags: ['老屋', '文青', '嘉義市區', '設計', '洋樓'],
    badges: [],
    credibility: 4.6778,
  },
  {
    category: '住宿', name: '翔鶴居',
    editorial: '嘉義市區質感旅宿，空間清爽舒適，地點便利，評分評論俱佳的市區住宿選擇。',
    tags: ['嘉義市區', '質感', '便利'],
    badges: [],
    credibility: 4.6173,
  },

  // === 親子 10 筆 ===
  {
    category: '親子', name: '萌寵村親子樂園',
    editorial: '嘉義中埔最熱門親子農場，可餵食觸摸各種動物，互動豐富。hits:3，評論量大，家庭旅遊首選。',
    tags: ['萌寵', '動物', '農場', '親子', '餵食體驗'],
    badges: [],
    credibility: 4.5797,
  },
  {
    category: '親子', name: '嘉大昆蟲館',
    editorial: '嘉義大學附設全台知名昆蟲館，收藏數萬件標本，hits:3，評論超多，親子自然教育必訪。',
    tags: ['昆蟲', '博物館', '親子', '教育', '免費'],
    badges: ['觀光署'],
    credibility: 4.396,
  },
  {
    category: '親子', name: '咩咩上樹萌寵樂園',
    editorial: '太保市大型萌寵主題樂園，羊駝、羊咩咩、水豚等動物可近距離互動，評論超多。',
    tags: ['萌寵', '羊駝', '動物', '親子', '太保'],
    badges: [],
    credibility: 4.4937,
  },
  {
    category: '親子', name: '林業試驗所嘉義樹木園',
    editorial: '嘉義百年樹木園，收集熱帶珍貴樹種，晨間散步清幽。hits:2，觀光署文化景點，適合生態教育。',
    tags: ['樹木園', '自然', '生態', '百年', '親子'],
    badges: ['觀光署'],
    credibility: 4.5659,
  },
  {
    category: '親子', name: '築夢森居探索生態農場',
    editorial: '中埔鄉森林探索農場，攀爬、射箭、生態觀察等戶外親子活動豐富，半日行程好選擇。',
    tags: ['探索', '生態', '農場', '親子', '戶外'],
    badges: [],
    credibility: 4.5588,
  },
  {
    category: '親子', name: '欣欣水泥森活園觀光工廠',
    editorial: '嘉義特色觀光工廠，水泥主題DIY體驗，親子一起動手做，寓教於樂，評論量多。',
    tags: ['觀光工廠', 'DIY', '親子', '體驗', '嘉義特色'],
    badges: [],
    credibility: 4.3821,
  },
  {
    category: '親子', name: '果然茶香觀光園區',
    editorial: '嘉義中埔茶文化觀光園區，可製茶體驗、品茗，附設餐廳。評論多，適合全家出遊。',
    tags: ['茶園', '製茶', '觀光', '親子', '嘉義縣'],
    badges: [],
    credibility: 4.3914,
  },
  {
    category: '親子', name: '八掌溪親水公園',
    editorial: '嘉義市的親水公園，夏日戲水天堂，河床寬闊、水淺安全，適合親子夏季半日遊。',
    tags: ['親水', '公園', '夏季', '戲水', '嘉義市'],
    badges: [],
    credibility: 4.3704,
  },
  {
    category: '親子', name: '兒童創意中心',
    editorial: '位於太保市故宮博物院旁的官方兒童館，互動展覽與創意工作坊，免費或低費，親子教育首選。',
    tags: ['兒童館', '官方', '免費', '親子', '太保'],
    badges: ['觀光署'],
    credibility: 4.4916,
  },
  {
    category: '親子', name: '獨角仙休閒農場',
    editorial: '中埔鄉昆蟲主題親子農場，獨角仙、鍬形蟲等昆蟲近距離觀察，評論超多，hits:2，嘉義縣知名農場。',
    tags: ['昆蟲', '農場', '親子', '中埔', '生態'],
    badges: [],
    credibility: 4.2978,
  },
]

// ── 查詢 place_id 並寫入 DB ────────────────────────────────────────────────
console.log(`開始 findplacefromtext（${FEATURED.length} 筆精選，並發 2）…`)

const lookups = await mapPool(FEATURED, async (item, i) => {
  const result = await findPlace(item.name)
  if ((i + 1) % 10 === 0) console.log(`  進度 ${i + 1}/${FEATURED.length}`)
  return { ...item, ...(result ?? {}) }
})

const db = new Client({ connectionString: DB })
await db.connect()

// 取得已存在的 place_id
const { rows: existing } = await db.query(
  `SELECT google_place_id FROM recommendations WHERE region = '嘉義'`
)
const existingIds = new Set(existing.map(r => r.google_place_id))
console.log(`\nDB 現有嘉義記錄：${existingIds.size} 筆`)

let inserted = 0
const skipped = []

for (const item of lookups) {
  if (!item.placeId) {
    skipped.push({ name: item.name, reason: '查無 place_id' })
    continue
  }
  if (existingIds.has(item.placeId)) {
    skipped.push({ name: item.name, reason: '已存在（重複 place_id）' })
    continue
  }

  await db.query(
    `INSERT INTO recommendations
       (region, category, name, google_place_id, lat, lng,
        editorial_reason, tags, source_badges, credibility,
        rating_snapshot, reviews_snapshot, photo_ref,
        status, tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published','featured')
     ON CONFLICT (region, google_place_id) DO NOTHING`,
    [
      '嘉義',
      item.category,
      item.name,
      item.placeId,
      item.lat,
      item.lng,
      item.editorial,
      item.tags,
      item.badges,
      item.credibility,
      item.rating ?? null,
      item.reviews ?? null,
      item.photoRef ?? null,
      // tags/badges 直接傳 JS array，pg 自動轉為 PostgreSQL array 格式
    ]
  )
  existingIds.add(item.placeId)
  inserted++
  console.log(`  ✅ ${item.category} | ${item.name}`)
}

await db.end()

console.log(`\n✅ 完成！插入 ${inserted} 筆 featured`)
if (skipped.length) {
  console.log(`\n⚠️  跳過 ${skipped.length} 筆：`)
  for (const s of skipped) console.log(`   - ${s.name}（${s.reason}）`)
}
