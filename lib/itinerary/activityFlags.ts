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
