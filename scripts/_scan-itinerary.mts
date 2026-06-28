// 行程健檢掃描（唯讀，不改任何資料）：列出疑似異常供人工確認
// 跑法：npx tsx scripts/_scan-itinerary.mts
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

type Loc = { lat?: number; lng?: number; address?: string } | null | undefined
type Act = {
  id: string; type: string; title: string; startTime?: string; endTime?: string
  location?: Loc; placeLabel?: string; toLabel?: string; fromLabel?: string
  hasPlace?: boolean; isComposite?: boolean; transportMode?: string; mealType?: string
  bookingRequired?: boolean; reservationStatus?: string
}
type Day = { dayIndex: number; date?: string; city?: string; activities: Act[]; accommodation?: { name?: string; location?: Loc; reservationStatus?: string } | null; travelLegs?: { toId?: string; seconds?: number; meters?: number }[]; travelSig?: string }
type Itin = { days: Day[]; metadata?: { originCity?: string; returnCity?: string; destination?: string } }

const hasNoPlace = (a: Act) => a.hasPlace === false || (a.hasPlace == null && a.type === 'rest')
const validCoord = (l: Loc) => !!l && typeof l.lat === 'number' && typeof l.lng === 'number' && isFinite(l.lat) && isFinite(l.lng) && !(l.lat === 0 && l.lng === 0)
const COMPOSITE_RE = /還車|取車|候船|候機|報到|託運|安檢|轉乘|等候|排隊|寄放|手續/
const isComposite = (a: Act) => a.isComposite ?? COMPOSITE_RE.test(a.title ?? '')
const toMin = (t?: string) => { if (!t) return null; const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null }
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL })
await client.connect()
const { rows } = await client.query('SELECT id, title, updated_at, data FROM itineraries ORDER BY updated_at DESC')
await client.end()

console.log(`共 ${rows.length} 份行程\n${'='.repeat(70)}`)

