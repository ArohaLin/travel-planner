'use client'

import type { ItineraryDay, Activity, Accommodation, TravelLeg, GeoLocation } from '@/lib/types/itinerary'
import { clsx } from 'clsx'
import { ActivityContent } from './ActivityCard'
import { AccommodationCard } from './AccommodationCard'
import { WeatherChip } from '@/components/weather/WeatherChip'
import { CostSummary } from './CostSummary'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { fmtKm, toneFor, stayShort } from '@/lib/itinerary/cardTone'
import { estimateLeg } from '@/lib/maps/estimateLeg'
import { isCompositeTransport } from '@/lib/itinerary/activityFlags'

const toMin = (t?: string): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

const fromMin = (m: number): string => {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

/** 秒 → 「35 分」/「1 時 5 分」 */
function fmtDur(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 時 ${m} 分` : `${h} 時`
}

function modeInfo(a?: Activity): { icon: string; label: string; driving: boolean } {
  const mode = a?.transportMode?.trim() ?? ''
  const s = mode || (a?.title ?? '')
  if (/船|渡輪|ferry/i.test(s)) return { icon: '⛴️', label: '搭船', driving: false }
  if (/火車|鐵路|台鐵|高鐵|train/i.test(s)) return { icon: '🚆', label: '搭火車', driving: false }
  if (/飛機|航班|機場|flight/i.test(s)) return { icon: '✈️', label: '搭機', driving: false }
  if (/巴士|公車|客運|bus/i.test(s)) return { icon: '🚌', label: '搭車', driving: false }
  if (/機車|摩托車|scooter/i.test(s)) return { icon: '🛵', label: '騎車', driving: true }
  if (/步行|走路|徒步|walk/i.test(s)) return { icon: '🚶', label: '步行', driving: false }
  if (/單車|腳踏車|自行車|bike/i.test(s)) return { icon: '🚲', label: '騎車', driving: false }
  return { icon: '🚗', label: '開車', driving: true }
}

function bufferStatus(allottedSec: number, googleSec: number): { color: string; text: string } {
  if (allottedSec < googleSec) {
    return { color: 'red', text: `路程約 ${fmtDur(googleSec)}，只留 ${fmtDur(allottedSec)}，恐遲到` }
  }
  const comfortable = googleSec + Math.min(Math.max(googleSec * 0.5, 300), 900)
  if (allottedSec < comfortable) {
    return { color: 'amber', text: `路程約 ${fmtDur(googleSec)}，只留 ${fmtDur(allottedSec)}，時間偏緊` }
  }
  return { color: 'green', text: `留 ${fmtDur(allottedSec)}・充足` }
}

/* ─── 時間軸列框架（時間欄｜軸｜內容）：所有列共用，確保軸線對齊 ─── */
interface RowFrameProps {
  timeTop?: string | null
  timeBottom?: string | null
  /** 停留時長（已含括號，如「(1h30m)」）顯示在時間欄最下方，淺色 */
  timeStay?: string | null
  /** 軸點顏色 class（活動用）；提供 icon 時忽略 */
  dotClass?: string
  /** 軸上以圖示取代圓點（交通/出發地等） */
  icon?: string
  /** 空心圓點（出發地起點） */
  hollow?: boolean
  hideTopLine?: boolean
  hideBottomLine?: boolean
  onClick?: () => void
  longPress?: Record<string, unknown>
  children: React.ReactNode
}
function RowFrame({ timeTop, timeBottom, timeStay, dotClass, icon, hollow, hideTopLine, hideBottomLine, onClick, longPress, children }: RowFrameProps) {
  return (
    <div className="flex gap-2">
      <div className="w-[46px] flex-shrink-0 pt-2 text-right leading-tight">
        {timeTop && <div className="text-[13px] font-semibold text-gray-800 tabular-nums">{timeTop}</div>}
        {timeBottom && <div className="text-[11px] text-gray-600 tabular-nums mt-0.5">{timeBottom}</div>}
        {timeStay && <div className="text-[11px] text-gray-800 tabular-nums mt-0.5">{timeStay}</div>}
      </div>
      <div className="w-4 flex-shrink-0 flex flex-col items-center">
        <div className={clsx('w-0.5 h-2.5', hideTopLine ? 'bg-transparent' : 'bg-gray-200')} />
        {icon ? (
          <span className="text-[13px] leading-none my-0.5">{icon}</span>
        ) : hollow ? (
          <span className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 bg-white flex-shrink-0" />
        ) : (
          <span className={clsx('w-2.5 h-2.5 rounded-full ring-2 ring-white flex-shrink-0', dotClass ?? 'bg-gray-400')} />
        )}
        <div className={clsx('w-0.5 flex-1', hideBottomLine ? 'bg-transparent' : 'bg-gray-200')} />
      </div>
      <div
        className={clsx('flex-1 min-w-0 pb-3', onClick && 'cursor-pointer')}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        style={longPress ? { touchAction: 'pan-y' } : undefined}
        {...(longPress ?? {})}
      >
        {children}
      </div>
    </div>
  )
}

/* ─── 移動列：時間軸圖示 + 「動詞前往 X・約 N 分・D km」，偏緊/恐遲到才上色 ─── */
interface TravelRowProps {
  transport?: Activity
  leg?: TravelLeg
  allottedSec?: number | null
  departTime?: string
  toName?: string
  /** 路段過期/尚未算精確路線時的直線概估（顯示「概估」而非沿用錯數字） */
  est?: { km: number; min: number } | null
}
function TravelRow({ transport, leg, allottedSec, departTime, toName, est }: TravelRowProps) {
  const base = modeInfo(transport)
  const hasDriveLeg = !!leg && leg.meters >= 50 && base.driving
  const treatAsWalk = hasDriveLeg && !!leg && leg.seconds < 300 && leg.meters <= 1000
  const walkSec = leg ? Math.max(60, Math.round(leg.meters / 80) * 60) : 0
  const icon = treatAsWalk ? '🚶' : base.icon
  const label = treatAsWalk ? '步行' : base.label
  const effLegSec = treatAsWalk ? walkSec : (leg?.seconds ?? 0)
  const km = hasDriveLeg ? fmtKm(leg?.meters) : null
  // 無精確路段但有相鄰座標 → 直線概估（路段過期/尚未算時，誠實顯示概估而非沿用錯數字）
  const useEst = !hasDriveLeg && !!est
  const estText = useEst ? `・約 ${est!.min} 分・${est!.km < 1 ? `${Math.round(est!.km * 1000)} m` : `${est!.km.toFixed(1)} km`}（概估）` : ''

  let timeText: string | null = null
  let main: string
  let status: { color: string; text: string } | null = null

  if (transport) {
    timeText = transport.startTime || null
    const cardSec = (() => {
      const s = toMin(transport.startTime)
      const e = toMin(transport.endTime)
      return s != null && e != null && e > s ? (e - s) * 60 : null
    })()
    const durSec = hasDriveLeg && leg ? effLegSec : cardSec
    // 「前往 X」優先用時間軸即時下一站名（toName），而非可能過時的 toLabel
    // （景點改名後 toLabel 不會自動重算 → 用即時名才不殘留舊地名）
    const to = toName?.trim() || transport.toLabel?.trim()
    const composite = isCompositeTransport(transport)
    const head = !composite && to ? `${label}前往 ${to}` : transport.title
    main = useEst
      ? `${head}${estText}`
      : `${head}${durSec ? `・約 ${fmtDur(durSec)}` : ''}${km ? `・${km}` : ''}`
    const budget = allottedSec ?? cardSec
    if (hasDriveLeg && leg && budget != null && budget > 0) status = bufferStatus(budget, effLegSec)
  } else if (hasDriveLeg && leg) {
    timeText = departTime ?? null
    main = `${toName ? `${label}前往 ${toName}` : label}・約 ${fmtDur(effLegSec)}${km ? `・${km}` : ''}`
    if (allottedSec != null && allottedSec > 0) status = bufferStatus(allottedSec, effLegSec)
  } else if (useEst) {
    timeText = departTime ?? null
    main = `${toName ? `${label}前往 ${toName}` : label}${estText}`
  } else {
    return null
  }

  const warn = status?.color === 'amber' || status?.color === 'red'
  const warnTone = status?.color === 'red' ? 'text-red-500' : 'text-amber-600'

  return (
    <RowFrame timeTop={timeText} icon={icon}>
      <div className="py-0.5">
        <p className="text-xs text-gray-500 leading-snug">{main}</p>
        {warn && status && (
          <p className={clsx('flex items-start gap-1 text-xs mt-1 font-medium', warnTone)}>
            <span className="flex-shrink-0">⚠️</span>
            <span>{status.text}</span>
          </p>
        )}
      </div>
    </RowFrame>
  )
}

/* ─── 複合交通卡（還車/候船/轉乘…）：軸上圖示 + 標題 + 時段 ─── */
function CompositeTransportRow({ transport, onClick }: { transport: Activity; onClick?: (a: Activity) => void }) {
  const { icon } = modeInfo(transport)
  const s = toMin(transport.startTime)
  const e = toMin(transport.endTime)
  const durSec = s != null && e != null && e > s ? (e - s) * 60 : null
  return (
    <RowFrame timeTop={transport.startTime || null} timeBottom={transport.endTime || null} icon={icon} onClick={onClick ? () => onClick(transport) : undefined}>
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-3 py-2 min-w-0">
        <p className="font-medium text-gray-700 leading-snug text-sm">{transport.title}</p>
        {durSec && <p className="text-[11px] text-gray-400 mt-0.5">交通／轉乘・{fmtDur(durSec)}</p>}
      </div>
    </RowFrame>
  )
}

/* ─── 出發地列（前一晚住宿／第 1 天出發城市）：早餐・整理行李時間區間 ─── */
function DepartureRow({ name, location, isHome, departTime, prepStartTime, onEdit }: {
  name: string; location?: GeoLocation | null; isHome?: boolean
  departTime?: string | null; prepStartTime?: string | null; onEdit?: () => void
}) {
  const PREP_MIN = 90
  const hh = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  const depMin = toMin(departTime ?? undefined)
  const startStr = prepStartTime ?? (depMin != null ? hh(Math.max(0, depMin - PREP_MIN)) : '')
  return (
    <RowFrame timeTop={startStr || null} timeBottom={departTime ?? null} hollow hideTopLine>
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-3 py-2.5 relative">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            title="編輯出發時間"
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 active:bg-purple-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
        )}
        <div className="flex items-start gap-2 pr-7">
          <span className="text-base leading-none mt-0.5">{isHome ? '🏠' : '🏨'}</span>
          <div className="min-w-0">
            <p className="font-medium text-gray-700 leading-snug text-sm">出發地：{name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">早餐・整理行李</p>
          </div>
        </div>
      </div>
    </RowFrame>
  )
}

/* ─── 終點站列（最後一天）─── */
function ArrivalRow({ name, time }: { name: string; time?: string | null }) {
  return (
    <RowFrame timeTop={time ?? null} dotClass="bg-gray-400" hideBottomLine>
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-3 py-2.5 flex items-center gap-2">
        <span className="text-base leading-none">🏁</span>
        <div className="min-w-0">
          <p className="font-medium text-gray-700 leading-snug text-sm">終點：{name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">旅程結束・平安到家</p>
        </div>
      </div>
    </RowFrame>
  )
}

/* ─── 插入鈕（軸上的 ＋，無文字說明）─── */
function InsertRow({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex gap-2 items-center">
      <div className="w-[46px] flex-shrink-0" />
      <div className="w-4 flex-shrink-0 flex justify-center">
        <button
          onClick={onClick}
          aria-label="插入卡片"
          className="my-0.5 w-5 h-5 rounded-full border border-dashed border-purple-300 text-purple-400 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      <div className="flex-1" />
    </div>
  )
}

interface DayViewProps {
  day: ItineraryDay
  currency: string
  departure?: { name: string; location?: GeoLocation | null; isHome?: boolean }
  arrival?: { name: string }
  canEdit?: boolean
  onEditActivity?: (activity: Activity) => void
  onDeleteActivity?: (activity: Activity) => void
  onAddActivity?: (insertAfterIndex: number) => void
  onActivityClick?: (activity: Activity) => void
  onAddNote?: (activity: Activity) => void
  hasNoteFor?: (activityId: string) => boolean
  onEditAccommodation?: (acc: Accommodation) => void
  onAddNoteAccommodation?: (acc: Accommodation) => void
  onOpenAccommodation?: (acc: Accommodation) => void
  hasNoteForAccommodation?: boolean
  onEditTheme?: () => void
  onEditDeparture?: () => void
  onLongPressActivity?: (activity: Activity) => void
}

/* 景點列（含長按進拖拉）：tap → 詳情；內容由 ActivityContent 渲染 */
function ActivityRow({ activity, isLast, onClick, onLongPress }: {
  activity: Activity; isLast: boolean; onClick?: (a: Activity) => void; onLongPress?: (a: Activity) => void
}) {
  const longPress = useLongPress(() => onLongPress?.(activity))
  const s = toMin(activity.startTime)
  const e = toMin(activity.endTime)
  const tone = toneFor(activity.type)
  const stay = stayShort(s, e, activity.duration)
  return (
    <RowFrame
      timeTop={activity.startTime}
      timeBottom={activity.endTime || null}
      timeStay={stay ? `(${stay})` : null}
      dotClass={tone.dot}
      hideBottomLine={isLast}
      onClick={onClick ? () => onClick(activity) : undefined}
      longPress={onLongPress ? longPress : undefined}
    >
      <ActivityContent activity={activity} />
    </RowFrame>
  )
}

export function DayView({ day, currency, departure, arrival, canEdit, onEditActivity, onDeleteActivity, onAddActivity, onActivityClick, onAddNote, hasNoteFor, onEditAccommodation, onAddNoteAccommodation, onOpenAccommodation, hasNoteForAccommodation, onEditTheme, onEditDeparture, onLongPressActivity }: DayViewProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void (onEditActivity || onDeleteActivity || onAddNote || hasNoteFor) // 這些改由詳情視窗觸發；保留 props 相容
  // travelSig 為空＝路段過期（剛編輯/刪除/排序、尚未重算）→ 不用舊 travelLegs，移動列改直線概估
  const routeStale = !day.travelSig
  const legByTo = new Map<string, TravelLeg>(routeStale ? [] : (day.travelLegs ?? []).map((l) => [l.toId, l]))
  const acts = day.activities
  const lastActivity = acts[acts.length - 1]
  const accommodationLeg = legByTo.get('accommodation')
  const showAccommodationTravel = !!day.accommodation && lastActivity && lastActivity.type !== 'transport'
  const accEst = day.accommodation && lastActivity ? estimateLeg(lastActivity.location, day.accommodation.location) : null
  // 住宿時間軸時間＝當晚實際抵達/入住（最後活動結束＋到飯店車程，且不早於飯店最早可入住），
  // 不再用飯店政策 checkInTime 當時間軸位置（那常早於當晚行程結束 → 時序倒退、看起來像 bug）。
  // 飯店「入住 15:00／退房 11:00」政策仍顯示在住宿卡內部。
  const accTimelineTime = (() => {
    if (!day.accommodation) return undefined
    const endMin = toMin(lastActivity?.endTime ?? lastActivity?.startTime)
    if (endMin == null) return day.accommodation.checkInTime
    const legMin = accommodationLeg ? Math.round(accommodationLeg.seconds / 60) : (accEst?.min ?? 0)
    const checkInMin = toMin(day.accommodation.checkInTime)
    const eff = checkInMin != null ? Math.max(endMin + legMin, checkInMin) : endMin + legMin
    return fromMin(eff)
  })()

  return (
    <div className="px-4 pt-4">
      {/* 當日天氣晶片（≤14天預報／>14天歷年同期；過去或無座標則不顯示）*/}
      <WeatherChip day={day} />

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
          {departure && (
            <DepartureRow
              name={departure.name}
              location={departure.location}
              isHome={departure.isHome}
              departTime={acts[0]?.startTime}
              prepStartTime={day.prepStartTime}
              onEdit={canEdit ? onEditDeparture : undefined}
            />
          )}
          {canEdit && <InsertRow onClick={() => onAddActivity?.(-1)} />}

          {acts.map((activity, idx) => {
            const prev = idx > 0 ? acts[idx - 1] : undefined
            const next = idx < acts.length - 1 ? acts[idx + 1] : undefined
            const addBtn = canEdit && (
              <InsertRow onClick={() => onAddActivity?.(idx)} />
            )

            if (activity.type === 'transport') {
              if (isCompositeTransport(activity)) {
                return (
                  <div key={activity.id}>
                    <CompositeTransportRow transport={activity} onClick={onActivityClick} />
                    {addBtn}
                  </div>
                )
              }
              const leg = next && next.type !== 'transport' ? legByTo.get(next.id) : undefined
              const s = toMin(activity.startTime)
              const e = toMin(activity.endTime)
              // 可用時間算到「下一站活動開始」（涵蓋交通卡結束後的空閒），而非只看交通卡自己時段 → 避免後面很空卻誤判偏緊
              const nextStart = next && next.type !== 'transport' ? toMin(next.startTime) : null
              const allottedSec =
                s != null && nextStart != null && nextStart > s ? (nextStart - s) * 60
                  : s != null && e != null && e > s ? (e - s) * 60 : null
              return (
                <div key={activity.id}>
                  <TravelRow transport={activity} leg={leg} allottedSec={allottedSec} toName={next && next.type !== 'transport' ? (next.placeLabel?.trim() || next.title) : undefined} est={estimateLeg(prev?.location, next?.location)} />
                  {addBtn}
                </div>
              )
            }

            // 前一張是活動（非交通卡）→ 需要一條「合成移動列」；leg 過期時用直線概估、不消失
            const needSynthetic = idx > 0 && !!prev && prev.type !== 'transport'
            const synthetic = needSynthetic ? legByTo.get(activity.id) : undefined
            const syntheticEst = needSynthetic ? estimateLeg(prev?.location, activity.location) : null
            const prevEnd = toMin(prev?.endTime ?? prev?.startTime)
            const curStart = toMin(activity.startTime)
            const allottedSec = prevEnd != null && curStart != null && curStart > prevEnd ? (curStart - prevEnd) * 60 : null
            const isLast = idx === acts.length - 1 && !day.accommodation && !arrival

            return (
              <div key={activity.id}>
                {needSynthetic && (synthetic || syntheticEst) && (
                  <TravelRow leg={synthetic} allottedSec={allottedSec} departTime={prev?.endTime} toName={activity.placeLabel?.trim() || activity.title} est={syntheticEst} />
                )}
                <ActivityRow
                  activity={activity}
                  isLast={isLast}
                  onClick={onActivityClick}
                  onLongPress={onLongPressActivity}
                />
                {addBtn}
              </div>
            )
          })}
        </div>
      )}

      {/* 住宿 */}
      {day.accommodation && (
        <>
          {showAccommodationTravel && (accommodationLeg || accEst) && (
            <TravelRow
              leg={accommodationLeg}
              est={accEst}
              allottedSec={(() => {
                const e = toMin(lastActivity?.endTime ?? lastActivity?.startTime)
                const c = toMin(day.accommodation.checkInTime)
                return e != null && c != null && c > e ? (c - e) * 60 : null
              })()}
              departTime={lastActivity?.endTime}
              toName={day.accommodation.name}
            />
          )}
          <RowFrame timeTop={accTimelineTime} dotClass="bg-emerald-500" hideBottomLine={!arrival}>
            <AccommodationCard
              accommodation={day.accommodation}
              canEdit={canEdit}
              hasNote={hasNoteForAccommodation}
              onEdit={onEditAccommodation}
              onAddNote={onAddNoteAccommodation}
              onOpen={onOpenAccommodation}
            />
          </RowFrame>
        </>
      )}

      {arrival && acts.length > 0 && (
        <ArrivalRow name={arrival.name} time={lastActivity?.endTime ?? lastActivity?.startTime} />
      )}

      <CostSummary day={day} currency={currency} />

      {day.notes && (
        <div className="mb-4 px-4 py-3 bg-yellow-50 rounded-2xl border border-yellow-100">
          <p className="text-sm text-yellow-800">📝 {day.notes}</p>
        </div>
      )}
    </div>
  )
}
