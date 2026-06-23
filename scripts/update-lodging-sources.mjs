/**
 * 把 8 間單來源住宿的「多來源佐證」（子代理逐篇 WebFetch 查證）合併進 DB features.facts.sources。
 * 按事實編號對應；exact + 去尾斜線去重。執行：node scripts/update-lodging-sources.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// placeId → { 事實編號: [佐證URL] }（子代理查證結果）
const ADD = {
  // 台東自由風民宿
  'ChIJwyl1-j65bzQR8Iz50go4j0E': {
    0: ['http://www.freewind.idv.tw/room.html', 'https://exhibition.efroip.tw/ischool/publish_page/2335/', 'http://freewind.idv.tw/'],
    1: ['https://hotel.settour.com.tw/product/HDP0000025915', 'https://tw.hotels.com/ho956343360/zi-you-feng-min-su-tai-dong-shi-tai-wan/'],
    2: ['http://www.freewind.idv.tw/room_view.html?room=58', 'https://exhibition.efroip.tw/ischool/publish_page/2335/', 'https://www.yoyotaitung.com.tw/2020_shop_78.html'],
    3: ['http://freewind.idv.tw/booking.html', 'https://exhibition.efroip.tw/ischool/publish_page/2335/', 'https://www.yoyotaitung.com.tw/2020_shop_78.html'],
    4: ['http://freewind.idv.tw/booking.html', 'https://hotel.eztravel.com.tw/detail-taitung-3848-19832440/free-wind-bb/'],
    5: ['https://hotel.settour.com.tw/product/HDP0000025915'],
  },
  // 星浪.恩典屋
  'ChIJjaqzAjGjbzQR5TwLybIe2co': {
    0: ['https://okgo.tw/mobile/innview/7526', 'https://thetreasurebay.okgo.tw/', 'https://thetreasurebay.okgo.tw/room.html'],
    1: ['https://okgo.tw/mobile/innview/7526'],
    2: ['https://okgo.tw/mobile/innview/7526'],
    3: ['https://thetreasurebay.okgo.tw/'],
  },
  // 尚佐安森
  'ChIJI7GqSyO5bzQR03CUyMZPkjw': {
    0: ['https://3jiudian.com/item/shang-zuo-an-sen/'],
    1: ['https://sg.trip.com/hotels/taitung-hotel-detail-81188901/chanthy-and-anson/', 'https://shang-zuo-an-sen.pointmotel.tw/'],
    2: ['https://hotel.eztravel.com.tw/detail-taitung-3848-81188901/chanthyanson/', 'https://sg.trip.com/hotels/taitung-hotel-detail-81188901/chanthy-and-anson/', 'https://3jiudian.com/item/shang-zuo-an-sen/'],
    4: ['https://hotel.eztravel.com.tw/detail-taitung-3848-81188901/chanthyanson/', 'https://sg.trip.com/hotels/taitung-hotel-detail-81188901/chanthy-and-anson/', 'https://3jiudian.com/item/shang-zuo-an-sen/'],
  },
  // 台東沐泉（子代理查無新獨立來源 → 不變）
  'ChIJPYqd1ji5bzQR2N_Iysi-PhI': {},
  // 南八里（已濾掉同篇 mobile 變體 /posts/12204714427）
  'ChIJAQAAABSibzQR4Dqi-WM1gfE': {
    1: ['https://rocky.tw/nanbali/', 'https://l50740.pixnet.net/blog/post/40982549', 'https://nanbali.tdbnb.net/'],
    3: ['https://www.walkerland.com.tw/article/view/119070'],
    4: ['https://rocky.tw/nanbali/', 'https://l50740.pixnet.net/blog/post/40982549', 'https://nanbali.tdbnb.net/', 'https://media.taiwan.net.tw/en-us/portal/travel/details/hotel_a15010000h_015392'],
  },
  // 椰子海岸
  'ChIJTxLNyrC8bzQR1zuNLrjnjGE': {
    0: ['https://amber1201.pixnet.net/blog/posts/11379949557', 'https://lee120510.pixnet.net/blog/posts/9448715756', 'https://www.tripbaa.com/hotel/H20230822143016AYT30/', 'https://tw.trip.com/hotels/taitung-hotel-detail-19831322/coconut-beach-homestay/'],
    1: ['https://amber1201.pixnet.net/blog/posts/11379949557', 'https://lee120510.pixnet.net/blog/posts/9448715756', 'https://traiwan.com/hotel/place-1efdd17c0d48de5.html'],
    2: ['https://amber1201.pixnet.net/blog/posts/11379949557', 'https://lee120510.pixnet.net/blog/posts/9448715756'],
    3: ['https://amber1201.pixnet.net/blog/posts/11379949557', 'https://lee120510.pixnet.net/blog/posts/9448715756', 'https://traiwan.com/hotel/place-1efdd17c0d48de5.html', 'https://hotel.settour.com.tw/product/HDP0000022224'],
    4: ['https://amber1201.pixnet.net/blog/posts/11379949557', 'https://lee120510.pixnet.net/blog/posts/9448715756', 'https://www.tripbaa.com/hotel/H20230822143016AYT30/', 'https://www.taiwanstay.net.tw/TSA/web_page/TSA020200.jsp?hohi_id=5918'],
  },
  // 奧麗雅安莊園
  'ChIJs_BpqIx1bzQRxn2ElcrSBgo': {
    0: ['https://www.chateaudolea.com/rooms'],
    1: ['https://www.chateaudolea.com/rooms'],
    2: ['https://www.chateaudolea.com/olea', 'https://www.taiwanfarm.org.tw/zh-TW/Front/Farm/Detail/460'],
    3: ['https://www.chateaudolea.com/olea'],
    5: ['https://www.taiwanfarm.org.tw/zh-TW/Front/Farm/Detail/460'],
    6: ['https://www.taiwanfarm.org.tw/zh-TW/Front/Farm/Detail/460'],
  },
  // 海景擁月星宿
  'ChIJA_bDryR0bzQRU994cIAvOPo': {
    0: ['https://annyliu916.pixnet.net/blog/post/187923513', 'https://www.jacreative.com.tw/TravelinChenggong/category_edit.php?id=23&type=4', 'https://www.fujangvilla.com.tw/%E5%AE%BF/%E6%B5%B7%E6%99%AF%E6%88%BF'],
    1: ['https://hk.trip.com/moments/detail/taitung-760-130803122/', 'https://www.jacreative.com.tw/TravelinChenggong/category_edit.php?id=23&type=4'],
    2: ['https://hk.trip.com/moments/detail/taitung-760-130803122/'],
    3: ['https://hk.trip.com/moments/detail/taitung-760-130803122/', 'https://www.fujangvilla.com.tw/%E5%AE%BF/%E6%B5%B7%E6%99%AF%E6%88%BF'],
    4: ['https://www.jacreative.com.tw/TravelinChenggong/category_edit.php?id=23&type=4'],
  },
}

const norm = (u) => u.replace(/\/+$/, '').toLowerCase()
let totalAdded = 0
for (const [id, map] of Object.entries(ADD)) {
  const { data } = await db.from('lodging_research').select('name,features').eq('google_place_id', id).single()
  const features = data.features || {}
  const facts = Array.isArray(features.facts) ? features.facts : []
  let added = 0
  for (const [idx, urls] of Object.entries(map)) {
    const f = facts[+idx]
    if (!f) continue
    const have = new Set((f.sources || []).map(norm))
    const merged = [...(f.sources || [])]
    for (const u of urls) { if (!have.has(norm(u))) { merged.push(u); have.add(norm(u)); added++ } }
    f.sources = merged
  }
  features.facts = facts
  const multi = facts.filter((f) => (f.sources || []).length > 1).length
  const { error } = await db.from('lodging_research').update({ features }).eq('google_place_id', id)
  console.log(error ? `❌ ${data.name.slice(0, 16)} ${error.message}` : `✓ ${data.name.slice(0, 18)}：新增 ${added} 來源｜多來源事實 ${multi}/${facts.length}`)
  totalAdded += added
}
console.log(`\n完成：8 間共新增 ${totalAdded} 個佐證來源`)
