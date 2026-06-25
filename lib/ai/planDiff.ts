import type { Itinerary, Money } from '@/lib/types/itinerary'
import type { PatchOp, AIPlanComparisonItem } from '@/lib/types/patch'

/**
 * 由「真實 patch ops × 目前行程」自動算出修改前後對照，覆蓋 AI 自填的 comparison。
 * 目的：方案的對照表一定列全、且與實際會套用的內容一致（不靠 AI 自己誠實列舉）。
 */

const RESV: Record<string, string> = { none: '無需預訂', needed: '需要預訂', reserved: '已預訂' }

function money(m?: Money): string {
  return m && m.amount != null ? `${m.currency} ${m.amount.toLocaleString('en-US')}` : '（無）'
}

function clip(s: string, n = 48): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(field: string, val: any): string {
  if (val == null || val === '') return '（無）'
  if (field === 'reservationStatus') return RESV[val] ?? String(val)
  if (field === 'breakfast') return val === 'included' ? '含早餐' : val === 'excluded' ? '不含早餐' : String(val)
  if (field === 'cost' || field === 'depositPaid') return money(val)
  if (field === 'location') return val.address ? clip(String(val.address)) : '（座標）'
  return clip(String(val))
}

// 住宿 / 活動的欄位中文標籤（顯示順序）
const ACC_LABELS: [string, string][] = [
  ['name', '名稱'], ['location', '地址'], ['roomType', '房型'], ['checkInTime', '入住'], ['checkOutTime', '退房'],
  ['reservationStatus', '預約狀態'], ['cost', '每晚金額'], ['breakfast', '早餐'], ['feeIncludes', '費用包含'], ['depositPaid', '訂金'],
  ['bookingPlatform', '訂房平台'], ['orderNumber', '訂單編號'], ['freeCancelBy', '免費取消'],
  ['contact', '聯絡資訊'], ['bookingUrl', '訂房連結'], ['intro', '說明'], ['tips', '重要事項'], ['notes', '備註'],
]
const ACT_LABELS: Record<string, string> = {
  title: '名稱', startTime: '開始', endTime: '結束', location: '地址', cost: '費用',
  reservationStatus: '預約狀態', bookingUrl: '預訂連結', intro: '介紹', transport: '交通',
  recommendation: '推薦', tips: '貼心提醒', highlight: '特別提醒', placeLabel: '地點',
  mealType: '餐別', foodItems: '飲食項目', notes: '備註', description: '說明',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function changed(a: any, b: any): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

export function computePlanComparison(itinerary: Itinerary, ops: PatchOp[]): AIPlanComparisonItem[] {
  const rows: AIPlanComparisonItem[] = []
  for (const op of ops) {
    if (op.op === 'set_day_accommodation') {
      const day = itinerary.days[op.dayIndex]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const before: any = day?.accommodation ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const after: any = op.payload ?? null
      const prefix = `第${op.dayIndex + 1}天住宿`
      if (!after) { rows.push({ item: prefix, before: before?.name ?? '（無）', after: '移除' }); continue }
      if (!before) { rows.push({ item: prefix, before: '（無）', after: after.name ?? '新增' }); continue }
      for (const [key, label] of ACC_LABELS) {
        const bv = key === 'location' ? before.location?.address : before[key]
        const av = key === 'location' ? after.location?.address : after[key]
        if (changed(bv, av)) rows.push({ item: `${prefix}・${label}`, before: fmt(key, before[key]), after: fmt(key, after[key]) })
      }
    } else if (op.op === 'update_activity') {
      const day = itinerary.days[op.dayIndex]
      const before = day?.activities.find((a) => a.id === op.activityId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = op.payload as Record<string, any>
      const title = before?.title ?? op.activityId
      for (const key of Object.keys(payload)) {
        if (key === 'id') continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bv = (before as any)?.[key]
        if (changed(bv, payload[key])) {
          const label = ACT_LABELS[key] ?? key
          rows.push({ item: `${clip(title, 12)}・${label}`, before: fmt(key, bv), after: fmt(key, payload[key]) })
        }
      }
    } else if (op.op === 'add_activity') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = op.payload as any
      rows.push({ item: `第${op.dayIndex + 1}天・新增`, before: '（無）', after: `${p.title ?? '活動'}${p.startTime ? ` ${p.startTime}` : ''}` })
    } else if (op.op === 'remove_activity') {
      const before = itinerary.days[op.dayIndex]?.activities.find((a) => a.id === op.activityId)
      rows.push({ item: `第${op.dayIndex + 1}天・移除`, before: before?.title ?? '活動', after: '（移除）' })
    } else if (op.op === 'update_day') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = op.payload as any
      if (p.theme !== undefined && changed(itinerary.days[op.dayIndex]?.theme, p.theme)) {
        rows.push({ item: `第${op.dayIndex + 1}天・簡介`, before: fmt('theme', itinerary.days[op.dayIndex]?.theme), after: fmt('theme', p.theme) })
      }
    }
  }
  return rows
}
