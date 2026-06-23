import type { ItineraryDay, Activity, Accommodation, TravelLeg, GeoLocation } from '@/lib/types/itinerary'
import { clsx } from 'clsx'
import { ActivityCard, mapsNavUrl } from './ActivityCard'
import { RESERVATION } from '@/lib/itinerary/reservation'
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

/**
 * 由交通方式判斷圖示與動詞。優先看 transportMode（最可靠）；
 * 沒填才退回標題判斷——標題常含誤導字（例：「南寮漁港候船」的「船」
 * 是等船不是搭船，曾把還車候船誤標成 ⛴️ 搭船，看起來像連搭兩次船）。
 */
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
  // 自駕、未標示交通方式、或純合成（無交通卡）都當開車
  return { icon: '🚗', label: '開車', driving: true }
}

/**
 * 「複合交通」判斷：移動段落裡其實夾帶了實際動作（還車/候船/轉乘/報到…），
 * 整段時間不只是移動（例：「還車與候船 1 時 30 分」＝騎車幾分鐘＋還車＋走到碼頭＋候船）。
 * 這類段落視覺上份量比純過場重 → 改用獨立小卡片呈現，不再混在細灰移動列裡。
 * 關鍵字清單與 AI prompt 的「交通卡 title 規則」一致（雙邊閉環）。
 */
function isCompositeTransport(title?: string): boolean {
  return /還車|取車|候船|候機|報到|託運|安檢|轉乘|等候|排隊|寄放|手續/.test(title ?? '')
}

/**
 * 緩衝判斷門檻：充足 = 路程 + 路程的一半（最少 5 分、最多 15 分）。
 * 用比例制避免短程被絕對門檻誤判（例：路程 6 分留 15 分，明明很夠卻被 +15 分規則標偏緊）。
 */
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

interface TravelRowProps {
  /** 對應的 AI 交通活動（若有）；合成列為 undefined */
  transport?: Activity
  /** 該段 Google 開車路段（若有） */
  leg?: TravelLeg
  /** 行程實際留的移動時間（秒）；用來和 Google 比較緩衝 */
  allottedSec?: number | null
  /** 合成列的推定出發時間（前一活動結束時間），讓格式與交通卡列一致 */
  departTime?: string
  /** 合成列的目的地名稱（下一張卡的地點），讓格式與交通卡列一致 */
  toName?: string
  canEdit?: boolean
  onEdit?: (a: Activity) => void
  onDelete?: (a: Activity) => void
  onClick?: (a: Activity) => void
}

/**
 * 統一「移動列」：每段移動只有這一條（取代 AI 交通大卡 + Google 連接器）。
 * 視覺上沿著時間軸的直線往下流（靠左、與卡片同一條軸），平常安靜、有問題才響：
 * - 順暢的短程 → 只用淡灰小字（不打擾）
 * - 🟠 偏緊 / 🔴 恐遲到 → 才上色 + ⚠️ 提醒
 * 非開車段（船/火車…）顯示 AI 交通資訊與其時長，不做開車緩衝比對。
 */
