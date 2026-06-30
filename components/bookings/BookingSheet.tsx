'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import type { Itinerary } from '@/lib/types/itinerary'
import type { Booking, BookingType, BookingStatus } from '@/lib/types/booking'
import { BOOKING_TYPE_LABELS, BOOKING_STATUS_LABELS } from '@/lib/types/booking'
import { BookingEditModal, type LinkedBookingData, type LinkedBookingUpdate } from './BookingEditModal'
import { LinkPickerModal } from './LinkPickerModal'

// ─── 彙整後的統一預約列表項目 ───────────────────────────────────────────────
export type UnifiedBooking = {
  id: string
  source: 'activity' | 'lodging' | 'standalone'
  type: BookingType
  status: BookingStatus | 'none'
  title: string
  date?: string            // 'YYYY-MM-DD'
  endDate?: string
  dayLabel?: string        // '第 1 天'
  time?: string
  cost?: { amount: number; currency: string; isEstimate: boolean }
  depositPaid?: { amount: number; currency: string; isEstimate: boolean }
  bookingPlatform?: string
  orderNumber?: string
  bookingReference?: string
  bookingUrl?: string
  freeCancelBy?: string
  contact?: string
  notes?: string
  // for link/unlink
  rawId?: string           // original activity.id or acc.id
  dayIndex?: number        // index in itinerary.days
  // standalone only
  standaloneId?: string
}

// ─── 從行程資料萃取需要預訂的項目 ──────────────────────────────────────────
function extractFromItinerary(itinerary: Itinerary): UnifiedBooking[] {
  const result: UnifiedBooking[] = []

  itinerary.days.forEach((day, di) => {
    const dayLabel = `第 ${di + 1} 天`

    // 需預訂活動
    day.activities.forEach((act) => {
      const eff = act.reservationStatus ?? (act.bookingRequired ? 'needed' : 'none')
      if (eff === 'none') return
      result.push({
        id: `act-${act.id}`,
        rawId: act.id,
        dayIndex: di,
        source: 'activity',
        type: actTypeToBookingType(act.type),
        status: eff as BookingStatus,
        title: act.title,
        date: day.date,
        dayLabel,
        time: act.startTime,
        cost: act.cost,
        bookingPlatform: act.bookingPlatform,
        orderNumber: act.orderNumber,
        bookingReference: act.bookingReference,
        depositPaid: act.depositPaid,
        freeCancelBy: act.freeCancelBy,
        contact: act.contact,
        bookingUrl: act.bookingUrl,
        notes: act.notes,
      })
    })

    // 住宿（多晚：同 id 只顯示一次，取最長連續段）
    const acc = day.accommodation
    if (acc) {
      const eff = acc.reservationStatus ?? 'needed'
      if (eff !== 'none') {
        const existing = result.find((r) => r.id === `acc-${acc.id}`)
        if (existing) {
          existing.endDate = day.date
        } else {
          result.push({
            id: `acc-${acc.id}`,
            rawId: acc.id,
            dayIndex: di,
            source: 'lodging',
            type: 'lodging',
            status: eff as BookingStatus,
            title: acc.name,
            date: day.date,
            dayLabel,
            time: acc.checkInTime,
            cost: acc.cost,
            bookingPlatform: acc.bookingPlatform,
            orderNumber: acc.orderNumber,
            bookingReference: acc.bookingReference,
            depositPaid: acc.depositPaid,
            freeCancelBy: acc.freeCancelBy,
            contact: acc.contact,
            bookingUrl: acc.bookingUrl,
            notes: acc.notes,
          })
        }
      }
    }
  })

  return result
}

function actTypeToBookingType(t: string): BookingType {
  if (t === 'transport') return 'transport'
  if (t === 'food') return 'restaurant'
  if (t === 'shopping') return 'ticket'
  return 'activity'
}

// ─── 小工具 ────────────────────────────────────────────────────────────────
function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.101-1.102" />
    </svg>
  )
}

function fmtDateRange(date?: string, endDate?: string) {
  if (!date) return ''
  if (!endDate || endDate === date) return date.slice(5).replace('-', '/')
  return `${date.slice(5).replace('-', '/')} – ${endDate.slice(5).replace('-', '/')}`
}

