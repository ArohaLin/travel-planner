import { produce } from 'immer'
import type { Itinerary } from '@/lib/types/itinerary'
import type { ItineraryPatch, PatchOp } from '@/lib/types/patch'

export class PatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatchError'
  }
}

function applyOp(draft: Itinerary, op: PatchOp): void {
  switch (op.op) {
    case 'set_metadata': {
      Object.assign(draft.metadata, op.payload)
      break
    }

    case 'update_day': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      // If payload includes activities, replace the full activities array;
      // otherwise just merge other day-level fields.
      const payload = op.payload as Partial<typeof day>
      if (payload.activities !== undefined) {
        day.activities = payload.activities
        const { activities: _a, ...rest } = payload
        Object.assign(day, rest)
        day.travelSig = undefined // 序列變 → 路段過期：移動列退概估、背景重算
      } else {
        Object.assign(day, payload)
      }
      break
    }

    case 'set_day_accommodation': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      day.accommodation = op.payload ?? undefined
      day.travelSig = undefined // 住宿是當天路線終點 → 過期
      break
    }

    case 'add_activity': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      if (day.activities.some((a) => a.id === op.payload.id)) {
        throw new PatchError(`活動 ID "${op.payload.id}" 已存在`)
      }
      day.activities.push(op.payload)
      // Sort by startTime after adding
      day.activities.sort((a, b) => a.startTime.localeCompare(b.startTime))
      day.travelSig = undefined // 新增點 → 過期
      break
    }

    case 'update_activity': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      const idx = day.activities.findIndex((a) => a.id === op.activityId)
      if (idx === -1) throw new PatchError(`找不到活動 ID "${op.activityId}"`)
      const target = day.activities[idx]
      const oldTitle = target.title
      // 時間鎖定防護：鎖定卡的 startTime/endTime/duration 不可被 AI/自動修正覆蓋。
      // 唯一例外：payload 同時帶 timeLocked:false（使用者在編輯視窗手動解鎖），視為本人有意解鎖並修改。
      const payload = (target.timeLocked && (op.payload as { timeLocked?: boolean }).timeLocked !== false)
        ? (({ startTime: _s, endTime: _e, duration: _d, ...rest }) => rest)(op.payload as Record<string, unknown>) as typeof op.payload
        : op.payload
      const p = payload as Partial<typeof target>
      Object.assign(target, payload)
      // #13：若活動換成不同地點（title 改變）但 payload 沒帶新的 location，
      // 清掉舊座標，避免「正氣路夜市卻顯示知本溫泉座標」這類錯誤；地圖會自動重新定位。
      const payloadHasLocation = (op.payload as { location?: unknown }).location !== undefined
      if (op.payload.title && op.payload.title !== oldTitle && !payloadHasLocation) {
        target.location = undefined
      }
      // Re-sort if time changed
      day.activities.sort((a, b) => a.startTime.localeCompare(b.startTime))
      // 影響路線的欄位變動（座標/識別名/時間/類型）→ 路段過期
      if (p.location !== undefined || p.title !== undefined || p.placeLabel !== undefined || p.startTime !== undefined || p.type !== undefined) {
        day.travelSig = undefined
      }
      break
    }

    case 'remove_activity': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      const idx = day.activities.findIndex((a) => a.id === op.activityId)
      if (idx === -1) throw new PatchError(`找不到活動 ID "${op.activityId}"`)
      day.activities.splice(idx, 1)
      day.travelSig = undefined // 移除點 → 過期
      break
    }

    case 'reorder_activities': {
      const day = draft.days[op.dayIndex]
      if (!day) throw new PatchError(`找不到第 ${op.dayIndex + 1} 天`)
      const byId = new Map(day.activities.map((a) => [a.id, a]))
      const reordered = op.orderedIds.map((id) => {
        const a = byId.get(id)
        if (!a) throw new PatchError(`找不到活動 ID "${id}"`)
        return a
      })
      day.activities = reordered
      day.travelSig = undefined // 重排 → 過期
      break
    }

    case 'add_city_transport': {
      if (draft.cityTransports.some((t) => t.id === op.payload.id)) {
        throw new PatchError(`交通 ID "${op.payload.id}" 已存在`)
      }
      draft.cityTransports.push(op.payload)
      break
    }

    case 'update_city_transport': {
      const idx = draft.cityTransports.findIndex((t) => t.id === op.transportId)
      if (idx === -1) throw new PatchError(`找不到交通 ID "${op.transportId}"`)
      Object.assign(draft.cityTransports[idx], op.payload)
      break
    }

    case 'remove_city_transport': {
      const idx = draft.cityTransports.findIndex((t) => t.id === op.transportId)
      if (idx === -1) throw new PatchError(`找不到交通 ID "${op.transportId}"`)
      draft.cityTransports.splice(idx, 1)
      break
    }

    default:
      throw new PatchError(`未知操作類型`)
  }
}

export function applyPatch(itinerary: Itinerary, patch: ItineraryPatch): Itinerary {
  return produce(itinerary, (draft) => {
    for (const op of patch.ops) {
      applyOp(draft, op)
    }
    draft.lastModifiedAt = new Date().toISOString()
    draft.version = itinerary.version + 1
  })
}
