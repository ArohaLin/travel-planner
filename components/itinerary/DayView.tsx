import type { ItineraryDay, Activity, Accommodation, TravelLeg } from '@/lib/types/itinerary'
import { clsx } from 'clsx'
import { ActivityCard } from './ActivityCard'
import { AccommodationCard } from './AccommodationCard'
import { CostSummary } from './CostSummary'

const toMin = (t?: string): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** 秒 → 「35 分」/「1 時 5 分」 */
function fmtDur(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 時 ${m} 分` : `${h} 時`
}

/** 由交通方式/標題判斷圖示與動詞 */
function modeInfo(a?: Activity): { icon: string; label: string; driving: boolean } {
  const s = `${a?.transportMode ?? ''} ${a?.title ?? ''}`
  if (/船|渡輪|ferry/i.test(s)) return { icon: '⛴️', label: '搭船', driving: false }
  if (/火車|鐵路|台鐵|高鐵|train/i.test(s)) return { icon: '🚆', label: '搭火車', driving: false }
  if (/飛機|航班|機場|flight/i.test(s)) return { icon: '✈️', label: '搭機', driving: false }
  if (/巴士|公車|客運|bus/i.test(s)) return { icon: '🚌', label: '搭車', driving: false }
  if (/步行|走路|徒步|walk/i.test(s)) return { icon: '🚶', label: '步行', driving: false }
  if (/單車|腳踏車|自行車|bike/i.test(s)) return { icon: '🚲', label: '騎車', driving: false }
  // 自駕、未標示交通方式、或純合成（無交通卡）都當開車
  return { icon: '🚗', label: '開車', driving: true }
}

/** 緩衝判斷門檻：行程留的時間 ≥ max(Google+15分, Google×1.25) 才算充足 */
function bufferStatus(allottedSec: number, googleSec: number): { color: string; text: string } {
  if (allottedSec < googleSec) {
    return { color: 'red', text: `只留 ${fmtDur(allottedSec)}，恐遲到` }
  }
  const comfortable = Math.max(googleSec + 900, googleSec * 1.25)
  if (allottedSec < comfortable) {
    return { color: 'amber', text: `留 ${fmtDur(allottedSec)}・偏緊` }
  }
  return { color: 'green', text: `留 ${fmtDur(allottedSec)}・充足` }
}

const STATUS_BG: Record<string, string> = {
  red: 'bg-red-50 text-red-600 border-red-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  gray: 'bg-gray-50 text-gray-500 border-gray-100',
}

interface TravelRowProps {
  /** 對應的 AI 交通活動（若有）；合成列為 undefined */
  transport?: Activity
  /** 該段 Google 開車路段（若有） */
  leg?: TravelLeg
  /** 行程實際留的移動時間（秒）；用來和 Google 比較緩衝 */
  allottedSec?: number | null
  canEdit?: boolean
  onEdit?: (a: Activity) => void
  onDelete?: (a: Activity) => void
  onClick?: (a: Activity) => void
}

/**
 * 統一「移動列」：每段移動只有這一條（取代 AI 交通大卡 + Google 連接器）。
 * - 開車段：顯示 Google 實際開車時間 + 緩衝狀態（🟢充足/🟠偏緊/🔴不足）
 * - 非開車段（船/火車…）：顯示 AI 交通資訊與其時長，不做開車比對
 */
function TravelRow({ transport, leg, allottedSec, canEdit, onEdit, onDelete, onClick }: TravelRowProps) {
  const { icon, label, driving } = modeInfo(transport)
  const hasDriveLeg = !!leg && leg.meters >= 50 && driving

  // 主要文字
  let main: string
  let status: { color: string; text: string } | null = null
  if (hasDriveLeg && leg) {
    main = `${label}約 ${fmtDur(leg.seconds)}`
    if (allottedSec != null && allottedSec > 0) status = bufferStatus(allottedSec, leg.seconds)
  } else if (transport) {
    // 非開車段：用交通卡資訊與其自身時長
    const dur =
      allottedSec != null && allottedSec > 0
        ? allottedSec
        : (() => {
            const s = toMin(transport.startTime)
            const e = toMin(transport.endTime)
            return s != null && e != null && e > s ? (e - s) * 60 : null
          })()
    const route =
      transport.fromLabel && transport.toLabel
        ? `${transport.fromLabel} → ${transport.toLabel}`
        : transport.title
    main = `${route}${dur ? `・約 ${fmtDur(dur)}` : ''}`
    status = { color: 'gray', text: label }
  } else {
    // 合成列但無可用開車路段 → 不顯示
    return null
  }

  const clickable = !!(transport && onClick)
  const tone = status ? STATUS_BG[status.color] : STATUS_BG.gray

  return (
    <div className="flex justify-center -mt-0.5 mb-2">
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onClick!(transport!) : undefined}
        className={clsx(
          'inline-flex items-center gap-1.5 text-xs rounded-full border px-3 py-1 max-w-full',
          tone,
          clickable && 'cursor-pointer active:scale-[0.98] transition-transform',
        )}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate">{main}</span>
        {status && hasDriveLeg && (
          <span className="flex-shrink-0 font-medium">· {status.text}</span>
        )}
        {canEdit && transport && (
          <span className="flex items-center gap-0.5 flex-shrink-0 ml-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit?.(transport) }}
              title="編輯交通"
              className="w-5 h-5 flex items-center justify-center rounded text-current/60 hover:text-current"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(transport) }}
              title="刪除交通"
              className="w-5 h-5 flex items-center justify-center rounded text-current/60 hover:text-red-500"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        )}
      </div>
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
  // 開車路段距離/時間（地圖開啟後算好寫回 DB）：以目的地識別碼查找
  const legByTo = new Map<string, TravelLeg>((day.travelLegs ?? []).map((l) => [l.toId, l]))
  const acts = day.activities
  const lastActivity = acts[acts.length - 1]
  const accommodationLeg = legByTo.get('accommodation')
  // 住宿前的移動：若最後一個活動是交通卡，該交通卡列已涵蓋（用 accommodation leg）；
  // 否則（最後是景點）才補一條合成移動列到住宿
  const showAccommodationTravel = !!day.accommodation && lastActivity && lastActivity.type !== 'transport'

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
      {acts.length === 0 ? (
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
          {canEdit && <AddButton label="在開始插入" onClick={() => onAddActivity?.(-1)} />}

          {acts.map((activity, idx) => {
            const prev = idx > 0 ? acts[idx - 1] : undefined
            const next = idx < acts.length - 1 ? acts[idx + 1] : undefined
            const addBtn = canEdit && (
              <AddButton
                label={idx === acts.length - 1 ? '在結尾新增' : '在此之後插入'}
                onClick={() => onAddActivity?.(idx)}
              />
            )

            // 交通活動 → 移動列（吸收 Google 時間；緊接景點時帶該段路段）
            if (activity.type === 'transport') {
              const leg = next && next.type !== 'transport' ? legByTo.get(next.id) : undefined
              const s = toMin(activity.startTime)
              const e = toMin(activity.endTime)
              const allottedSec = s != null && e != null && e > s ? (e - s) * 60 : null
              return (
                <div key={activity.id}>
                  <TravelRow
                    transport={activity}
                    leg={leg}
                    allottedSec={allottedSec}
                    canEdit={canEdit}
                    onEdit={onEditActivity}
                    onDelete={onDeleteActivity}
                    onClick={onActivityClick}
                  />
                  {addBtn}
                </div>
              )
            }

            // 景點：若「前一個也是景點（中間沒交通卡）」且有 Google 路段 → 補一條合成移動列
            const synthetic =
              idx > 0 && prev && prev.type !== 'transport' ? legByTo.get(activity.id) : undefined
            const prevEnd = toMin(prev?.endTime ?? prev?.startTime)
            const curStart = toMin(activity.startTime)
            const allottedSec =
              prevEnd != null && curStart != null && curStart > prevEnd ? (curStart - prevEnd) * 60 : null

            return (
              <div key={activity.id}>
                {synthetic && <TravelRow leg={synthetic} allottedSec={allottedSec} />}
                <ActivityCard
                  activity={activity}
                  isLast={idx === acts.length - 1 && !canEdit && !day.accommodation}
                  canEdit={canEdit}
                  onEdit={onEditActivity}
                  onDelete={onDeleteActivity}
                  onClick={onActivityClick}
                  onAddNote={onAddNote}
                  hasNote={hasNoteFor?.(activity.id)}
                />
                {addBtn}
              </div>
            )
          })}
        </div>
      )}

      {/* Accommodation（最後一站是景點時，補「景點 → 住宿」移動列）*/}
      {day.accommodation && (
        <>
          {showAccommodationTravel && accommodationLeg && (
            <TravelRow
              leg={accommodationLeg}
              allottedSec={(() => {
                const e = toMin(lastActivity?.endTime ?? lastActivity?.startTime)
                const c = toMin(day.accommodation.checkInTime)
                return e != null && c != null && c > e ? (c - e) * 60 : null
              })()}
            />
          )}
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
