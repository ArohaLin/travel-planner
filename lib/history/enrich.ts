import type { Itinerary, Activity } from '@/lib/types/itinerary'
import type { ItineraryPatch, AIPlanComparisonItem } from '@/lib/types/patch'

/**
 * 修改歷程強化（可讀性改版）：
 * 套用 patch 的「當下」還拿得到修改前的行程，趁此算出人話等級的差異摘要，
 * 連同 AI 方案的標題/前後比較表一起塞進存入 itinerary_changes 的 patch JSONB
 * （鍵名 _meta，不需改 DB schema；applyPatch 用的是原 patch，不受影響）。
 * 歷程頁優先顯示 _meta；舊記錄沒有 _meta 時退回原本的 op 條列。
 */

export interface DayDiff {
  dayIndex: number
  /** 整天重構（update_day 帶 activities）算出的差異 */
  added: { title: string; time: string }[]
  removed: { title: string; time: string }[]
  timeChanged: { title: string; before: string; after: string }[]
  /** 非時間欄位變更（名稱/類別/說明…），列出欄位名 */
  edited: { title: string; fields: string[] }[]
  /** 每日簡介變更 */
  theme?: { before: string; after: string }
}

export interface HistoryMeta {
  /** AI 方案標題（套用方案時） */
  planTitle?: string
  /** AI 方案的前後比較表（使用者按「確認套用」時看到的那張） */
  comparison?: AIPlanComparisonItem[]
  /** update_day 整天重構/簡介變更的真差異（每天一筆） */
  dayDiffs?: DayDiff[]
  /** set_metadata 動到的欄位（中文名） */
  metadataFields?: string[]
  /** 住宿變更（前→後名稱；before 空 = 原本沒住宿） */
  accommodations?: { dayIndex: number; before?: string; after?: string }[]
}

export type EnrichedPatch = ItineraryPatch & { _meta?: HistoryMeta }

const timeOf = (a: Partial<Activity>): string =>
  a.startTime ? (a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime) : ''

const FIELD_LABELS: Record<string, string> = {
  title: '名稱', type: '類別', description: '說明', placeLabel: '地點',
  intro: '介紹', transport: '交通說明', recommendation: '推薦', tips: '提醒',
  highlight: '注意事項', cost: '費用', location: '地址', bookingRequired: '預訂標記',
  fromLabel: '起點', toLabel: '終點', transportMode: '交通方式',
  mealType: '餐別', foodItems: '飲食項目', notes: '備註',
}

const METADATA_LABELS: Record<string, string> = {
  title: '行程名稱', startDate: '出發日期', endDate: '回程日期',
  originCity: '出發城市', returnCity: '返回城市', transitCities: '中途城市',
  preferredTransport: '交通方式', travelers: '出行人數', memberProfiles: '成員資訊',
  aiMemory: 'AI 記憶', totalBudget: '預算', destination: '目的地',
}

/** 比較整天活動陣列（以 id 配對），算出新增/刪除/時間變更/欄位變更 */
function diffDayActivities(oldActs: Activity[], newActs: Activity[]): Omit<DayDiff, 'dayIndex' | 'theme'> {
  const oldById = new Map(oldActs.map((a) => [a.id, a]))
  const newById = new Map(newActs.map((a) => [a.id, a]))

  const added = newActs
    .filter((a) => !oldById.has(a.id))
    .map((a) => ({ title: a.title, time: timeOf(a) }))
  const removed = oldActs
    .filter((a) => !newById.has(a.id))
    .map((a) => ({ title: a.title, time: timeOf(a) }))

  const timeChanged: DayDiff['timeChanged'] = []
  const edited: DayDiff['edited'] = []
  for (const newA of newActs) {
    const oldA = oldById.get(newA.id)
    if (!oldA) continue
    const tBefore = timeOf(oldA)
    const tAfter = timeOf(newA)
    if (tBefore !== tAfter) timeChanged.push({ title: newA.title, before: tBefore, after: tAfter })

    const fields: string[] = []
    for (const key of Object.keys(FIELD_LABELS)) {
      const b = (oldA as Record<string, unknown>)[key]
      const a = (newA as Record<string, unknown>)[key]
      if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) fields.push(FIELD_LABELS[key])
    }
    if (fields.length > 0) edited.push({ title: newA.title, fields })
  }
  return { added, removed, timeChanged, edited }
}

/**
 * 以「修改前的行程」為基準，為 patch 算出歷程顯示用的 _meta。
 * 回傳新物件（深拷貝 patch），不影響呼叫端後續使用原 patch。
 */
export function enrichPatchForHistory(
  before: Itinerary,
  patch: ItineraryPatch,
  plan?: { title?: string | null; comparison?: AIPlanComparisonItem[] | null },
): EnrichedPatch {
  const meta: HistoryMeta = {}
  if (plan?.title) meta.planTitle = plan.title
  if (plan?.comparison && plan.comparison.length > 0) meta.comparison = plan.comparison

  const dayDiffs: DayDiff[] = []
  const accommodations: HistoryMeta['accommodations'] = []

  for (const op of patch.ops) {
    if (op.op === 'update_day') {
      const oldDay = before.days.find((d) => d.dayIndex === op.dayIndex)
      if (!oldDay) continue
      const payload = op.payload as { activities?: Activity[]; theme?: string }
      const diff: DayDiff = { dayIndex: op.dayIndex, added: [], removed: [], timeChanged: [], edited: [] }
      let hasContent = false
      if (Array.isArray(payload.activities)) {
        Object.assign(diff, diffDayActivities(oldDay.activities, payload.activities))
        hasContent =
          diff.added.length > 0 || diff.removed.length > 0 ||
          diff.timeChanged.length > 0 || diff.edited.length > 0
      }
      if (typeof payload.theme === 'string' && payload.theme !== (oldDay.theme ?? '')) {
        diff.theme = { before: oldDay.theme ?? '', after: payload.theme }
        hasContent = true
      }
      if (hasContent) dayDiffs.push(diff)
    } else if (op.op === 'set_day_accommodation') {
      const oldDay = before.days.find((d) => d.dayIndex === op.dayIndex)
      const beforeName = oldDay?.accommodation?.name
      const afterName = (op.payload as { name?: string } | null)?.name
      if (beforeName !== afterName) {
        accommodations.push({ dayIndex: op.dayIndex, before: beforeName, after: afterName })
      }
    } else if (op.op === 'set_metadata') {
      const fields: string[] = []
      const payload = op.payload as Record<string, unknown>
      const beforeMeta = before.metadata as unknown as Record<string, unknown>
      for (const key of Object.keys(payload)) {
        if (JSON.stringify(payload[key] ?? null) !== JSON.stringify(beforeMeta[key] ?? null)) {
          fields.push(METADATA_LABELS[key] ?? key)
        }
      }
      if (fields.length > 0) meta.metadataFields = [...(meta.metadataFields ?? []), ...fields]
    }
  }

  if (dayDiffs.length > 0) meta.dayDiffs = dayDiffs
  if (accommodations.length > 0) meta.accommodations = accommodations

  const enriched: EnrichedPatch = JSON.parse(JSON.stringify(patch))
  if (Object.keys(meta).length > 0) enriched._meta = meta
  return enriched
}
