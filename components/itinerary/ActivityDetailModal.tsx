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

export function ActivityDetailModal({ activity, dayNumber, onClose }: ActivityDetailModalProps) {
  const dur = durationMinutes(activity.startTime, activity.endTime)
  const hasDetailInfo =
    activity.transport || activity.recommendation || activity.tips

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[60] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '88dvh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

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
              {activity.bookingRequired && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">預訂</span>
                  <span className="text-amber-600 text-sm">
                    ⚠️ 需要預訂
                    {activity.bookingUrl && (
                      <a href={activity.bookingUrl} target="_blank" rel="noopener noreferrer" className="underline ml-1">連結</a>
                    )}
                  </span>
                </div>
              )}
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
      </div>
    </>
  )
}
