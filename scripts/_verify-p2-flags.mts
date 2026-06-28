// P2-S4 驗證：明確旗標 isCompositeTransport / hasNoPlace 的優先序與舊資料後備
// 跑法：npx tsx scripts/_verify-p2-flags.mts
import { isCompositeTransport, hasNoPlace } from '../lib/itinerary/activityFlags'

let pass = 0
let fail = 0
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log('✓', n) } else { fail++; console.error('✗ FAIL:', n) } }

// isCompositeTransport：明確欄位優先、舊資料退回關鍵字
ok('isComposite=true 明確採用', isCompositeTransport({ isComposite: true, title: '前往A' }) === true)
ok('isComposite=false 壓過關鍵字（不誤判）', isCompositeTransport({ isComposite: false, title: '還車與候船' }) === false)
ok('未標→標題關鍵字命中', isCompositeTransport({ title: '還車與南寮漁港候船' }) === true)
ok('未標→一般移動為 false', isCompositeTransport({ title: '前往富岡漁港' }) === false)

// hasNoPlace：明確 hasPlace 優先、舊資料退回 type==='rest'
ok('hasPlace=false→無地點', hasNoPlace({ hasPlace: false, type: 'sightseeing' }) === true)
ok('hasPlace=true 壓過 rest（娘家案例納入路線）', hasNoPlace({ hasPlace: true, type: 'rest' }) === false)
ok('未標 rest→無地點（保留舊防線）', hasNoPlace({ type: 'rest' }) === true)
ok('未標 sightseeing→有地點', hasNoPlace({ type: 'sightseeing' }) === false)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