// ─── 狀態色彩 ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  needed: 'bg-red-100 text-red-700',
  reserved: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  none: 'bg-gray-100 text-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  ...BOOKING_STATUS_LABELS,
  none: '無需預訂',
}

const SOURCE_BADGE: Record<UnifiedBooking['source'], string> = {
  activity: 'bg-blue-50 text-blue-600',
  lodging: 'bg-purple-50 text-purple-600',
  standalone: 'bg-amber-50 text-amber-700',
}
const SOURCE_LABEL: Record<UnifiedBooking['source'], string> = {
  activity: '活動',
  lodging: '住宿',
  standalone: '獨立',
}

function fmtMoney(m?: { amount: number; currency: string; isEstimate?: boolean }) {
  if (!m || !m.amount) return null
  return `${m.isEstimate ? '約 ' : ''}${m.currency} ${m.amount.toLocaleString()}`
}

// ─── 單筆預約卡片 ────────────────────────────────────────────────────────────
function BookingCard({
  b, currency, canEdit,
  onClick, onDelete, onLink, onUnlink,
}: {
  b: UnifiedBooking
  currency: string
  canEdit: boolean
  onClick?: () => void
  onDelete?: () => void
  onLink?: () => void
  onUnlink?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [unlinkConfirm, setUnlinkConfirm] = useState(false)
  const isStandalone = b.source === 'standalone'
  const hasBookingData = !!(b.bookingPlatform || b.orderNumber || b.bookingReference || b.bookingUrl || b.freeCancelBy)

  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-2',
        canEdit && onClick ? 'active:bg-gray-50 cursor-pointer' : '',
      )}
      onClick={canEdit && onClick ? onClick : undefined}
    >
      {/* Top row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', SOURCE_BADGE[b.source])}>
              {SOURCE_LABEL[b.source]}
            </span>
            <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', STATUS_STYLE[b.status] ?? STATUS_STYLE.none)}>
              {STATUS_LABEL[b.status] ?? b.status}
            </span>
            <span className="text-xs text-gray-400">{BOOKING_TYPE_LABELS[b.type]}</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
        </div>
        {/* 可編輯時顯示箭頭提示（整卡可點）*/}
        {canEdit && onClick && (
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        {(b.date || b.endDate) && (
          <span>📅 {fmtDateRange(b.date, b.endDate)}{b.dayLabel ? ` · ${b.dayLabel}` : ''}</span>
        )}
        {b.time && <span>🕐 {b.time}</span>}
      </div>

      {/* Booking details */}
      {(b.bookingPlatform || b.orderNumber || b.bookingReference || b.freeCancelBy) && (
        <div className="flex flex-col gap-0.5 text-xs text-gray-500 border-t border-gray-50 pt-1.5 mt-0.5">
          {b.bookingPlatform && <span>🏷️ {b.bookingPlatform}</span>}
          {b.orderNumber && <span className="truncate">📋 {b.orderNumber}</span>}
          {b.bookingReference && <span className="truncate">🎫 {b.bookingReference}</span>}
          {b.freeCancelBy && (
            <span className={clsx(isFreeCancelSoon(b.freeCancelBy) ? 'text-red-500 font-medium' : '')}>
              ⏰ 免費取消：{b.freeCancelBy}
            </span>
          )}
        </div>
      )}

      {/* Cost row */}
      {(b.cost || b.depositPaid) && (
        <div className="flex gap-3 text-xs pt-0.5">
          {b.cost && <span className="text-gray-600">總價 <strong className="text-gray-900">{fmtMoney(b.cost) ?? '—'}</strong></span>}
          {b.depositPaid && <span className="text-gray-500">訂金 {fmtMoney(b.depositPaid)}</span>}
        </div>
      )}

      {/* Quick actions — stopPropagation 防止整卡 onClick 觸發 */}
      <div className="flex gap-2 mt-0.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {b.bookingUrl && (
          <a
            href={b.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg active:bg-blue-100"
          >
            <LinkIcon />開連結
          </a>
        )}
        {b.orderNumber && (
          <button
            className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg active:bg-gray-200"
            onClick={() => navigator.clipboard?.writeText(b.orderNumber!)}
          >
            📋 複製訂單號
          </button>
        )}
        {b.bookingReference && (
          <button
            className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg active:bg-purple-100"
            onClick={() => navigator.clipboard?.writeText(b.bookingReference!)}
          >
            🎫 複製代號
          </button>
        )}
        {canEdit && isStandalone && onLink && (
          <button
            className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg active:bg-purple-100"
            onClick={onLink}
          >
            🔗 連結到景點
          </button>
        )}
        {canEdit && !isStandalone && hasBookingData && onUnlink && (
          unlinkConfirm ? (
            <div className="flex gap-1 ml-auto">
              <button
                className="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-200 active:bg-gray-50"
                onClick={() => setUnlinkConfirm(false)}
              >取消</button>
              <button
                className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-lg active:bg-red-100 disabled:opacity-40"
                disabled={busy}
                onClick={async () => { setBusy(true); await onUnlink(); setBusy(false); setUnlinkConfirm(false) }}
              >{busy ? '處理中…' : '確認抽出'}</button>
            </div>
          ) : (
            <button
              className="ml-auto text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg active:bg-gray-200"
              onClick={() => setUnlinkConfirm(true)}
            >✂️ 抽出獨立</button>
          )
        )}
        {canEdit && isStandalone && onDelete && (
          <button
            className={`${onLink ? '' : 'ml-auto '}text-xs text-red-400 bg-red-50 px-2.5 py-1 rounded-lg active:bg-red-100 disabled:opacity-40`}
            disabled={busy}
            onClick={async () => { setBusy(true); await onDelete(); setBusy(false) }}
          >
            刪除
          </button>
        )}
      </div>
    </div>
  )
}

