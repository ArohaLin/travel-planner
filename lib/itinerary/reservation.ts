/** 預約狀態設定（卡片符號／圖例／編輯共用）。純模組，client 與 server 皆可 import。 */
import type { Activity } from '@/lib/types/itinerary'

export type ReservationStatus = 'none' | 'needed' | 'reserved'

// needed=需要預訂（📅 琥珀）／reserved=已經預訂（✅ 綠）；none 不顯示符號
export const RESERVATION: Record<'needed' | 'reserved', { icon: string; label: string; badge: string }> = {
  needed: { icon: '📅', label: '需預訂', badge: 'bg-amber-100 ring-2 ring-amber-300' },
  reserved: { icon: '✅', label: '已預訂', badge: 'bg-emerald-100 ring-2 ring-emerald-300' },
}

/** 取卡片實際預約狀態：優先用 reservationStatus；舊資料退回 bookingRequired（true→needed）。 */
export function effectiveReservation(a: Pick<Activity, 'reservationStatus' | 'bookingRequired'>): ReservationStatus {
  return a.reservationStatus ?? (a.bookingRequired ? 'needed' : 'none')
}
