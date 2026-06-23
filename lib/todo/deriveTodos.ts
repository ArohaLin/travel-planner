import type { Itinerary } from '@/lib/types/itinerary'
import type { AutoTodo } from '@/lib/types/todo'
import { effectiveReservation } from '@/lib/itinerary/reservation'
import { scanBufferWarnings } from '@/lib/maps/bufferScan'

/**
 * 從目前行程「即時」算出自動提醒（不存內容；以 key 為穩定識別）。純函式、可測試。
 * 5 類（依使用者選擇）：
 *  1. 活動「需要預訂」但未預訂
 *  2. 住宿「需要預訂」但未預訂（住宿預設視為需要預訂，使用者可改無需/已預訂）
 *  3. 有夜晚沒安排住宿（最後一天除外）
 *  4. 某天路程偏緊、恐遲到（重用 scanBufferWarnings 的 redDays）
 *  5. 出發前倒數提醒（依 metadata.startDate 與今天）
 */

const dayNum = (i: number) => i + 1

function daysBetween(fromISO: string, toISO: string): number | null {
  const a = Date.parse(`${fromISO}T00:00:00Z`)
  const b = Date.parse(`${toISO}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/** 住宿的有效預約狀態：未設定時預設「需要預訂」（住宿通常都要訂）。 */
export function effectiveLodgingReservation(
  reservationStatus?: 'none' | 'needed' | 'reserved',
): 'none' | 'needed' | 'reserved' {
  return reservationStatus ?? 'needed'
}

export function deriveAutoTodos(itin: Itinerary, todayISO?: string): AutoTodo[] {
  const todos: AutoTodo[] = []
  const days = itin.days ?? []
  const lastIndex = days.length ? Math.max(...days.map((d) => d.dayIndex)) : 0

  for (const day of days) {
    const n = dayNum(day.dayIndex)

    // 1. 活動需訂未訂
    for (const a of day.activities) {
      if (a.type === 'transport') continue
      if (effectiveReservation(a) === 'needed') {
        todos.push({
          key: `reserve-act:${a.id}`,
          category: 'reserve',
          icon: '📅',
          title: `預訂：${a.placeLabel?.trim() || a.title}`,
          subtitle: `第 ${n} 天 · 需要預訂`,
          dayIndex: day.dayIndex,
          primary: { label: '標已預訂', kind: 'reserveActivity', dayIndex: day.dayIndex, activityId: a.id },
        })
      }
    }

    // 2. 住宿需訂未訂 / 3. 有夜晚沒安排住宿
    const acc = day.accommodation
    if (acc) {
      if (effectiveLodgingReservation(acc.reservationStatus) === 'needed') {
        todos.push({
          key: `reserve-lodging:${day.dayIndex}`,
          category: 'lodging',
          icon: '🏨',
          title: `預訂住宿：${acc.name}`,
          subtitle: `第 ${n} 晚`,
          dayIndex: day.dayIndex,
          primary: { label: '標已預訂', kind: 'reserveLodging', dayIndex: day.dayIndex },
        })
      }
    } else if (day.dayIndex < lastIndex) {
      todos.push({
        key: `no-lodging:${day.dayIndex}`,
        category: 'noLodging',
        icon: '🏠',
        title: `第 ${n} 晚還沒安排住宿`,
        subtitle: '點「前往」去這天安排',
        dayIndex: day.dayIndex,
      })
    }
  }

  // 4. 路程偏緊（紅色警示）
  for (const di of scanBufferWarnings(itin).redDays) {
    todos.push({
      key: `tight:${di}`,
      category: 'tight',
      icon: '⚠️',
      title: `第 ${dayNum(di)} 天有路程恐遲到的銜接`,
      subtitle: '建議調整時間或順序',
      dayIndex: di,
    })
  }

  // 5. 出發前倒數提醒
  const start = itin.metadata?.startDate
  if (start && todayISO) {
    const d = daysBetween(todayISO, start)
    if (d != null && d >= 0) {
      if (d <= 7) {
        todos.push({
          key: 'pretrip:weather',
          category: 'pretrip',
          icon: '🌤️',
          title: '出發前查看天氣預報',
          subtitle: d === 0 ? '今天出發' : `距出發 ${d} 天`,
          primary: { label: '完成', kind: 'done' },
        })
      }
      if (d <= 1) {
        todos.push({
          key: 'pretrip:pack',
          category: 'pretrip',
          icon: '🧳',
          title: '確認所有預訂、打包行李',
          subtitle: '出發前最後確認',
          primary: { label: '完成', kind: 'done' },
        })
      }
    }
  }

  return todos
}