function isFreeCancelSoon(s: string): boolean {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return false
  const deadline = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (deadline.getTime() - today.getTime()) / 86400000
  return diff >= 0 && diff <= 3
}

// ─── 摘要列 ────────────────────────────────────────────────────────────────
function SummaryBar({
  items, allItems, currency, filterStatus, onToggleStatus,
}: {
  items: UnifiedBooking[]
  allItems: UnifiedBooking[]
  currency: string
  filterStatus: BookingStatus | 'all'
  onToggleStatus: (s: BookingStatus) => void
}) {
  const needed = allItems.filter((b) => b.status === 'needed').length
  const reserved = allItems.filter((b) => b.status === 'reserved').length
  const total = items.reduce((s, b) => s + (b.cost?.amount ?? 0), 0)
  const paid = items.reduce((s, b) => s + (b.depositPaid?.amount ?? 0), 0)
  const unpaid = total - paid

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 text-xs bg-gray-50 border-b border-gray-100" style={{ scrollbarWidth: 'none' }}>
      {needed > 0 && (
        <button
          onClick={() => onToggleStatus('needed')}
          className={clsx(
            'flex-shrink-0 flex items-center gap-1 font-medium px-2 py-1 rounded-lg transition-colors active:opacity-80',
            filterStatus === 'needed'
              ? 'bg-red-500 text-white ring-2 ring-red-300'
              : 'text-red-600 bg-red-50',
          )}
        >
          ⚠️ 待預訂 {needed}
        </button>
      )}
      <button
        onClick={() => onToggleStatus('reserved')}
        className={clsx(
          'flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg transition-colors active:opacity-80',
          filterStatus === 'reserved'
            ? 'bg-green-600 text-white ring-2 ring-green-300'
            : 'text-green-700 bg-green-50',
        )}
      >
        ✓ 已預訂 {reserved}
      </button>
      {total > 0 && (
        <span className="flex-shrink-0 text-gray-600 bg-white border border-gray-100 px-2 py-1 rounded-lg">
          總計 {currency} {total.toLocaleString()}
        </span>
      )}
      {unpaid > 0 && (
        <span className="flex-shrink-0 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
          待付 {currency} {unpaid.toLocaleString()}
        </span>
      )}
    </div>
  )
}

// ─── BookingSheet ──────────────────────────────────────────────────────────
interface BookingSheetProps {
  open: boolean
  onClose: () => void
  itineraryId: string
  itinerary: Itinerary
  bookings: Booking[]
  canEdit: boolean
  onAddBooking: (data: Partial<Booking>) => Promise<Booking | null>
  onEditBooking: (id: string, data: Partial<Booking>) => Promise<boolean>
  onDeleteBooking: (id: string) => Promise<boolean>
  /** 編輯連結的活動/住宿預約欄位並同步行程表 */
  onSaveLinkedBooking?: (ub: UnifiedBooking, updates: LinkedBookingUpdate) => Promise<boolean>
}

