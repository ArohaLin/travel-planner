import type { ItineraryDay, Activity } from '@/lib/types/itinerary'
import { ActivityCard } from './ActivityCard'
import { AccommodationCard } from './AccommodationCard'
import { CostSummary } from './CostSummary'

interface DayViewProps {
  day: ItineraryDay
  currency: string
  canEdit?: boolean
  onEditActivity?: (activity: Activity) => void
  onDeleteActivity?: (activity: Activity) => void
  onAddActivity?: (insertAfterIndex: number) => void
  onActivityClick?: (activity: Activity) => void
}

/** 小型「+」插入按鈕，顯示在兩個活動之間或最後一個活動之後 */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-1.5 px-3 text-xs text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-xl transition-colors group -ml-1 mb-1"
    >
      <span className="w-5 h-5 rounded-full border border-dashed border-purple-300 group-hover:border-purple-500 flex items-center justify-center flex-shrink-0 transition-colors">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </span>
      {label}
    </button>
  )
}

export function DayView({ day, currency, canEdit, onEditActivity, onDeleteActivity, onAddActivity, onActivityClick }: DayViewProps) {
  return (
    <div className="px-4 pt-4">
      {/* Day header */}
      {day.theme && (
        <div className="mb-4 px-4 py-3 bg-purple-50 rounded-2xl border border-purple-100">
          <p className="text-sm font-medium text-purple-700">✨ {day.theme}</p>
        </div>
      )}

      {/* Activities timeline */}
      {day.activities.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm mb-3">這天還沒有安排</p>
          {canEdit && (
            <button
              onClick={() => onAddActivity?.(-1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-purple-600 border border-dashed border-purple-300 rounded-full hover:bg-purple-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              新增活動
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* 在第一個活動之前插入 */}
          {canEdit && (
            <AddButton label="在開始插入" onClick={() => onAddActivity?.(-1)} />
          )}

          {day.activities.map((activity, idx) => (
            <div key={activity.id}>
              <ActivityCard
                activity={activity}
                isLast={idx === day.activities.length - 1 && !canEdit}
                canEdit={canEdit}
                onEdit={onEditActivity}
                onDelete={onDeleteActivity}
                onClick={onActivityClick}
              />
              {/* 在每個活動之後插入的按鈕 */}
              {canEdit && (
                <AddButton
                  label={idx === day.activities.length - 1 ? '在結尾新增' : '在此之後插入'}
                  onClick={() => onAddActivity?.(idx)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Accommodation */}
      {day.accommodation && (
        <AccommodationCard accommodation={day.accommodation} />
      )}

      {/* Cost summary */}
      <CostSummary day={day} currency={currency} />

      {/* Day notes */}
      {day.notes && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 rounded-2xl border border-yellow-100">
          <p className="text-sm text-yellow-800">📝 {day.notes}</p>
        </div>
      )}
    </div>
  )
}
