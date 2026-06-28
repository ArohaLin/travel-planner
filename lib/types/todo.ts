/** 待辦事項型別。 */

/** DB 中的一筆 todo（手動待辦，或自動提醒的「已處理」覆蓋記號）。 */
export interface TodoItem {
  id: string
  itineraryId: string
  kind: 'manual' | 'auto'
  autoKey: string | null
  title: string | null
  isDone: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type AutoTodoCategory = 'reserve' | 'lodging' | 'noLodging' | 'tight' | 'pretrip' | 'freeCancelBy'

/** 自動提醒（即時從行程算出，不存內容；以 key 為穩定識別）。 */
export interface AutoTodo {
  /** 穩定鍵（覆蓋記號用），如 reserve-act:<activityId> */
  key: string
  category: AutoTodoCategory
  /** 顯示用 emoji */
  icon: string
  title: string
  subtitle?: string
  /** 有值 → 顯示「前往」可跳到那天 */
  dayIndex?: number
  /** 主要動作鈕（沒有則只有「前往／略過」）*/
  primary?: AutoTodoPrimary
}

export type AutoTodoPrimary =
  | { label: string; kind: 'reserveActivity'; dayIndex: number; activityId: string }
  | { label: string; kind: 'reserveLodging'; dayIndex: number }
  | { label: string; kind: 'openUrl'; url: string }
  | { label: string; kind: 'done' } // 純提醒：按了＝標記完成（寫覆蓋記號）

/** map DB row → TodoItem（snake → camel）。 */
export function mapTodo(r: Record<string, unknown>): TodoItem {
  return {
    id: String(r.id),
    itineraryId: String(r.itinerary_id),
    kind: (r.kind as 'manual' | 'auto') ?? 'manual',
    autoKey: (r.auto_key as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    isDone: !!r.is_done,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }
}
