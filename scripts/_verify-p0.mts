// P0 驗證：estimateLeg 直線概估 ＋ patchApplier 主動失效 travelSig
// 跑法：npx tsx scripts/_verify-p0.mts（驗完即可刪）
import { applyPatch } from '../lib/ai/patchApplier'
import { estimateLeg } from '../lib/maps/estimateLeg'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log('✓', name) } else { fail++; console.error('✗ FAIL:', name) }
}

// ── estimateLeg ──────────────────────────────────────────────
const taipei = { lat: 25.0478, lng: 121.5319 }
const taichung = { lat: 24.1369, lng: 120.6869 }
const e1 = estimateLeg(taipei, taichung)
ok('estimateLeg 兩點 → 合理 km(100~200)/min', !!e1 && e1.km > 100 && e1.km < 200 && e1.min >= 5)
ok('estimateLeg null → null', estimateLeg(null, taichung) === null)
ok('estimateLeg {0,0} → null', estimateLeg({ lat: 0, lng: 0 }, taichung) === null)
ok('estimateLeg 極近 → 最少 5 分', (estimateLeg({ lat: 25.0478, lng: 121.5319 }, { lat: 25.0480, lng: 121.5321 })?.min ?? 0) >= 5)

// ── patchApplier 主動失效 ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (): any => ({
  id: 'x', version: 1,
  metadata: { title: 'T', destination: 'X', startDate: '2026-01-01', endDate: '2026-01-01', originCity: 'O' },
  days: [{
    dayIndex: 0, date: '2026-01-01', city: 'X',
    activities: [
      { id: 'a1', type: 'sightseeing', title: 'A', startTime: '09:00', bookingRequired: false, location: { lat: 1, lng: 1 } },
      { id: 'a2', type: 'sightseeing', title: 'B', startTime: '11:00', bookingRequired: false, location: { lat: 2, lng: 2 } },
    ],
    travelSig: 'oldsig', travelLegs: [],
  }],
  cityTransports: [],
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patch = (ops: any[]): any => ({ patchId: 'p', description: '', proposedBy: 'user', ops })
const sigAfter = (ops: unknown[]) => applyPatch(mk(), patch(ops as never)).days[0].travelSig

ok('remove_activity → 清 sig', sigAfter([{ op: 'remove_activity', dayIndex: 0, activityId: 'a2' }]) === undefined)
ok('add_activity → 清 sig', sigAfter([{ op: 'add_activity', dayIndex: 0, payload: { id: 'a3', type: 'food', title: 'C', startTime: '12:00', bookingRequired: false } }]) === undefined)
ok('reorder → 清 sig', sigAfter([{ op: 'reorder_activities', dayIndex: 0, orderedIds: ['a2', 'a1'] }]) === undefined)
ok('update_activity 改 startTime → 清 sig', sigAfter([{ op: 'update_activity', dayIndex: 0, activityId: 'a1', payload: { startTime: '08:00' } }]) === undefined)
ok('update_activity 改 location → 清 sig', sigAfter([{ op: 'update_activity', dayIndex: 0, activityId: 'a1', payload: { location: { lat: 5, lng: 5 } } }]) === undefined)
ok('update_activity 只改 cost → 不清（保留 oldsig）', sigAfter([{ op: 'update_activity', dayIndex: 0, activityId: 'a1', payload: { cost: { amount: 100, currency: 'TWD' } } }]) === 'oldsig')
ok('update_day(activities) → 清 sig', sigAfter([{ op: 'update_day', dayIndex: 0, payload: { activities: [{ id: 'a1', type: 'sightseeing', title: 'A', startTime: '09:00', bookingRequired: false }] } }]) === undefined)
ok('set_day_accommodation → 清 sig', sigAfter([{ op: 'set_day_accommodation', dayIndex: 0, payload: { name: 'H', checkInTime: '15:00', checkOutTime: '11:00', location: { lat: 3, lng: 3 } } }]) === undefined)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
