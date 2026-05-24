import type { Activity } from '@/lib/types/itinerary'
import type { PatchOp } from '@/lib/types/patch'

// ── 常數 ─────────────────────────────────────────────────────────────────────
const MIN_MINUTES = 6 * 60        // 06:00
const MAX_MINUTES = 23 * 60 + 59  // 23:59
/** 「緊接」的判斷閾值：兩個活動之間 ≤ 此間隔就算原本是緊接 */
const TIGHT_GAP_THRESHOLD_MIN = 15

// ── 基本時間工具 ─────────────────────────────────────────────────────────────

/** "HH:MM" → 分鐘數（從午夜起算）*/
export function timeToMinutes(time: string): number {
  const parts = time.split(':')
  const h = parseInt(parts[0] ?? '0', 10)
  const m = parseInt(parts[1] ?? '0', 10)
  return h * 60 + m
}

/** 分鐘數 → "HH:MM"（限制在 00:00–23:59）*/
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MAX_MINUTES, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 顯示用：超出範圍的時間也顯示原始值（例如 "24:30" 或 "05:45"）*/
function minutesToTimeShow(minutes: number): string {
  const rounded = Math.round(minutes)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 取得活動持續時間（分鐘）。優先用 startTime/endTime，fallback 用 duration 欄位，最後預設 60 分。*/
export function getActivityDurationMin(activity: Activity): number {
  if (activity.startTime && activity.endTime) {
    const diff = timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime)
    if (diff > 0) return diff
  }
  if (activity.duration && activity.duration > 0) return activity.duration
  return 60
}

// ── ShiftPlan 共用型別 ───────────────────────────────────────────────────────

export interface ShiftWarning {
  activityTitle: string
  /** 試算後超出範圍的時間（例如 "24:30"）*/
  computedTime: string
  bound: 'too-early' | 'too-late'
}

export interface ShiftPlan {
  /** 可正常套用的 update_activity ops（不含超出範圍者）*/
  ops: PatchOp[]
  /** 超出 06:00–23:59 範圍的活動 — 若有，呼叫端應提示使用者 */
  outOfRangeWarnings: ShiftWarning[]
}

const EMPTY_PLAN: ShiftPlan = { ops: [], outOfRangeWarnings: [] }

// ── 內部工具：把整批活動依某 shift 量平移，並收集 warning ────────────────────

function shiftRange(
  activities: Activity[],
  fromIdx: number,
  toIdx: number,        // inclusive
  step: 1 | -1,
  shift: number,        // 分鐘，可正可負
  dayIndex: number,
): ShiftPlan {
  const ops: PatchOp[] = []
  const warnings: ShiftWarning[] = []
  if (shift === 0) return EMPTY_PLAN

  const indices: number[] = []
  for (let i = fromIdx; step > 0 ? i <= toIdx : i >= toIdx; i += step) {
    indices.push(i)
  }

  for (const i of indices) {
    const act = activities[i]
    if (!act) continue
    const origStart = timeToMinutes(act.startTime)
    const newStart = origStart + shift
    const origEnd = act.endTime ? timeToMinutes(act.endTime) : null
    const newEnd = origEnd !== null ? origEnd + shift : null

    if (newStart < MIN_MINUTES) {
      warnings.push({
        activityTitle: act.title,
        computedTime: minutesToTimeShow(newStart),
        bound: 'too-early',
      })
      continue
    }
    if ((newEnd ?? newStart) > MAX_MINUTES) {
      warnings.push({
        activityTitle: act.title,
        computedTime: minutesToTimeShow(newEnd ?? newStart),
        bound: 'too-late',
      })
      continue
    }

    const payload: Partial<Activity> = { startTime: minutesToTime(newStart) }
    if (newEnd !== null) payload.endTime = minutesToTime(newEnd)
    ops.push({
      op: 'update_activity',
      dayIndex,
      activityId: act.id,
      payload,
      _activityTitle: act.title,
    })
  }

  return { ops, outOfRangeWarnings: warnings }
}

function mergePlans(...plans: ShiftPlan[]): ShiftPlan {
  return {
    ops: plans.flatMap((p) => p.ops),
    outOfRangeWarnings: plans.flatMap((p) => p.outOfRangeWarnings),
  }
}

// ── ① 刪除：後續往前提「被刪時長」分鐘 ───────────────────────────────────────

export function computeDeleteShiftOps(
  activities: Activity[],
  deletedIdx: number,
  dayIndex: number,
): ShiftPlan {
  const deleted = activities[deletedIdx]
  if (!deleted) return EMPTY_PLAN
  const gap = getActivityDurationMin(deleted)
  if (gap <= 0) return EMPTY_PLAN

  return shiftRange(activities, deletedIdx + 1, activities.length - 1, +1, -gap, dayIndex)
}

// ── ② 新增：前向 / 後向 重疊都要消除 ────────────────────────────────────────

/**
 * 新增後時間調整：
 * - 後方重疊（新 endTime > 下一個 startTime）：後續整批 +overlap 分鐘
 * - 前方重疊（新 startTime < 前一個 endTime）：前面整批 -overlap 分鐘
 *
 * @param sortedActivities - 已包含新活動且依 startTime 排序的完整陣列
 */
