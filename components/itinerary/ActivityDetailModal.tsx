'use client'

import type { Activity } from '@/lib/types/itinerary'
import { formatMoney } from '@/lib/utils/currency'

const TYPE_ICONS: Record<string, string> = {
  sightseeing: '🏛️',
  food: '🍽️',
  shopping: '🛍️',
  transport: '🚌',
  experience: '🎯',
  nature: '🌿',
  rest: '😌',
  other: '📌',
}

const TYPE_LABELS: Record<string, string> = {
  sightseeing: '觀光',
  food: '餐飲',
  shopping: '購物',
  transport: '交通',
  experience: '體驗',
  nature: '自然',
  rest: '休息',
  other: '其他',
}

interface ActivityDetailModalProps {
  activity: Activity
  /** 第幾天（1-based，用於標題顯示） */
  dayNumber?: number
  onClose: () => void
  /** 可編輯時顯示底部動作列（編輯／AI 備註／刪除）。動作改由此視窗觸發，列表保持乾淨。 */
  canEdit?: boolean
  onEdit?: (activity: Activity) => void
  onDelete?: (activity: Activity) => void
  onAddNote?: (activity: Activity) => void
  hasNote?: boolean
}

/** 計算時長（分鐘），無 endTime 回 null */
function durationMinutes(start: string, end?: string): number | null {
  if (!end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? diff : null
}

/** 把分鐘格式化為「X 小時 Y 分」或「Y 分鐘」 */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} 分鐘`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-purple-500 mb-1.5">{title}</h4>
      {children}
    </div>
  )
}

export function ActivityDetailModal({ activity, dayNumber, onClose, canEdit, onEdit, onDelete, onAddNote, hasNote }: ActivityDetailModalProps) {
  const dur = durationMinutes(activity.startTime, activity.endTime)
  const hasDetailInfo =
    activity.transport || activity.recommendation || activity.tips
  const hasPhoto = !!activity.photoRef

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[60] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '88dvh' }}
      >
        {hasPhoto ? (
          /* 景點照片 hero（拖曳把手疊在圖上） */
          <div className="relative h-44 flex-shrink-0 rounded-t-3xl overflow-hidden bg-gray-100">
            <img
              src={`/api/photo?ref=${encodeURIComponent(activity.photoRef!)}`}
              alt={activity.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 top-0 flex justify-center pt-3 pointer-events-none">
              <div className="w-10 h-1 bg-white/80 rounded-full shadow" />
            </div>
          </div>
        ) : (
          /* Handle */
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-2xl leading-none mt-0.5">{TYPE_ICONS[activity.type]}</span>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 text-base leading-snug">{activity.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {dayNumber ? `第 ${dayNumber} 天 · ` : ''}{TYPE_LABELS[activity.type]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>

          {/* ① 行程資訊 */}
          <Section title="行程資訊">
            <div className="bg-gray-50 rounded-2xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">時間</span>
                <span className="text-gray-800 font-medium">
                  {activity.startTime}
                  {activity.endTime && ` — ${activity.endTime}`}
                </span>
              </div>
              {dur !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">時長</span>
                  <span className="text-gray-800 font-medium">{formatDuration(dur)}</span>
                </div>
              )}
              {activity.location?.address && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-400 flex-shrink-0">地點</span>
                  <span className="text-gray-800 text-right">📍 {activity.location.address}</span>
                </div>
              )}
              {activity.cost && (
                <div className="flex justify-between">
                  <span className="text-gray-400">費用</span>
                  <span className="text-gray-800 font-medium">{formatMoney(activity.cost)}</span>
                </div>
              )}
              {(() => {
                const resv = activity.reservationStatus ?? (activity.bookingRequired ? 'needed' : 'none')
                if (resv === 'none') return null
                const reserved = resv === 'reserved'
                return (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">預約</span>
                    <span className={`text-sm ${reserved ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {reserved ? '✅ 已預訂' : '📅 需預訂'}
                      {activity.bookingUrl && (
                        <a href={activity.bookingUrl} target="_blank" rel="noopener noreferrer" className="underline ml-1">連結</a>
                      )}
                    </span>
                  </div>
                )
              })()}
              {activity.tags && activity.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activity.tags.map((t) => (
                    <span key={t} className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* ② 介紹與安排理由 */}
          <Section title="介紹與安排理由">
            {activity.intro || activity.description ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {activity.intro || activity.description}
              </p>
            ) : (
              <p className="text-sm text-gray-300">尚無介紹資訊</p>
            )}
          </Section>

          {/* ③ 詳細資訊 */}
          <Section title="詳細資訊">
            {hasDetailInfo ? (
              <div className="space-y-3">
                {activity.transport && (
                  <div className="text-sm">
                    <span className="text-gray-400">🚗 交通：</span>
                    <span className="text-gray-600 leading-relaxed">{activity.transport}</span>
                  </div>
                )}
                {activity.recommendation && (
                  <div className="text-sm">
                    <span className="text-gray-400">⭐ 推薦：</span>
                    <span className="text-gray-600 leading-relaxed">{activity.recommendation}</span>
                  </div>
                )}
                {activity.tips && (
                  <div className="text-sm">
                    <span className="text-gray-400">💡 提醒：</span>
                    <span className="text-gray-600 leading-relaxed">{activity.tips}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-300">尚無詳細資訊（此行程為較早版本，可重新請 AI 生成以補充）</p>
            )}
          </Section>

          {/* 備註 */}
          {activity.notes && (
            <Section title="備註">
              <p className="text-sm text-gray-500 italic leading-relaxed whitespace-pre-wrap">{activity.notes}</p>
            </Section>
          )}
        </div>

        {/* 底部動作列：編輯／AI 備註／刪除（從列表收進這裡，列表保持乾淨） */}
        {canEdit && (onEdit || onDelete || onAddNote) && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-white"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            {onAddNote && (
              <button
                onClick={() => { onAddNote(activity); onClose() }}
                className="relative flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5h8M8 14h5m-5 6.5l-3 1.5v-4.5A2.5 2.5 0 014.5 15h-.25A2.25 2.25 0 012 12.75v-6.5A2.25 2.25 0 014.25 4h15.5A2.25 2.25 0 0122 6.25v6.5A2.25 2.25 0 0119.75 15H11l-3 2.5z" />
                </svg>
                備註
                {hasNote && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => { onDelete(activity); onClose() }}
                className="flex items-center justify-center gap-1.5 h-11 px-4 rounded-2xl border border-red-200 text-sm text-red-500 hover:bg-red-50 active:scale-[0.98] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                刪除
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => { onEdit(activity); onClose() }}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 active:scale-[0.98] transition"
              >
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