type FilterType = BookingType | 'all'
type FilterStatus = BookingStatus | 'all'

export function BookingSheet({
  open, onClose, itineraryId, itinerary, bookings, canEdit,
  onAddBooking, onEditBooking, onDeleteBooking, onSaveLinkedBooking,
}: BookingSheetProps) {
  const currency = itinerary.metadata.currency

  const [filterDay, setFilterDay] = useState<string | 'all'>('all')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  // ── 編輯 modal 狀態 ──────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [linkedTarget, setLinkedTarget] = useState<UnifiedBooking | null>(null)

  // ── 連結 picker ──────────────────────────────────────────────────────────
  const [linkTarget, setLinkTarget] = useState<UnifiedBooking | null>(null)

  // ── API 操作 ─────────────────────────────────────────────────────────────
  async function apiPost(body: Record<string, unknown>) {
    const res = await fetch(`/api/itinerary/${itineraryId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function handleLink(standaloneId: string, targetType: 'activity' | 'accommodation', targetId: string, dayIndex: number) {
    await apiPost({ action: 'link', standaloneId, targetType, targetId, dayIndex })
    setLinkTarget(null)
  }

  async function handleUnlink(targetType: 'activity' | 'accommodation', targetId: string, dayIndex: number) {
    await apiPost({ action: 'unlink', targetType, targetId, dayIndex })
  }

  // ── 彙整 ─────────────────────────────────────────────────────────────────
  const unified = useMemo<UnifiedBooking[]>(() => {
    const fromItin = extractFromItinerary(itinerary)
    const fromStandalone: UnifiedBooking[] = bookings.map((b) => ({
      id: `standalone-${b.id}`,
      standaloneId: b.id,
      source: 'standalone' as const,
      type: b.type,
      status: b.status,
      title: b.title,
      date: b.date,
      endDate: b.endDate,
      time: b.time,
      cost: b.cost,
      depositPaid: b.depositPaid,
      bookingPlatform: b.bookingPlatform,
      orderNumber: b.orderNumber,
      bookingReference: b.bookingReference,
      bookingUrl: b.bookingUrl,
      freeCancelBy: b.freeCancelBy,
      contact: b.contact,
      notes: b.notes,
    }))
    return [...fromItin, ...fromStandalone].sort((a, b) => {
      const da = a.date ?? 'zzzz'
      const db = b.date ?? 'zzzz'
      return da < db ? -1 : da > db ? 1 : 0
    })
  }, [itinerary, bookings])

  const filtered = useMemo(() => {
    return unified.filter((b) => {
      if (filterDay !== 'all' && b.date !== filterDay) return false
      if (filterType !== 'all' && b.type !== filterType) return false
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      return true
    })
  }, [unified, filterDay, filterType, filterStatus])

  const dayOptions = useMemo(() => {
    const dates = Array.from(new Set(unified.map((b) => b.date).filter(Boolean) as string[]))
    dates.sort()
    return dates.map((d) => {
      const day = itinerary.days.find((dd) => dd.date === d)
      const di = itinerary.days.indexOf(day!)
      const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(d + 'T00:00:00').getDay()]
      return { date: d, label: `${d.slice(5).replace('-', '/')} 週${weekday}${day ? ` D${di + 1}` : ''}` }
    })
  }, [unified, itinerary.days])

  // ── 卡片點擊處理 ──────────────────────────────────────────────────────────
  function handleCardClick(b: UnifiedBooking) {
    if (!canEdit) return
    if (b.source === 'standalone') {
      const orig = bookings.find((x) => x.id === b.standaloneId)
      if (orig) setEditTarget(orig)
    } else {
      setLinkedTarget(b)
    }
  }

  // ── linked 儲存 ──────────────────────────────────────────────────────────
  async function handleSaveLinked(updates: LinkedBookingUpdate) {
    if (!linkedTarget || !onSaveLinkedBooking) return
    const ok = await onSaveLinkedBooking(linkedTarget, updates)
    if (ok) setLinkedTarget(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[210] bg-white flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">預約管理</h2>
          <p className="text-xs text-gray-400 mt-0.5">共 {unified.length} 筆{canEdit ? '・點擊卡片可編輯' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1 text-sm text-white bg-purple-500 px-3 py-1.5 rounded-xl active:bg-purple-600 font-medium"
            >
              <PlusIcon />新增
            </button>
          )}
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200">
            <XIcon />
          </button>
        </div>
      </div>

      {/* 摘要列 */}
      <SummaryBar
        items={filtered}
        allItems={unified}
        currency={currency}
        filterStatus={filterStatus}
        onToggleStatus={(s) => setFilterStatus((prev) => (prev === s ? 'all' : s))}
      />

      {/* 篩選列 – 日期 */}
      <div className="border-b border-gray-100">
        <div className="flex gap-2 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilterDay('all')}
            className={clsx('flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
              filterDay === 'all' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200')}
          >
            全部日期
          </button>
          {dayOptions.map(({ date, label }) => (
            <button
              key={date}
              onClick={() => setFilterDay(date === filterDay ? 'all' : date)}
              className={clsx('flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                filterDay === date ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200')}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 篩選列 – 類型 */}
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {(['all', ...Object.keys(BOOKING_TYPE_LABELS)] as (FilterType | 'all')[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t === filterType ? 'all' : t)}
              className={clsx('flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                filterType === t ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200')}
            >
              {t === 'all' ? '全部類型' : BOOKING_TYPE_LABELS[t as BookingType]}
            </button>
          ))}
        </div>
      </div>

      {/* 清單 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">
            {unified.length === 0 ? '尚無預約項目' : '篩選結果為空'}
          </div>
        ) : (
          filtered.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              currency={currency}
              canEdit={canEdit}
              onClick={canEdit ? () => handleCardClick(b) : undefined}
              onDelete={b.standaloneId ? () => onDeleteBooking(b.standaloneId!) : undefined}
              onLink={b.source === 'standalone' ? () => setLinkTarget(b) : undefined}
              onUnlink={(b.source === 'activity' || b.source === 'lodging') && b.rawId !== undefined && b.dayIndex !== undefined
                ? () => handleUnlink(b.source === 'activity' ? 'activity' : 'accommodation', b.rawId!, b.dayIndex!)
                : undefined}
            />
          ))
        )}
      </div>

      {/* 新增 standalone modal */}
      {addOpen && (
        <BookingEditModal
          open
          currency={currency}
          onClose={() => setAddOpen(false)}
          booking={null}
          onSave={async (data) => { await onAddBooking(data); setAddOpen(false) }}
        />
      )}

      {/* 編輯 standalone modal */}
      {editTarget && (
        <BookingEditModal
          open
          currency={currency}
          onClose={() => setEditTarget(null)}
          booking={editTarget}
          onSave={async (data) => { await onEditBooking(editTarget.id, data); setEditTarget(null) }}
        />
      )}

      {/* 編輯連結項目（活動/住宿）modal */}
      {linkedTarget && (
        <BookingEditModal
          open
          currency={currency}
          onClose={() => setLinkedTarget(null)}
          linked={{
            source: linkedTarget.source as 'activity' | 'lodging',
            title: linkedTarget.title,
            date: linkedTarget.date,
            dayLabel: linkedTarget.dayLabel,
            time: linkedTarget.time,
            status: (linkedTarget.status as 'none' | 'needed' | 'reserved') ?? 'none',
            cost: linkedTarget.cost,
            depositPaid: linkedTarget.depositPaid,
            bookingPlatform: linkedTarget.bookingPlatform,
            orderNumber: linkedTarget.orderNumber,
            bookingReference: linkedTarget.bookingReference,
            bookingUrl: linkedTarget.bookingUrl,
            freeCancelBy: linkedTarget.freeCancelBy,
            contact: linkedTarget.contact,
            notes: linkedTarget.notes,
          }}
          onSaveLinked={handleSaveLinked}
        />
      )}

      {/* 連結景點 picker */}
      {linkTarget && linkTarget.standaloneId && (
        <LinkPickerModal
          itinerary={itinerary}
          standaloneId={linkTarget.standaloneId}
          onClose={() => setLinkTarget(null)}
          onConfirm={handleLink}
        />
      )}
    </div>
  )
}
