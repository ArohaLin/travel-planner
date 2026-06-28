import type { ItineraryDay, Activity } from '@/lib/types/itinerary'
import { effectiveReservation } from '@/lib/itinerary/reservation'

/**
 * 簡表（唯讀）資料推導：把一天的行程資料整理成簡表所需的結構。
 * 規則（與使用者確認）：
 *  - 排除移動列（type='transport'）
 *  - 上方三餐快覽 + 住宿；表格仍照時序列出餐飲（餐飲會同時出現在快覽與表格）
 *  - 每天含「出發」與「結束」兩列
 *  - 時長用中文（如「1 時 55 分」）
 *  - 備註整合 highlight ＋ tips ＋（需預約）；都沒有就留白
 *  - 內容＝幾個字的簡介（intro/foodItems 取首句精簡）；沒有就留白
 *  純函式、無副作用 → 行程一變，簡表自動跟著變。
 */

export interface SummaryRow {
  kind: 'depart' | 'activity' | 'end'
  /** 時間區段，如「11:30 – 13:00」或單一「08:30」 */
  time: string
  /** 中文時長，如「1 時 30 分」；無法判斷則空字串 */
  duration: string
  /** 類型 emoji 圖示 */
  icon: string
  /** 景點/活動/餐廳名稱 */
  place: string
  /** 內容簡介（幾個字）；無則空字串 */
  content: string
  /** 備註（highlight/tips 精簡）；無則空字串 */
  note: string
  /** 是否需預約（顯示「需預約」標記） */
  needBooking: boolean
}

export interface MealSummary {
  breakfast: string | null
  lunch: string | null
  dinner: string | null
}

export interface DaySummary {
  meals: MealSummary
  accommodation: { name: string; checkIn: string } | null
  rows: SummaryRow[]
}

const toMin = (t?: string): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** 分鐘 → 時長（純分鐘表示）：「90 分」 */
function fmtDurZh(min: number): string {
  if (min <= 0) return ''
  return `${min} 分`
}

/** 類型圖示；餐飲再依餐別細分 */
function iconFor(a: Activity): string {
  if (a.type === 'food') {
    const meal = a.mealType ?? ''
    if (/早/.test(meal)) return '🥐'
    if (/午餐|中餐/.test(meal)) return '🍽️'
    if (/晚/.test(meal)) return '🍜'
    if (/下午茶|甜點|點心/.test(meal)) return '🍰'
    return '🍽️'
  }
  switch (a.type) {
    case 'sightseeing': return '📷'
    case 'nature': return '🌿'
    case 'experience': return '🎯'
    case 'shopping': return '🛍️'
    case 'rest': return '☕'
    default: return '📍'
  }
}

/** 取首句（切到第一個句讀），給「內容」欄用；長度交由版面 line-clamp 控制 */
function firstClause(s?: string): string {
  if (!s) return ''
  return s.split(/[。\n；;！？]/)[0].trim()
}

/** 取較短的工具：給「備註」欄精簡用 */
function shortText(s?: string, maxLen = 14): string {
  const first = firstClause(s)
  return first.length > maxLen ? first.slice(0, maxLen) + '…' : first
}

/** 類型的通用簡述（所有具體欄位都沒寫時的保底，避免「內容」整片空白） */
function genericContent(type: Activity['type']): string {
  switch (type) {
    case 'food': return '用餐'
    case 'sightseeing': return '參觀遊覽'
    case 'nature': return '自然景觀'
    case 'experience': return '體驗活動'
    case 'shopping': return '購物'
    case 'rest': return '休息'
    default: return ''
  }
}

/**
 * 內容欄：盡量寫得出東西（多來源備援）、又不過長（取首句，版面再 line-clamp 2 行）。
 * 餐飲優先 foodItems；其它依 intro→recommendation→description；都沒有才用類型通用簡述。
 */
function contentOf(a: Activity): string {
  if (a.type === 'food' && a.foodItems) return firstClause(a.foodItems)
  const main = firstClause(a.intro || a.recommendation || a.description || a.foodItems)
  return main || genericContent(a.type)
}

/** 備註欄：highlight 優先，其次 tips 首句；都沒有就空 */
function noteOf(a: Activity): string {
  if (a.highlight) return shortText(a.highlight, 14)
  if (a.tips) return shortText(a.tips, 14)
  return ''
}

/** 把餐飲依 mealType（或時間）歸進三餐快覽 */
function bucketMeals(foods: Activity[]): MealSummary {
  const meals: MealSummary = { breakfast: null, lunch: null, dinner: null }
  for (const f of foods) {
    const name = f.placeLabel?.trim() || f.title
    const meal = f.mealType ?? ''
    const start = toMin(f.startTime) ?? 0
    if (/早/.test(meal) || (!meal && start < 10 * 60 + 30)) {
      meals.breakfast ??= name
    } else if (/午餐|中餐/.test(meal) || (!meal && start < 15 * 60)) {
      meals.lunch ??= name
    } else if (/晚/.test(meal) || (!meal && start >= 15 * 60)) {
      meals.dinner ??= name
    } else {
      // 下午茶等其它餐別不佔三餐格，略過快覽（仍會在表格出現）
    }
  }
  return meals
}

export function buildDaySummary(
  day: ItineraryDay,
  departure?: { name: string } | null,
  arrival?: { name: string } | null,
): DaySummary {
  const acts = (day.activities ?? []).filter((a) => a.type !== 'transport')
  const foods = acts.filter((a) => a.type === 'food')

  const rows: SummaryRow[] = []

  // 出發列：用最早活動的開始時間當出發時刻
  const firstStart = acts.length > 0 ? acts[0].startTime : null
  const departName = departure?.name?.trim()
  if (departName) {
    rows.push({
      kind: 'depart',
      time: firstStart || '',
      duration: '',
      icon: '🚩',
      place: departName,
      content: '出發',
      note: '',
      needBooking: false,
    })
  }

  // 活動列（已排除 transport，照原順序＝時序）
  for (const a of acts) {
    const s = toMin(a.startTime)
    const e = toMin(a.endTime)
    const time = a.startTime
      ? (a.endTime ? `${a.startTime} – ${a.endTime}` : a.startTime)
      : ''
    const durMin = s != null && e != null && e > s ? e - s : (a.duration ?? 0)
    rows.push({
      kind: 'activity',
      time,
      duration: fmtDurZh(durMin),
      icon: iconFor(a),
      place: a.placeLabel?.trim() || a.title,
      content: contentOf(a),
      note: noteOf(a),
      needBooking: effectiveReservation(a) !== 'none',
    })
  }

  // 結束列：當晚住宿（非最後一天）或返回地（最後一天）；時間用最後活動結束時刻
  const lastEnd = acts.length > 0 ? (acts[acts.length - 1].endTime || acts[acts.length - 1].startTime) : null
  const endName = arrival?.name?.trim() || day.accommodation?.name?.trim()
  if (endName) {
    rows.push({
      kind: 'end',
      time: lastEnd || '',
      duration: '',
      icon: '🏁',
      place: endName,
      content: '結束',
      note: '',
      needBooking: false,
    })
  }

  return {
    meals: bucketMeals(foods),
    accommodation: day.accommodation
      ? { name: day.accommodation.name, checkIn: day.accommodation.checkInTime }
      : null,
    rows,
  }
}
