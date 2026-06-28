export type BookingType = 'lodging' | 'transport' | 'activity' | 'ticket' | 'restaurant' | 'other'
export type BookingStatus = 'needed' | 'reserved' | 'cancelled'

export interface BookingMoney {
  amount: number
  currency: string
  isEstimate: boolean
}

/** 獨立預約（standalone）：不與行程卡連結的預訂。連結後資料存活動/住宿卡，此表列即刪除。 */
export interface Booking {
  id: string
  itineraryId: string
  title: string
  type: BookingType
  status: BookingStatus
  date?: string        // 'YYYY-MM-DD'
  endDate?: string     // 住宿多晚 / 多日活動結束日
  time?: string        // 'HH:MM'
  cost?: BookingMoney
  depositPaid?: BookingMoney
  bookingPlatform?: string
  orderNumber?: string
  bookingUrl?: string
  freeCancelBy?: string
  contact?: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBooking(row: any): Booking {
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    title: row.title,
    type: row.type as BookingType,
    status: row.status as BookingStatus,
    date: row.date ?? undefined,
    endDate: row.end_date ?? undefined,
    time: row.time ?? undefined,
    cost: row.cost ?? undefined,
    depositPaid: row.deposit_paid ?? undefined,
    bookingPlatform: row.booking_platform ?? undefined,
    orderNumber: row.order_number ?? undefined,
    bookingUrl: row.booking_url ?? undefined,
    freeCancelBy: row.free_cancel_by ?? undefined,
    contact: row.contact ?? undefined,
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  lodging: '住宿',
  transport: '交通',
  activity: '活動',
  ticket: '票券',
  restaurant: '餐廳',
  other: '其他',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  needed: '需預訂',
  reserved: '已預訂',
  cancelled: '已取消',
}
