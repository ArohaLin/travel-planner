/** 活動語意旗標：用明確欄位取代「字串/type 猜測」。純模組，client 與 server 皆可 import。 */
import type { Activity } from '@/lib/types/itinerary'

/** 複合用途交通的標題關鍵字（未標 isComposite 的舊資料後備；單一定義，避免 DayView/reschedule 兩邊不同步）。 */
export const COMPOSITE_TRANSPORT_RE = /還車|取車|候船|候機|報到|託運|安檢|轉乘|等候|排隊|寄放|手續/

/** 交通卡是否複合用途（還車/候船/報到…，title 有獨立意義、不被改寫成「前往X」）：
 *  優先讀明確 isComposite，舊資料退回標題關鍵字。 */
export function isCompositeTransport(a: Pick<Activity, 'isComposite' | 'title'>): boolean {
  return a.isComposite ?? COMPOSITE_TRANSPORT_RE.test(a.title ?? '')
}

/** 活動是否「沒有實體地點」（純動作如 Check-in/盥洗/休息，不進路線、不 geocode）：
 *  優先讀明確 hasPlace；舊資料退回 type==='rest'（綠島同名誤抓的原始防線）。 */
export function hasNoPlace(a: Pick<Activity, 'hasPlace' | 'type'>): boolean {
  return a.hasPlace === false || (a.hasPlace == null && a.type === 'rest')
}

// ── 班次型交通（候車卡 + 班次交通卡系統）────────────────────────────────────

/** 班次型交通的標題關鍵字（有固定時刻表、需提前抵達：火車/高鐵/飛機/船/客運）。 */
const SCHEDULED_TRANSPORT_RE = /台鐵|普悠瑪|自強號|莒光號|太魯閣號|觀光列車|高鐵|飛機|航班|班機|渡輪|輪船|船班|客運|國光客運|統聯|葛瑪蘭|豐榮|阿羅哈/

/** 候車前置時間（分）。飛機 180 分，其餘班次 30 分。 */
export const BOARDING_LEAD_MINUTES = { flight: 180, default: 30 } as const

/** 依班次交通卡取得候車所需前置時間（分）。飛機 180 分，其餘 30 分。 */
export function getBoardingLeadMin(a: Pick<Activity, 'transportMode' | 'title'>): number {
  const mode = a.transportMode ?? ''
  if (mode === 'flight' || /飛機|航班|班機|飛航/.test(a.title ?? '')) return BOARDING_LEAD_MINUTES.flight
  return BOARDING_LEAD_MINUTES.default
}

/** 是否為班次型交通（有固定時刻表，需提前候車：火車/高鐵/飛機/船/客運）。
 *  transportMode flight/train/ferry 明確標示者優先；bus 看標題是否為班次型客運。
 *  用於手動新增時偵測是否要自動生成候車卡。 */
export function isScheduledTransport(a: Pick<Activity, 'type' | 'transportMode' | 'title'>): boolean {
  if (a.type !== 'transport') return false
  const mode = a.transportMode ?? ''
  if (['flight', 'train', 'ferry'].includes(mode)) return true
  if (mode === 'bus') return /客運|國光|統聯|葛瑪蘭|豐榮|阿羅哈/.test(a.title ?? '')
  return SCHEDULED_TRANSPORT_RE.test(a.title ?? '')
}