export function computeInsertShiftOps(
  sortedActivities: Activity[],
  newActivityId: string,
  dayIndex: number,
): ShiftPlan {
  const newIdx = sortedActivities.findIndex((a) => a.id === newActivityId)
  if (newIdx === -1) return EMPTY_PLAN

  const newAct = sortedActivities[newIdx]
  const newStartMin = timeToMinutes(newAct.startTime)
  const newEndMin = newAct.endTime
    ? timeToMinutes(newAct.endTime)
    : newStartMin + (newAct.duration ?? 60)

  const plans: ShiftPlan[] = []

  // ── 後方鄰居 ──
  if (newIdx + 1 < sortedActivities.length) {
    const nextAct = sortedActivities[newIdx + 1]
    const nextStartMin = timeToMinutes(nextAct.startTime)
    if (newEndMin > nextStartMin) {
      const overlap = newEndMin - nextStartMin
      plans.push(shiftRange(sortedActivities, newIdx + 1, sortedActivities.length - 1, +1, +overlap, dayIndex))
    }
  }

  // ── 前方鄰居 ──
  if (newIdx > 0) {
    const prevAct = sortedActivities[newIdx - 1]
    const prevEndMin = prevAct.endTime
      ? timeToMinutes(prevAct.endTime)
      : timeToMinutes(prevAct.startTime) + (prevAct.duration ?? 60)
    if (newStartMin < prevEndMin) {
      const overlap = prevEndMin - newStartMin
      plans.push(shiftRange(sortedActivities, newIdx - 1, 0, -1, -overlap, dayIndex))
    }
  }

  return mergePlans(...plans)
}

// ── ③ 編輯：根據 before / after 比較，決定前後鄰居要不要連動 ─────────────────

/**
 * 編輯後時間調整：
 *
 * **後方鄰居**：
 * - 新 endTime > 下一個 startTime（重疊）：後續整批 +overlap 分鐘
 * - 新 endTime < 舊 endTime（提前）且原本「緊接」（gap ≤ 15min）：後續整批 +deltaEnd（負數）
 *
 * **前方鄰居**：
 * - 新 startTime < 前一個 endTime（重疊）：前面整批 -overlap 分鐘
 *
 * 其他情況（時間變動但沒造成重疊、且原本就有大空檔）：保留空檔，不動。
 *
 * @param activities - **編輯前**的活動陣列（依 startTime 排序）
 */
export function computeEditShiftOps(
  before: Activity,
  after: Activity,
  activities: Activity[],
  dayIndex: number,
): ShiftPlan {
  const editedIdx = activities.findIndex((a) => a.id === before.id)
  if (editedIdx === -1) return EMPTY_PLAN

  const oldStartMin = timeToMinutes(before.startTime)
  const oldEndMin = before.endTime
    ? timeToMinutes(before.endTime)
    : oldStartMin + (before.duration ?? 60)
  const newStartMin = timeToMinutes(after.startTime)
  const newEndMin = after.endTime
    ? timeToMinutes(after.endTime)
    : newStartMin + (after.duration ?? 60)

  const deltaEnd = newEndMin - oldEndMin

  const plans: ShiftPlan[] = []

  // ── 後方鄰居 ──
  if (editedIdx + 1 < activities.length) {
    const nextAct = activities[editedIdx + 1]
    const nextStartMin = timeToMinutes(nextAct.startTime)

    let shiftAfter = 0
    if (newEndMin > nextStartMin) {
      // 新結束時間覆蓋下一個 → 整批往後推消除重疊
      shiftAfter = newEndMin - nextStartMin
    } else if (deltaEnd < 0) {
      // 結束時間提前。看原本是否「緊接」下一個。
      const oldGap = nextStartMin - oldEndMin
      if (oldGap >= 0 && oldGap <= TIGHT_GAP_THRESHOLD_MIN) {
        // 緊接 → 後續也往前提
        shiftAfter = deltaEnd
      }
      // 否則原本有大空檔，使用者可能希望保留 → 不動
    }

    if (shiftAfter !== 0) {
      plans.push(shiftRange(activities, editedIdx + 1, activities.length - 1, +1, shiftAfter, dayIndex))
    }
  }

  // ── 前方鄰居 ──
  if (editedIdx > 0) {
    const prevAct = activities[editedIdx - 1]
    const prevEndMin = prevAct.endTime
      ? timeToMinutes(prevAct.endTime)
      : timeToMinutes(prevAct.startTime) + (prevAct.duration ?? 60)

    if (newStartMin < prevEndMin) {
      // 新開始時間早於前一個結束 → 前面整批往前提消除重疊
      const overlap = prevEndMin - newStartMin
      plans.push(shiftRange(activities, editedIdx - 1, 0, -1, -overlap, dayIndex))
    }
    // 若 newStartMin > oldStartMin（延後開始）：不主動拉前面（避免出乎意料）
  }

  return mergePlans(...plans)
}

// ── ④ 偵測現有活動陣列裡的時間衝突（給「強制修改」後提示用）─────────────────

export interface OverlapConflict {
  titleA: string
  titleB: string
  overlapMin: number
}

export function detectOverlaps(activities: Activity[]): OverlapConflict[] {
  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const out: OverlapConflict[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (!a.endTime) continue
    const aEnd = timeToMinutes(a.endTime)
    const bStart = timeToMinutes(b.startTime)
    if (aEnd > bStart) {
      out.push({ titleA: a.title, titleB: b.title, overlapMin: aEnd - bStart })
    }
  }
  return out
}