function TravelRow({ transport, leg, allottedSec, departTime, toName, canEdit, onEdit, onDelete, onClick }: TravelRowProps) {
  const { icon, label, driving } = modeInfo(transport)
  const hasDriveLeg = !!leg && leg.meters >= 50 && driving

  // 統一模板（交通卡列與合成列相同）：「HH:MM 動詞前往 目的地・約 時長」。
  // 一律不顯示 fromLabel：時間軸上一張卡就是出發點，且 fromLabel 是 AI 最常寫得不一致的欄位。
  let timeText: string | null = null
  let main: string
  let status: { color: string; text: string } | null = null

  if (transport) {
    // 排程交通：出發時間 + 動詞前往目的地 + 時長（開車段優先用 Google 路程，其次卡片時段）
    timeText = transport.startTime || null
    const cardSec = (() => {
      const s = toMin(transport.startTime)
      const e = toMin(transport.endTime)
      return s != null && e != null && e > s ? (e - s) * 60 : null
    })()
    const durSec = hasDriveLeg && leg ? leg.seconds : cardSec
    const to = transport.toLabel?.trim()
    // 複合用途的交通卡（還車/候船/轉乘…）：時段不只是移動，用原標題才不會讓人誤會
    // 「騎車要 1 小時」（實際是騎車幾分鐘 + 還車 + 候船的整段時間）。
    // 註：這類段落正常會走 CompositeTransportCard 獨立卡片；此處仍保留判斷當保險（標題誤判時）
    const composite = isCompositeTransport(transport.title)
    main = `${!composite && to ? `${label}前往 ${to}` : transport.title}${durSec ? `・約 ${fmtDur(durSec)}` : ''}`
    const budget = allottedSec ?? cardSec
    if (hasDriveLeg && leg && budget != null && budget > 0) {
      status = bufferStatus(budget, leg.seconds)
    }
  } else if (hasDriveLeg && leg) {
    // 合成列：兩景點之間的 Google 開車段（無交通卡）→ 補上推定出發時間與目的地，格式與交通卡列一致
    timeText = departTime ?? null
    main = `${toName ? `${label}前往 ${toName}` : `${label}`}・約 ${fmtDur(leg.seconds)}`
    if (allottedSec != null && allottedSec > 0) status = bufferStatus(allottedSec, leg.seconds)
  } else {
    // 合成列但無可用開車路段 → 不顯示
    return null
  }

  // 只有偏緊/恐遲到才上色 + ⚠️（獨立一列完整顯示，不擠在主列尾端）
  const warn = status?.color === 'amber' || status?.color === 'red'
  const warnTone = status?.color === 'red' ? 'text-red-500' : 'text-amber-600'
  const textTone = 'text-gray-500'
  const clickable = !!(transport && onClick)

  return (
    <div className="flex gap-3">
      {/* 時間軸：延續上一張卡的直線，小圖示標示「移動中」 */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-0.5 h-2 bg-gray-200" />
        <span className="text-[11px] leading-none my-0.5 opacity-70">{icon}</span>
        <div className="w-0.5 flex-1 bg-gray-200" />
      </div>

      {/* 內容（靠左、安靜；警示另起一列） */}
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onClick!(transport!) : undefined}
        className={clsx(
          'flex-1 py-1.5 mb-1 min-w-0',
          clickable && 'cursor-pointer active:opacity-70',
        )}
      >
        <div className={clsx('flex items-start gap-1.5 text-xs min-w-0', textTone)}>
          {timeText && <span className="flex-shrink-0 font-medium tabular-nums">{timeText}</span>}
          <span className="leading-snug">{main}</span>
          {canEdit && transport && (
            <span className="flex items-center gap-0.5 flex-shrink-0 ml-auto pl-1 text-gray-400">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit?.(transport) }}
                title="編輯交通"
                className="w-6 h-6 flex items-center justify-center rounded hover:text-purple-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(transport) }}
                title="刪除交通"
                className="w-6 h-6 flex items-center justify-center rounded hover:text-red-500"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
        </div>
        {warn && status && (
          <div className={clsx('flex items-start gap-1 text-xs mt-1 font-medium', warnTone)}>
            <span className="flex-shrink-0">⚠️</span>
            <span>{status.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface CompositeTransportCardProps {
  transport: Activity
  canEdit?: boolean
  onEdit?: (a: Activity) => void
  onDelete?: (a: Activity) => void
  onClick?: (a: Activity) => void
}

/**
 * 複合交通卡：還車/候船/轉乘…這類「移動＋實際動作」的段落，
 * 視覺份量比純過場連接線重，改用獨立小卡片（虛線框＋淺底）呈現，
 * 與純移動列（細灰一條）做出層次，但仍比景點主卡輕，不喧賓奪主。
 */
function CompositeTransportCard({ transport, canEdit, onEdit, onDelete, onClick }: CompositeTransportCardProps) {
  const { icon } = modeInfo(transport)

  // 時間：有完整起迄就顯示區間，否則只顯示出發時間
  const s = toMin(transport.startTime)
  const e = toMin(transport.endTime)
  const timeRange =
    transport.startTime && transport.endTime ? `${transport.startTime} — ${transport.endTime}` : transport.startTime || null
  const durSec = s != null && e != null && e > s ? (e - s) * 60 : null

  const clickable = !!onClick

  return (
    <div className="flex gap-3">
      {/* 時間軸：延續直線，圖示節點略大於純移動列以示份量 */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-0.5 h-2 bg-gray-200" />
        <span className="text-sm leading-none my-0.5">{icon}</span>
        <div className="w-0.5 flex-1 bg-gray-200" />
      </div>

      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onClick!(transport) : undefined}
        className={clsx(
          'flex-1 rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 px-3 py-2.5 mb-2 min-w-0',
          clickable && 'cursor-pointer active:opacity-70',
        )}
      >
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          {timeRange && <span className="text-xs font-semibold text-gray-600 tabular-nums">{timeRange}</span>}
          {durSec && <span className="text-[11px] text-gray-400">{fmtDur(durSec)}</span>}
          <span className="text-[11px] text-gray-400">交通／轉乘</span>
          {canEdit && (
            <span className="flex items-center gap-0.5 flex-shrink-0 ml-auto text-gray-400">
              <button
                onClick={(ev) => { ev.stopPropagation(); onEdit?.(transport) }}
                title="編輯交通"
                className="w-6 h-6 flex items-center justify-center rounded hover:text-purple-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </button>
              <button
                onClick={(ev) => { ev.stopPropagation(); onDelete?.(transport) }}
                title="刪除交通"
                className="w-6 h-6 flex items-center justify-center rounded hover:text-red-500"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium text-gray-700 leading-snug text-sm">{transport.title}</span>
        </div>
      </div>
    </div>
  )
}

interface DepartureCardProps {
  name: string
  location?: GeoLocation | null
  /** 第 1 天從家裡/出發城市出發（圖示用 🏠） */
  isHome?: boolean
  /** 當天第一個活動的開始時間＝出發時間（時間區間的「結束」）*/
  departTime?: string | null
  /** 「早餐・整理行李」開始時間（區間「起始」）；未設時預設出發前 90 分 */
  prepStartTime?: string | null
  /** 提供時：顯示編輯鈕，點了開啟出發地時間編輯視窗（改完按確認才生效）*/
  onEdit?: () => void
}

/** 每天開頭的「出發地」卡片：前一晚住宿（或第 1 天的出發城市）。
 *  顯示「早餐・整理行李」時間區間（唯讀）；按右上編輯鈕才開視窗修改（避免誤觸）。*/
function DepartureCard({ name, location, isHome, departTime, prepStartTime, onEdit }: DepartureCardProps) {
  const PREP_MIN = 90
  const hh = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  const depMin = toMin(departTime ?? undefined)
  const endStr = departTime ?? ''
  // 起始：優先用已存的整理行李開始時間，否則預設出發前 90 分
  const startStr = prepStartTime ?? (depMin != null ? hh(Math.max(0, depMin - PREP_MIN)) : '')
  const range = startStr && endStr ? `${startStr} — ${endStr}` : null

  return (
    <div className="flex gap-3">
      {/* 時間軸：空心圓點標示起點 */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-2.5 h-2.5 rounded-full border-2 border-purple-300 bg-white mt-3 flex-shrink-0" />
        <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
      </div>

      <div className="flex-1 rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-3 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          {range && <span className="text-sm font-semibold text-gray-700">{range}</span>}
          <span className="text-xs text-gray-400">早餐・整理行李</span>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              title="編輯出發時間"
              className="ml-auto flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 active:bg-purple-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5">{isHome ? '🏠' : '🏨'}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-700 leading-snug">出發地：{name}</h3>
            {location?.address && (
              <a
                href={mapsNavUrl(location)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block text-xs text-blue-500 underline decoration-blue-200 underline-offset-2 mt-1 leading-relaxed active:text-blue-700"
              >
                📍 {location.address}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 最後一天的「終點站」卡片（#41）：與出發地卡片對稱，標示旅程結束的地點與抵達時間 */
function ArrivalCard({ name, time }: { name: string; time?: string | null }) {
  return (
    <div className="flex gap-3">
      {/* 時間軸終點：實心圓點收尾，不再延伸直線 */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-0.5 h-3 bg-gray-200" />
        <div className="w-2.5 h-2.5 rounded-full bg-purple-400 flex-shrink-0" />
      </div>

      <div className="flex-1 rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-3 mb-3">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {time && <span className="text-sm font-semibold text-gray-700">{time}</span>}
          <span className="text-xs text-gray-400">旅程結束・平安到家</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5">🏁</span>
          <h3 className="font-semibold text-gray-700 leading-snug">終點：{name}</h3>
        </div>
      </div>
    </div>
  )
}

interface DayViewProps {
  day: ItineraryDay
  currency: string
  /** 當天出發地（前一晚住宿；第 1 天為出發城市）→ 顯示在時間軸最上方 */
  departure?: { name: string; location?: GeoLocation | null; isHome?: boolean }
  /** 旅程終點（最後一天才有，#41）→ 顯示在時間軸最下方 */
  arrival?: { name: string }
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
  /** 開啟出發地時間編輯視窗（出發地卡片右上編輯鈕）*/
  onEditDeparture?: () => void
  /** 長按景點卡 → 進入拖拉排序模式（只景點卡可觸發）*/
  onLongPressActivity?: (activity: Activity) => void
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

export function DayView({ day, currency, departure, arrival, canEdit, onEditActivity, onDeleteActivity, onAddActivity, onActivityClick, onAddNote, hasNoteFor, onEditAccommodation, onAddNoteAccommodation, hasNoteForAccommodation, onEditTheme, onEditDeparture, onLongPressActivity }: DayViewProps) {
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
      {/* 預約狀態圖例 */}
      <div className="mb-3 flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-xl text-[12px] text-gray-500 flex-wrap">
        <span className="text-gray-400">預約狀態</span>
        {(['needed', 'reserved'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-sm', RESERVATION[k].badge)}>{RESERVATION[k].icon}</span>
            {RESERVATION[k].label}
          </span>
        ))}
      </div>

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
          {departure && (
            <DepartureCard
              name={departure.name}
              location={departure.location}
              isHome={departure.isHome}
              departTime={acts[0]?.startTime}
              prepStartTime={day.prepStartTime}
              onEdit={canEdit ? onEditDeparture : undefined}
            />
          )}
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

            // 交通活動：複合交通（還車/候船/轉乘…）→ 獨立小卡；純移動 → 細灰移動列
            if (activity.type === 'transport') {
              if (isCompositeTransport(activity.title)) {
                return (
                  <div key={activity.id}>
                    <CompositeTransportCard
                      transport={activity}
                      canEdit={canEdit}
                      onEdit={onEditActivity}
                      onDelete={onDeleteActivity}
                      onClick={onActivityClick}
                    />
                    {addBtn}
                  </div>
                )
              }
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
                {synthetic && (
                  <TravelRow
                    leg={synthetic}
                    allottedSec={allottedSec}
                    departTime={prev?.endTime}
                    toName={activity.placeLabel?.trim() || activity.title}
                  />
                )}
                <ActivityCard
                  activity={activity}
                  isLast={idx === acts.length - 1 && !canEdit && !day.accommodation && !arrival}
                  canEdit={canEdit}
                  onEdit={onEditActivity}
                  onDelete={onDeleteActivity}
                  onClick={onActivityClick}
                  onAddNote={onAddNote}
                  hasNote={hasNoteFor?.(activity.id)}
                  onLongPress={onLongPressActivity}
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
              departTime={lastActivity?.endTime}
              toName={day.accommodation.name}
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

      {/* 旅程終點卡（#41：最後一天，抵達時間 = 最後一個活動結束時間） */}
      {arrival && acts.length > 0 && (
        <ArrivalCard name={arrival.name} time={lastActivity?.endTime ?? lastActivity?.startTime} />
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
