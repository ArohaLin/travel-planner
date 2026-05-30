import type { Activity } from '@/lib/types/itinerary'
import { clsx } from 'clsx'
import { formatDuration } from './ActivityDetailModal'

/** 計算時長（分鐘），無 endTime 回 null */
function durationMinutes(start: string, end?: string): number | null {
  if (!end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? diff : null
}

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

const TYPE_COLORS: Record<string, string> = {
  sightseeing: 'bg-blue-50 border-blue-100',
  food: 'bg-orange-50 border-orange-100',
  shopping: 'bg-pink-50 border-pink-100',
  transport: 'bg-gray-50 border-gray-100',
  experience: 'bg-purple-50 border-purple-100',
  nature: 'bg-green-50 border-green-100',
  rest: 'bg-yellow-50 border-yellow-100',
  other: 'bg-gray-50 border-gray-100',
}

interface ActivityCardProps {
  activity: Activity
  isLast?: boolean
  canEdit?: boolean
  onEdit?: (activity: Activity) => void
  onDelete?: (activity: Activity) => void
  /** 點擊卡片開啟詳情視窗 */
  onClick?: (activity: Activity) => void
}

export function ActivityCard({ activity, isLast, canEdit, onEdit, onDelete, onClick }: ActivityCardProps) {
  const dur = durationMinutes(activity.startTime, activity.endTime)

  return (
    <div className="flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-2 h-2 rounded-full bg-purple-400 mt-3 flex-shrink-0" />
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
      </div>

      {/* Card（點擊開詳情） */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick?.(activity)}
        className={clsx(
          'flex-1 rounded-2xl border p-3 mb-3 relative cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99]',
          TYPE_COLORS[activity.type] ?? TYPE_COLORS.other,
        )}
      >
        {/* Edit / Delete buttons (top-right, only when canEdit) */}
        {canEdit && (
          <div className="absolute top-2.5 right-2.5 flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit?.(activity) }}
              title="編輯活動"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-gray-400 hover:text-purple-600 hover:bg-white shadow-sm transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(activity) }}
              title="刪除活動"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-gray-400 hover:text-red-500 hover:bg-white shadow-sm transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        )}

        {/* Time · Duration · Type */}
        <div className={clsx('flex items-center gap-2 mb-1.5 flex-wrap', canEdit && 'pr-16')}>
          <span className="text-sm font-semibold text-gray-700">
            {activity.startTime}
            {activity.endTime && ` — ${activity.endTime}`}
          </span>
          {dur !== null && (
            <span className="text-xs text-purple-500 bg-white/70 px-1.5 py-0.5 rounded-full">
              {formatDuration(dur)}
            </span>
          )}
          <span className="text-xs text-gray-400">{TYPE_LABELS[activity.type]}</span>
        </div>

        {/* Title + 地點（精簡，其餘移至詳情視窗） */}
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5">{TYPE_ICONS[activity.type]}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 leading-snug">{activity.title}</h3>
            {activity.location?.address && (
              <p className="text-xs text-gray-400 mt-1 truncate">📍 {activity.location.address}</p>
            )}
          </div>
          {/* 詳情指示箭頭 */}
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </div>
  )
}
