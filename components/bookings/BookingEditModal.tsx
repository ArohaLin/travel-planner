'use client'

import { useEffect, useState } from 'react'
import type { Booking, BookingType, BookingStatus } from '@/lib/types/booking'
import { BOOKING_TYPE_LABELS, BOOKING_STATUS_LABELS } from '@/lib/types/booking'

interface BookingEditModalProps {
  open: boolean
  booking: Booking | null   // null = 新增
  currency: string
  onClose: () => void
  onSave: (data: Partial<Booking>) => Promise<void>
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const TYPES = Object.keys(BOOKING_TYPE_LABELS) as BookingType[]
const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]

export function BookingEditModal({ open, booking, currency, onClose, onSave }: BookingEditModalProps) {
  const isNew = !booking

  const [title, setTitle] = useState('')
  const [type, setType] = useState<BookingType>('activity')
  const [status, setStatus] = useState<BookingStatus>('needed')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [time, setTime] = useState('')
  const [costAmt, setCostAmt] = useState('')
  const [depositAmt, setDepositAmt] = useState('')
  const [platform, setPlatform] = useState('')
  const [orderNum, setOrderNum] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [freeCancelBy, setFreeCancelBy] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(booking?.title ?? '')
    setType(booking?.type ?? 'activity')
    setStatus(booking?.status ?? 'needed')
    setDate(booking?.date ?? '')
    setEndDate(booking?.endDate ?? '')
    setTime(booking?.time ?? '')
    setCostAmt(booking?.cost?.amount ? String(booking.cost.amount) : '')
    setDepositAmt(booking?.depositPaid?.amount ? String(booking.depositPaid.amount) : '')
    setPlatform(booking?.bookingPlatform ?? '')
    setOrderNum(booking?.orderNumber ?? '')
    setBookingUrl(booking?.bookingUrl ?? '')
    setFreeCancelBy(booking?.freeCancelBy ?? '')
    setContact(booking?.contact ?? '')
    setNotes(booking?.notes ?? '')
  }, [open, booking])

  if (!open) return null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        type,
        status,
        date: date || undefined,
        endDate: endDate || undefined,
        time: time || undefined,
        cost: costAmt ? { amount: parseFloat(costAmt), currency, isEstimate: false } : undefined,
        depositPaid: depositAmt ? { amount: parseFloat(depositAmt), currency, isEstimate: false } : undefined,
        bookingPlatform: platform || undefined,
        orderNumber: orderNum || undefined,
        bookingUrl: bookingUrl || undefined,
        freeCancelBy: freeCancelBy || undefined,
        contact: contact || undefined,
        notes: notes || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[220]" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[230] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[90dvh]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{isNew ? '新增預約' : '編輯預約'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200">
            <XIcon />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {/* 標題 */}
          <label>
            <span className={labelCls}>標題 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="如：野孩子衝浪社、南迴段火車" />
          </label>

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
                {STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
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

          {/* 金額 */}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={labelCls}>總金額（{currency}）</span>
              <input type="number" min="0" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} className={inputCls} placeholder="0" />
            </label>
            <label>
              <span className={labelCls}>已付訂金（{currency}）</span>
              <input type="number" min="0" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} className={inputCls} placeholder="0" />
            </label>
          </div>

          {/* 訂房資訊 */}
          <label>
            <span className={labelCls}>訂房平台</span>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls} placeholder="Booking.com / KKday / 官網…" />
          </label>
          <label>
            <span className={labelCls}>訂單編號</span>
            <input value={orderNum} onChange={(e) => setOrderNum(e.target.value)} className={inputCls} placeholder="訂單/訂位號碼" />
          </label>
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
          <label>
            <span className={labelCls}>備註</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + ' resize-none'} placeholder="其他說明" />
          </label>
        </div>

        {/* Footer buttons */}
        <div className="px-4 pt-2 flex gap-2">
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
