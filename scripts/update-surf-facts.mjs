/**
 * 依「真實評論交叉核對」補強 DB features.facts（只補真實評論佐證的事實）。執行：node scripts/update-surf-facts.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ADD = {
  // 都歷海洋教室：真實評論揭露一對一價格
  'ChIJe_vdLcZ1bzQRtL-DHmngLrE': [{ text: '真實評論提及：兩小時一對一課程約 NT$2,500（約 2024 前後），有顧客覺得高於都蘭一帶行情；多人團體較省', sources: [] }],
  // 貝貝浪人：真實評論證實租板價＋餐飲
  'ChIJIfDmk62fbzQRODOXzMZEIUk': [{ text: '真實評論證實：衝浪板租借每天約 NT$500；店內另有墨西哥捲餅、精釀生啤等餐飲，衝完浪可用餐', sources: [] }],
  // 野孩子：餐食/廚藝高人氣（19 則提及）
  'ChIJr18DgbOfbzQRFrG-FhxBik4': [{ text: '真實評論高頻亮點：老闆娘餐食／廚藝廣受好評（多則提及晚餐、咖哩好吃），衝浪＋住宿＋吃一站滿足', sources: [] }],
  // 狂衝浪：誠實標註 ISA／不會游泳為官方說法
  'ChIJeUOulq6fbzQRkQZWUUVHmjc': [{ text: '備註：ISA 認證與「不會游泳也能玩」為官網與部落客資料（135 則顧客評論未特別提及，但評論普遍稱「沒基礎也能學會、教練有耐心」）', sources: [] }],
}

for (const [id, newFacts] of Object.entries(ADD)) {
  const { data } = await db.from('lodging_research').select('name,features').eq('google_place_id', id).single()
  const features = data.features || {}
  const facts = Array.isArray(features.facts) ? features.facts : []
  const existing = new Set(facts.map((f) => f.text.slice(0, 12)))
  const toAdd = newFacts.filter((f) => !existing.has(f.text.slice(0, 12)))
  if (!toAdd.length) { console.log(`= ${data.name} 已有，略過`); continue }
  features.facts = [...facts, ...toAdd]
  const { error } = await db.from('lodging_research').update({ features }).eq('google_place_id', id)
  console.log(error ? `❌ ${data.name} ${error.message}` : `✓ ${data.name} 補 ${toAdd.length} 條（共 ${features.facts.length}）`)
}
