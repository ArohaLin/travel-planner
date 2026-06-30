'use client'

import { useEffect, useState } from 'react'
import type { Booking, BookingType, BookingStatus } from '@/lib/types/booking'
import { BOOKING_TYPE_LABELS, BOOKING_STATUS_LABELS } from '@/lib/types/booking'

// ─── 連結項目（活動/住宿卡）編輯用型別 ─────────────────────────────────────────

/** 從 UnifiedBooking 轉換給 modal 顯示用的唯讀資訊（不可編輯部分） */
export interface LinkedBookingData {
  source: 'activity' | 'lodging'
  title: string
  date?: string
  dayLabel?: string
  /** 活動 startTime / 住宿 checkInTime（顯示用，唯讀） */
  time?: string
  status: 'none' | 'needed' | 'reserved'
  cost?: { amount: number; currency: string; isEstimate: boolean }
  depositPaid?: { amount: number; currency: string; isEstimate: boolean }
  bookingPlatform?: string
  orderNumber?: string
  bookingReference?: string
  bookingUrl?: string
  freeCancelBy?: string
  contact?: string
  notes?: string
}

/** 預約管理就地編輯後回傳給 ItineraryClient 的更新內容 */
export interface LinkedBookingUpdate {
  title: string
  reservationStatus: 'none' | 'needed' | 'reserved'
  cost?: { amount: number; currency: string; isEstimate: boolean }
  depositPaid?: { amount: number; currency: string; isEstimate: boolean }
  bookingPlatform?: string
  orderNumber?: string
  bookingReference?: string
  bookingUrl?: string
  freeCancelBy?: string
  contact?: string
  notes?: string
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface BookingEditModalProps {
  open: boolean
  currency: string
  onClose: () => void
  // ── standalone 模式（獨立預約新增/編輯）──
  booking?: Booking | null   // null = 新增
  onSave?: (data: Partial<Booking>) => Promise<void>
  // ── linked 模式（活動/住宿卡就地編輯）──
  linked?: LinkedBookingData
  onSaveLinked?: (updates: LinkedBookingUpdate) => Promise<void>
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const TYPES = Object.keys(BOOKING_TYPE_LABELS) as BookingType[]
const STANDALONE_STATUSES = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]
const LINKED_STATUSES = [
  ['none', '無需預訂'],
  ['needed', '📅 需要預訂'],
  ['reserved', '✅ 已預訂'],
] as const

// ─── Component ──────────────────────────────────────────────────────────────

export function BookingEditModal({
  open, currency, onClose,
  booking, onSave,
  linked, onSaveLinked,
}: BookingEditModalProps) {
  const isLinked = !!linked
  const isNew = !booking && !linked

  // 共用欄位狀態
  const [title, setTitle] = useState('')
  const [type, setType] = useState<BookingType>('activity')
  const [status, setStatus] = useState<BookingStatus | 'none'>('needed')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [time, setTime] = useState('')
  const [costAmt, setCostAmt] = useState('')
  const [depositAmt, setDepositAmt] = useState('')
  const [platform, setPlatform] = useState('')
  const [orderNum, setOrderNum] = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [freeCancelBy, setFreeCancelBy] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (isLinked && linked) {
      setTitle(linked.title ?? '')
      setStatus(linked.status)
      setCostAmt(linked.cost?.amount != null ? String(linked.cost.amount) : '')
      setDepositAmt(linked.depositPaid?.amount != null ? String(linked.depositPaid.amount) : '')
      setPlatform(linked.bookingPlatform ?? '')
      setOrderNum(linked.orderNumber ?? '')
      setBookingRef(linked.bookingReference ?? '')
      setBookingUrl(linked.bookingUrl ?? '')
      setFreeCancelBy(linked.freeCancelBy ?? '')
      setContact(linked.contact ?? '')
      setNotes(linked.notes ?? '')
    } else {
      setTitle(booking?.title ?? '')
      setType(booking?.type ?? 'activity')
      setStatus(booking?.status ?? 'needed')
      setDate(booking?.date ?? '')
      setEndDate(booking?.endDate ?? '')
      setTime(booking?.time ?? '')
      setCostAmt(booking?.cost?.amount != null ? String(booking.cost.amount) : '')
      setDepositAmt(booking?.depositPaid?.amount != null ? String(booking.depositPaid.amount) : '')
      setPlatform(booking?.bookingPlatform ?? '')
      setOrderNum(booking?.orderNumber ?? '')
      setBookingRef(booking?.bookingReference ?? '')
      setBookingUrl(booking?.bookingUrl ?? '')
      setFreeCancelBy(booking?.freeCancelBy ?? '')
      setContact(booking?.contact ?? '')
      setNotes(booking?.notes ?? '')
    }
  }, [open, booking, linked, isLinked])

  if (!open) return null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      if (isLinked && onSaveLinked) {
        await onSaveLinked({
          title: title.trim(),
          reservationStatus: status as 'none' | 'needed' | 'reserved',
          cost: costAmt ? { amount: parseFloat(costAmt), currency, isEstimate: false } : undefined,
          depositPaid: depositAmt ? { amount: parseFloat(depositAmt), currency, isEstimate: false } : undefined,
          bookingPlatform: platform || undefined,
          orderNumber: orderNum || undefined,
          bookingReference: bookingRef || undefined,
          bookingUrl: bookingUrl || undefined,
          freeCancelBy: freeCancelBy || undefined,
          contact: contact || undefined,
          notes: notes || undefined,
        })
      } else if (onSave) {
        await onSave({
          title: title.trim(),
          type,
          status: status as BookingStatus,
          date: date || undefined,
          endDate: endDate || undefined,
          time: time || undefined,
          cost: costAmt ? { amount: parseFloat(costAmt), currency, isEstimate: false } : undefined,
          depositPaid: depositAmt ? { amount: parseFloat(depositAmt), currency, isEstimate: false } : undefined,
          bookingPlatform: platform || undefined,
          orderNumber: orderNum || undefined,
          bookingReference: bookingRef || undefined,
          bookingUrl: bookingUrl || undefined,
          freeCancelBy: freeCancelBy || undefined,
          contact: contact || undefined,
          notes: notes || undefined,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white'
  const labelCls = 'block text-xs text-gray-500 mb-1'
  const sourceLabel = linked?.source === 'lodging' ? '住宿' : '活動'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[220]" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[230] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {isLinked ? `編輯${sourceLabel}預約` : isNew ? '新增預約' : '編輯預約'}
            </h3>
            {isLinked && linked?.dayLabel && (
              <p className="text-xs text-gray-400 mt-0.5">{linked.dayLabel}</p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200">
            <XIcon />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">

          {/* ── Linked 模式：日期/時間唯讀提示 ─────────────────────────── */}
          {isLinked && (linked?.date || linked?.time) && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500">
              {linked.date && <span>📅 {linked.date.slice(5).replace('-', '/')}</span>}
              {linked.time && <span>🕐 {linked.time}</span>}
              <span className="ml-auto text-gray-400">⏱ 時間請至行程卡修改</span>
            </div>
          )}

          {/* 標題 */}
          <label>
            <span className={labelCls}>{isLinked ? (linked?.source === 'lodging' ? '住宿名稱' : '活動名稱') : '標題'} *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}
              placeholder={isLinked ? (linked?.source === 'lodging' ? '住宿名稱' : '活動名稱') : '如：野孩子衝浪社'} />
          </label>

          {/* Standalone 模式才有類型/日期/時間 */}
          {!isLinked && (
            <>
              {/* 類型 + 狀態 */}
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className={labelCls}>類型</span>
                  <select value={type} onChange={(e) => setType(e.target.value as BookingType)} className={inputCls}>
                    {TYPES.map((t) => <option key={t} value={t}>{BOOKING_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label>
                  <span className={labelCls}>狀態</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)} className={inputCls}>
                    {STANDALONE_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
                  </select>
                </label>
              </div>
              {/* 日期 */}
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className={labelCls}>日期</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </label>
                <label>
                  <span className={labelCls}>結束日（可選）</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={date} className={inputCls} />
                </label>
              </div>
              {/* 時間 */}
              <label>
                <span className={labelCls}>時間（可選）</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </label>
            </>
          )}

          {/* Linked 模式：預約狀態 3 態按鈕 */}
          {isLinked && (
            <div>
              <span className={labelCls}>預約狀態</span>
              <div className="grid grid-cols-3 gap-1.5">
                {LINKED_STATUSES.map(([v, lbl]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStatus(v)}
                    className={`py-2.5 text-sm rounded-xl border font-medium transition-colors ${
                      status === v
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 金額 */}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={labelCls}>{isLinked && linked?.source === 'lodging' ? '每晚金額' : '總金額'}（{currency}）</span>
              <input type="number" min="0" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} className={inputCls} placeholder="0" />
            </label>
            <label>
              <span className={labelCls}>訂金（{currency}）</span>
              <input type="number" min="0" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} className={inputCls} placeholder="0" />
            </label>
          </div>

          {/* 訂房資訊區 */}
          <div className="bg-gray-50 rounded-xl px-3 py-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500">訂房資訊</p>
            <label>
              <span className={labelCls}>訂房平台</span>
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls} placeholder="Booking.com / KKday / 高鐵官網…" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={labelCls}>訂單編號</span>
                <input value={orderNum} onChange={(e) => setOrderNum(e.target.value)} className={inputCls} placeholder="訂單/訂位號碼" />
              </label>
              <label>
                <span className={labelCls}>訂位代號</span>
                <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} className={inputCls} placeholder="確認碼/票券號" />
              </label>
            </div>
            <label>
              <span className={labelCls}>訂房連結</span>
              <input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} className={inputCls} placeholder="https://…" />
            </label>
            <label>
              <span className={labelCls}>最晚免費取消</span>
              <input value={freeCancelBy} onChange={(e) => setFreeCancelBy(e.target.value)} className={inputCls} placeholder="如：2026-08-01 23:59 前" />
            </label>
            <label>
              <span className={labelCls}>聯絡資訊</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} placeholder="電話 / Email" />
            </label>
          </div>

          <label>
            <span className={labelCls}>備註</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + ' resize-none'} placeholder="其他說明" />
          </label>
        </div>

        {/* Footer buttons */}
        <div className="px-4 pt-2 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 active:bg-gray-50">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-semibold active:bg-purple-600 disabled:opacity-40"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </>
  )
}
