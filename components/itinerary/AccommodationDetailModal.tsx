'use client'

import type { Accommodation } from '@/lib/types/itinerary'
import { formatMoney } from '@/lib/utils/currency'
import { mapsNavUrl } from './ActivityCard'
import { RESERVATION } from '@/lib/itinerary/reservation'
import { effectiveLodgingReservation } from '@/lib/todo/deriveTodos'

interface AccommodationDetailModalProps {
  accommodation: Accommodation
  dayNumber: number
  onClose: () => void
  canEdit?: boolean
  onEdit?: (acc: Accommodation) => void
  onAddNote?: (acc: Accommodation) => void
  hasNote?: boolean
  /** 用資料（照片/網址/文字）更新住宿 → 開「AI 小幫手」並鎖定此住宿 */
  onAssistantUpdate?: (acc: Accommodation) => void
}

export function AccommodationDetailModal({ accommodation, dayNumber, onClose, canEdit, onEdit, onAddNote, hasNote, onAssistantUpdate }: AccommodationDetailModalProps) {
  const acc = accommodation
  const resv = effectiveLodgingReservation(acc.reservationStatus)
  const photoSrc = acc.userPhotoUrl ?? (acc.photoRef ? `/api/photo?ref=${encodeURIComponent(acc.photoRef)}` : null)
  const hasBookingInfo = acc.bookingPlatform || acc.orderNumber || acc.bookingUrl || acc.depositPaid || acc.freeCancelBy

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(94dvh - env(safe-area-inset-top))' }}
      >
        {/* Hero / handle */}
        {photoSrc ? (
          <div className="relative h-44 flex-shrink-0 rounded-t-3xl overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt={acc.name} className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 top-0 flex justify-center pt-3 pointer-events-none">
              <div className="w-10 h-1 bg-white/80 rounded-full shadow" />
            </div>
          </div>
        ) : (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 標題列 */}
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">🏨 第 {dayNumber} 天住宿</span>
              {resv !== 'none' && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${RESERVATION[resv].badge}`}>
                  {RESERVATION[resv].icon} {RESERVATION[resv].label}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{acc.name}</h2>
          </div>

          {/* 入住 / 退房 / 金額 */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>入住 <span className="font-medium text-gray-800">{acc.checkInTime}</span></span>
            <span>退房 <span className="font-medium text-gray-800">{acc.checkOutTime}</span></span>
            {acc.cost && <span className="ml-auto font-medium text-gray-800">{formatMoney(acc.cost)}/晚</span>}
          </div>

          {/* 房型 / 早餐 */}
          {(acc.roomType || acc.breakfast) && (
            <div className="flex items-center gap-2 flex-wrap">
              {acc.roomType && <span className="text-sm text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">🛏 {acc.roomType}</span>}
              {acc.breakfast && (
                <span className={`text-sm px-2.5 py-1 rounded-lg ${acc.breakfast === 'included' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {acc.breakfast === 'included' ? '🍳 含早餐' : '🍳 不含早餐'}
                </span>
              )}
            </div>
          )}

          {/* 地址 */}
          {acc.location?.address && (
            <a href={mapsNavUrl(acc.location)} target="_blank" rel="noopener noreferrer"
              className="block text-sm text-blue-600 underline decoration-blue-200 underline-offset-2 active:text-blue-700">
              📍 {acc.location.address}
            </a>
          )}

          {/* 訂房資訊 */}
          {hasBookingInfo && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-emerald-700 mb-1">訂房資訊</p>
              {acc.bookingPlatform && <Row label="訂房平台" value={acc.bookingPlatform} />}
              {acc.orderNumber && <Row label="訂單編號" value={acc.orderNumber} />}
              {acc.depositPaid && <Row label="訂金" value={formatMoney(acc.depositPaid)} />}
              {acc.freeCancelBy && <Row label="最晚免費取消" value={acc.freeCancelBy} />}
              {acc.bookingUrl && (
                <a href={acc.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-emerald-700 underline mt-0.5">
                  開啟訂房連結 ↗
                </a>
              )}
            </div>
          )}

          {/* 詳情段落 */}
          {acc.feeIncludes && <Section title="費用包含" text={acc.feeIncludes} />}
          {acc.intro && <Section title="說明" text={acc.intro} />}
          {acc.tips && <Section title="重要事項" text={acc.tips} accent />}
          {acc.contact && <Section title="聯絡資訊" text={acc.contact} />}
          {acc.notes && <Section title="備註" text={acc.notes} />}
        </div>

        {/* 用資料更新這筆住宿：開 AI 小幫手並鎖定 */}
        {canEdit && onAssistantUpdate && (
          <button
            onClick={() => { onAssistantUpdate(acc); onClose() }}
            className="flex-shrink-0 mx-5 mt-1 mb-1 flex items-center justify-center gap-1.5 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800 font-medium active:scale-[0.98] transition"
          >
            🤖 用照片／網址／文字更新這筆住宿
          </button>
        )}

        {/* Footer */}
        {canEdit && (onEdit || onAddNote) && (
          <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-white"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            {onAddNote && (
              <button onClick={() => { onAddNote(acc); onClose() }}
                className="relative flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5h8M8 14h5m-5 6.5l-3 1.5v-4.5A2.5 2.5 0 014.5 15h-.25A2.25 2.25 0 012 12.75v-6.5A2.25 2.25 0 014.25 4h15.5A2.25 2.25 0 0122 6.25v6.5A2.25 2.25 0 0119.75 15H11l-3 2.5z" />
                </svg>
                備註
                {hasNote && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />}
              </button>
            )}
            {onEdit && (
              <button onClick={() => { onEdit(acc); onClose() }}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 active:scale-[0.98] transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                編輯
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-500 flex-shrink-0 w-20">{label}</span>
      <span className="text-gray-800 break-all">{value}</span>
    </div>
  )
}

function Section({ title, text, accent }: { title: string; text: string; accent?: boolean }) {
  return (
    <div>
      <h3 className={`text-xs font-semibold mb-1 ${accent ? 'text-amber-600' : 'text-gray-500'}`}>{title}</h3>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}
