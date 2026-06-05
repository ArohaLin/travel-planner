import type { ItineraryDay, Activity, Accommodation, TravelLeg } from '@/lib/types/itinerary'
import { ActivityCard } from './ActivityCard'
import { AccommodationCard } from './AccommodationCard'
import { CostSummary } from './CostSummary'

/** 把公尺/秒組成「23.4 km・約 35 分」 */
function formatLeg(meters: number, seconds: number): string {
  const dist = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
  const min = Math.round(seconds / 60)
  const time =
    min < 60 ? `${min} 分` : min % 60 ? `${Math.floor(min / 60)} 時 ${min % 60} 分` : `${Math.floor(min / 60)} 時`
  return `${dist}・約 ${time}`
}

/** 兩張卡片之間的開車距離/時間連接器（置中小膠囊）；太近（< 50m）不顯示 */
function TravelConnector({ leg }: { leg: TravelLeg }) {
  if (leg.meters < 50) return null
  return (
    <div className="flex justify-center -mt-1 mb-2">
      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
        從前一站到這裡：🚗 {formatLeg(leg.meters, leg.seconds)}
      </span>
    </div>
  )
}

interface DayViewProps {
  day: ItineraryDay
  currency: string
  canEdit?: boolean
  onEditActivity?: (activity: Activity) => void
  onDeleteActivity?: (activity: Activity) => void
  onAddActivity?: (insertAfterIndex: number) => void
  onActivityClick?: (activity: Activity) => void
  onAddNote?: (activity: Activity) => void
  /** 判斷某活動是否已有 AI 備註 */
  hasNoteFor?: (activityId: string) => boolean
  onEditAccommodation?: (acc: Accommodation) => void
  onAddNoteAccommodation?: (acc: Accommodation) => void
  hasNoteForAccommodation?: boolean
  /** 編輯每日簡介（theme）*/
  onEditTheme?: () => void
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

export function DayView({ day, currency, canEdit, onEditActivity, onDeleteActivity, onAddActivity, onActivityClick, onAddNote, hasNoteFor, onEditAccommodation, onAddNoteAccommodation, hasNoteForAccommodation, onEditTheme }: DayViewProps) {
  // 開車路段距離/時間（地圖開啟後算好寫回 DB）：以目的地識別碼查找，顯示在卡片之間
  const legByTo = new Map<string, TravelLeg>((day.travelLegs ?? []).map((l) => [l.toId, l]))
  // 住宿前的連接器：只要有「最後一站 → 住宿」的路段就顯示（交通卡後面也顯示）
  const accommodationLeg = legByTo.get('accommodation')

  return (
    <div className="px-4 pt-4">
      {/* Day header（每日簡介，可編輯）*/}
      {day.theme ? (
        <div className="mb-4 px-4 py-3 bg-purple-50 rounded-2xl border border-purple-100 flex items-start gap-2">
          <p className="text-sm font-medium text-purple-700 flex-1">✨ {day.theme}</p>
          {canEdit && onEditTheme && (
            <button onClick={onEditTheme} title="編輯每日簡介" className="text-purple-400 hover:text-purple-700 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        canEdit && onEditTheme && (
          <button onClick={onEditTheme} className="mb-4 w-full px-4 py-2.5 bg-purple-50/60 rounded-2xl border border-dashed border-purple-200 text-sm text-purple-500 hover:bg-purple-50 transition-colors">
            ✨ 新增每日簡介
          </button>
        )
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

          {day.activities.map((activity, idx) => {
            // 連接器：抵達本站相對「前一個實際地點」的開車距離/時間。
            // 本身是交通卡、或第一站（出發地→此站）不顯示；交通卡後面的景點卡會顯示
            // （該段距離正是交通卡描述的旅程，補上實際公里數/時間）。
            const arriveLeg =
              idx > 0 && activity.type !== 'transport' ? legByTo.get(activity.id) : undefined
            return (
              <div key={activity.id}>
                {arriveLeg && <TravelConnector leg={arriveLeg} />}
                <ActivityCard
                  activity={activity}
                  isLast={idx === day.activities.length - 1 && !canEdit}
                  canEdit={canEdit}
                  onEdit={onEditActivity}
                  onDelete={onDeleteActivity}
                  onClick={onActivityClick}
                  onAddNote={onAddNote}
                  hasNote={hasNoteFor?.(activity.id)}
                />
                {/* 在每個活動之後插入的按鈕 */}
                {canEdit && (
                  <AddButton
                    label={idx === day.activities.length - 1 ? '在結尾新增' : '在此之後插入'}
                    onClick={() => onAddActivity?.(idx)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Accommodation（前面顯示「最後一站 → 住宿」的開車距離/時間） */}
      {day.accommodation && (
        <>
          {accommodationLeg && <TravelConnector leg={accommodationLeg} />}
          <AccommodationCard
            accommodation={day.accommodation}
            canEdit={canEdit}
            hasNote={hasNoteForAccommodation}
            onEdit={onEditAccommodation}
            onAddNote={onAddNoteAccommodation}
          />
        </>
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