for (const row of rows) {
  const itin = row.data as Itin
  const findings: { sev: 'HIGH' | 'MED' | 'LOW' | 'INFO'; where: string; msg: string }[] = []
  const add = (sev: 'HIGH' | 'MED' | 'LOW' | 'INFO', where: string, msg: string) => findings.push({ sev, where, msg })
  const days = (itin.days ?? []).slice().sort((a, b) => a.dayIndex - b.dayIndex)

  days.forEach((day, di) => {
    const dn = `D${day.dayIndex + 1}${day.date ? `(${day.date})` : ''}`
    const acts = day.activities ?? []
    const isLast = di === days.length - 1

    // 夜晚無住宿
    if (!isLast && !day.accommodation) add('MED', dn, '非最後一天卻無住宿安排')
    if (day.accommodation && !validCoord(day.accommodation.location)) {
      const l = day.accommodation.location
      add(l && l.address ? 'LOW' : 'MED', dn, `住宿「${day.accommodation.name ?? '?'}」${l && l.address ? '座標待定位(有地址)' : '缺座標且缺地址'}`)
    }

    // 同天有效座標（給離群檢查）
    const coords = acts.filter((a) => validCoord(a.location)).map((a) => ({ a, lat: a.location!.lat!, lng: a.location!.lng! }))
    if (day.accommodation && validCoord(day.accommodation.location)) coords.push({ a: { id: 'acc', type: 'accommodation', title: day.accommodation.name ?? '住宿' }, lat: day.accommodation.location!.lat!, lng: day.accommodation.location!.lng! })

    let prevStart: number | null = null
    acts.forEach((a, i) => {
      const an = `${dn} #${i + 1} ${a.type} 「${a.title}」`
      // 缺座標/地址
      if (a.type !== 'transport' && !hasNoPlace(a) && !validCoord(a.location)) {
        const l = a.location
        if (l && l.lat === 0 && l.lng === 0 && l.address) add('LOW', an, '座標待定位(有地址，開地圖會補)')
        else add('HIGH', an, `應有地點卻${l?.address ? '座標無效' : '缺座標且缺地址'}`)
      }
      // 交通卡不該帶 location
      if (a.type === 'transport' && a.location) add('LOW', an, '交通卡帶了 location（交通卡不應有獨立路線點）')
      // 時間：end<start
      const s = toMin(a.startTime), e = toMin(a.endTime)
      if (s != null && e != null && e < s) add('HIGH', an, `結束時間 ${a.endTime} 早於開始 ${a.startTime}`)
      if (a.type !== 'transport' && s == null) add('MED', an, '缺開始時間')
      // 時序倒退
      if (s != null && prevStart != null && s < prevStart) add('MED', an, `開始時間 ${a.startTime} 早於前一張卡，時序倒退`)
      if (s != null) prevStart = s
      // toLabel 與下一站不符（殘留）
      if (a.type === 'transport' && !isComposite(a) && a.toLabel) {
        const next = acts.slice(i + 1).find((x) => x.type !== 'transport')
        const expect = (next?.placeLabel?.trim() || next?.title || '').trim()
        if (next && expect && a.toLabel.trim() !== expect) add('LOW', an, `toLabel「${a.toLabel}」≠ 下一站「${expect}」(殘留，顯示已即時讀故畫面無礙)`)
      }
      // 殘留 fromLabel（已刪欄位，舊資料殘存）
      if (a.fromLabel) add('INFO', an, `殘留 fromLabel「${a.fromLabel}」(欄位已廢，parse 會略)`)
      // 舊預約欄位
      if (a.bookingRequired !== undefined && a.reservationStatus === undefined) add('INFO', an, 'bookingRequired 舊欄位仍在、無 reservationStatus(後備讀正常，編輯時自動轉)')
    })

    // 離群座標（同天距其它點 > 60km，疑似同名誤抓/離島）
    if (coords.length >= 2) {
      for (const c of coords) {
        let minD = Infinity
        for (const o of coords) if (o !== c) minD = Math.min(minD, haversineKm(c, o))
        if (minD > 60) add('MED', `${dn} 「${c.a.title}」`, `座標離同天其它點最近 ${minD.toFixed(0)}km，疑似誤抓/離島(${c.lat.toFixed(3)},${c.lng.toFixed(3)})`)
      }
    }
    // 台灣範圍外
    coords.forEach((c) => {
      if (c.lat < 21.5 || c.lat > 25.5 || c.lng < 119.3 || c.lng > 122.3) add('HIGH', `${dn} 「${c.a.title}」`, `座標在台灣範圍外 (${c.lat.toFixed(3)},${c.lng.toFixed(3)})`)
    })

    // travelLegs 孤兒（toId 不在當天活動，且非 accommodation/return）
    const ids = new Set(acts.map((a) => a.id))
    for (const leg of day.travelLegs ?? []) {
      if (leg.toId && !ids.has(leg.toId) && !['accommodation', 'return', 'origin'].includes(leg.toId)) {
        add('MED', dn, `travelLegs 有孤兒路段 toId=${leg.toId}（指向已不存在的卡，序列已變→應重算）`)
      }
    }
  })

  // 輸出
  const order = { HIGH: 0, MED: 1, LOW: 2, INFO: 3 }
  findings.sort((a, b) => order[a.sev] - order[b.sev])
  const counts = findings.reduce((m, f) => { m[f.sev] = (m[f.sev] ?? 0) + 1; return m }, {} as Record<string, number>)
  console.log(`\n■ ${row.title}  [${row.id.slice(0, 8)}]  ${days.length} 天  更新:${new Date(row.updated_at).toLocaleDateString()}`)
  console.log(`  發現：HIGH ${counts.HIGH ?? 0} / MED ${counts.MED ?? 0} / LOW ${counts.LOW ?? 0} / INFO ${counts.INFO ?? 0}`)
  if (findings.length === 0) { console.log('  ✅ 無異常'); continue }
  for (const f of findings) console.log(`  [${f.sev}] ${f.where}\n        → ${f.msg}`)
}
