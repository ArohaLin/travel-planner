import type { Activity } from '@/lib/types/itinerary'
import { haversineKm } from '@/lib/explore/placement'

/**
 * 拖拉重排的「規則自動重算時間」引擎（無 AI、純函式、可單元測試）。
 *
 * 設計重點（與使用者確認的選擇一致）：
 * - 交通卡（type='transport'）不可獨立拖；以「block＝前置交通卡* + 一張景點卡」為拖拉單位，
 *   交通卡跟著所屬景點一起搬與重算。
 * - 重排只「順移後面」：被異動到的最早位置之前，時間原封不動；從該位置起往後逐項堆疊。
 * - 路程時間：有交通卡就用交通卡自己的時長；兩景點直接相鄰（無交通卡）則用座標 haversine 估，
 *   未變動的相鄰對則沿用原本空檔（避免無謂改動）。寫入後 RoutePrefetcher 會以真實 Google 路程刷新。
 */

const MAX_MIN = 23 * 60 + 59

export const toMin = (t?: string): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}
export const fromMin = (x: number): string => {
  const v = Math.max(0, Math.min(Math.round(x), MAX_MIN))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

const hasCoord = (a?: Activity): boolean =>
  !!a?.location && (a.location.lat !== 0 || a.location.lng !== 0)

const isTransport = (a?: Activity): boolean => a?.type === 'transport'

/** 預設活動時長（分）：有 start/end 用差值，其次 duration 欄位，否則依類型給合理預設。 */
export function inferDurationMin(a: Activity): number {
  const s = toMin(a.startTime)
  const e = toMin(a.endTime)
  if (s != null && e != null && e > s) return e - s
  if (a.duration && a.duration > 0) return Math.round(a.duration)
  if (isTransport(a)) return 20
  switch (a.type) {
    case 'sightseeing':
    case 'nature':
    case 'experience':
      return 90
    case 'food':
    case 'shopping':
      return 60
    case 'rest':
      return 45
    default:
      return 60
  }
}

/** 兩景點直接相鄰（無交通卡）時的路程緩衝估計（分）。 */
export function estimateTravelMin(prev: Activity, cur: Activity): number {
  if (hasCoord(prev) && hasCoord(cur)) {
    const km = haversineKm(prev.location!.lat, prev.location!.lng, cur.location!.lat, cur.location!.lng)
    // 市區開車 ~30km/h + 3 分基底，向上取 5 分，最少 5 分、最多 180 分
    const mins = (km / 30) * 60 + 3
    return Math.min(180, Math.max(5, Math.ceil(mins / 5) * 5))
  }
  return 15 // 無座標退而求其次
}

// ── Block 模型 ──────────────────────────────────────────────────────────────

export interface Block {
  /** 景點卡（draggable 單位的代表；以其 id 當 key） */
  place: Activity
  /** 這張景點卡之前的交通卡（移動列），跟著一起搬 */
  leading: Activity[]
}

/** 切成 blocks ＋ 釘在最後的 trailing 交通卡（最後一張景點之後殘留者，如「返回民宿休息」）。 */
export function buildBlocks(activities: Activity[]): { blocks: Block[]; trailing: Activity[] } {
  const blocks: Block[] = []
  let buf: Activity[] = []
  for (const a of activities) {
    if (isTransport(a)) {
      buf.push(a)
    } else {
      blocks.push({ place: a, leading: buf })
      buf = []
    }
  }
  return { blocks, trailing: buf }
}

export function flatten(blocks: Block[], trailing: Activity[]): Activity[] {
  const out: Activity[] = []
  for (const b of blocks) {
    out.push(...b.leading, b.place)
  }
  out.push(...trailing)
  return out
}

// ── 原始空檔指紋（未變動相鄰對沿用，避免無謂改動）────────────────────────────

const pairKey = (prevId: string, curId: string) => `${prevId}${curId}`

function buildGapHint(original: Activity[]): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 1; i < original.length; i++) {
    const prev = original[i - 1]
    const cur = original[i]
    const pe = toMin(prev.endTime ?? prev.startTime)
    const cs = toMin(cur.startTime)
    if (pe != null && cs != null && cs - pe > 0) m.set(pairKey(prev.id, cur.id), cs - pe)
  }
  return m
}

/** 相鄰兩活動之間應留的緩衝（分）。 */
function bufferMin(prev: Activity, cur: Activity, gapHint: Map<string, number>): number {
  // 交通卡本身就是移動時間 → 不另加緩衝（緊接）
  if (isTransport(prev) || isTransport(cur)) return 0
  // 未變動的相鄰對：沿用原本空檔，避免改到使用者/AI 原本安排
  const hinted = gapHint.get(pairKey(prev.id, cur.id))
  if (hinted != null) return hinted
  return estimateTravelMin(prev, cur)
}

/**
 * 從 fromIndex 起逐項重算 start/end（之前的原封不動）。回新陣列（不可變）。
 * gapHint：以原始陣列算出的「未變動相鄰對」空檔，供 bufferMin 沿用。
 * anchorStartMin：當 fromIndex===0（無前項可接）時，當天的起跑時間（通常＝原本第一個活動的開始），
 *   讓「把較晚的卡片拖到最前」時整天仍維持原起跑時間、而非沿用該卡自己的晚時間。
 */
export function recomputeTimes(
  activities: Activity[],
  fromIndex: number,
  gapHint: Map<string, number>,
  anchorStartMin?: number | null,
): Activity[] {
  if (fromIndex < 0 || fromIndex >= activities.length) return activities
  const out = activities.map((a) => ({ ...a }))
  // 錨點：fromIndex 之前的最後一項結束時間
  for (let i = fromIndex; i < out.length; i++) {
    const cur = out[i]
    let start: number
    if (i === 0) {
      start = anchorStartMin ?? toMin(cur.startTime) ?? 9 * 60 // 全天第一項：用當天起跑時間
    } else {
      const prev = out[i - 1]
      const prevEnd = toMin(prev.endTime) ?? toMin(prev.startTime) ?? 9 * 60
      start = prevEnd + bufferMin(prev, cur, gapHint)
    }
    const dur = inferDurationMin(cur)
    cur.startTime = fromMin(start)
    cur.endTime = fromMin(start + dur)
    // 交通卡校正：toLabel 對齊「下一張景點」、清掉常寫錯的 fromLabel（DayView 以上一張卡當起點）
    if (isTransport(cur)) {
      const nextPlace = out.slice(i + 1).find((a) => !isTransport(a))
      if (nextPlace) cur.toLabel = nextPlace.placeLabel?.trim() || nextPlace.title
      cur.fromLabel = undefined
    }
  }
  return out
}

/** 第一個 id 不同的位置（順序變動起點）；完全相同回 -1。 */
function firstDivergence(before: Activity[], after: Activity[]): number {
  const n = Math.min(before.length, after.length)
  for (let i = 0; i < n; i++) if (before[i].id !== after[i].id) return i
  if (before.length !== after.length) return n
  return -1
}

/**
 * 同天重排：依新的 block 順序（orderedPlaceIds）重組並只順移後面。
 * 回新的 activities 陣列；若順序沒變回原陣列（同參考）。
 */
export function applyReorder(original: Activity[], orderedPlaceIds: string[]): Activity[] {
  const { blocks, trailing } = buildBlocks(original)
  const byId = new Map(blocks.map((b) => [b.place.id, b]))
  const reordered: Block[] = []
  for (const id of orderedPlaceIds) {
    const b = byId.get(id)
    if (b) reordered.push(b)
  }
  // 保險：補上任何漏掉的 block（理論上不會）
  for (const b of blocks) if (!orderedPlaceIds.includes(b.place.id)) reordered.push(b)

  const next = flatten(reordered, trailing)
  const from = firstDivergence(original, next)
  if (from === -1) return original
  return recomputeTimes(next, from, buildGapHint(original), toMin(original[0]?.startTime))
}

/**
 * 跨天移動：把 placeId 的景點從 source 移到 target。
 * - source：移除該 block（含其前置交通卡），從移除點起重算。
 * - target：把「景點本身」插在「離它最近的現有景點之後」（無座標則插最後），從插入點起重算。
 *   跨天會丟棄被移動 block 的前置交通卡（那是來源天脈絡的移動）；新的一段由緩衝估計＋RoutePrefetcher 補。
 */
export function moveBlockToDay(
  source: Activity[],
  target: Activity[],
  placeId: string,
): { source: Activity[]; target: Activity[]; movedTitle: string } | null {
  const sb = buildBlocks(source)
  const idx = sb.blocks.findIndex((b) => b.place.id === placeId)
  if (idx === -1) return null
  const moved = sb.blocks[idx].place

  // 來源天：移除該 block
  const remaining = sb.blocks.filter((_, i) => i !== idx)
  const newSource = flatten(remaining, sb.trailing)
  const sFrom = firstDivergence(source, newSource)
  const recomputedSource =
    sFrom === -1 ? newSource : recomputeTimes(newSource, sFrom, buildGapHint(source), toMin(source[0]?.startTime))

  // 目標天：找最近景點插在其後
  const tb = buildBlocks(target)
  let insertAt = tb.blocks.length // 預設插最後
  if (hasCoord(moved) && tb.blocks.length > 0) {
    let best = Infinity
    let bestI = -1
    tb.blocks.forEach((b, i) => {
      if (!hasCoord(b.place)) return
      const d = haversineKm(moved.location!.lat, moved.location!.lng, b.place.location!.lat, b.place.location!.lng)
      if (d < best) { best = d; bestI = i }
    })
    if (bestI >= 0) insertAt = bestI + 1
  }
  const newBlocks = [...tb.blocks]
  newBlocks.splice(insertAt, 0, { place: { ...moved }, leading: [] })
  const newTarget = flatten(newBlocks, tb.trailing)
  const tFrom = firstDivergence(target, newTarget)
  const recomputedTarget =
    tFrom === -1 ? newTarget : recomputeTimes(newTarget, tFrom, buildGapHint(target), toMin(target[0]?.startTime))

  return { source: recomputedSource, target: recomputedTarget, movedTitle: moved.placeLabel?.trim() || moved.title }
}

/**
 * 刪除一個活動並重排當天時間（同天）。
 * - 刪「景點」：連同它的前置交通卡（block 的 leading）一起刪；剩餘 block 從異動點起重排，
 *   後面活動時間自動往前接、剩餘交通卡標籤對齊正確的下一站。
 * - 刪「交通卡」：只移除那一張，再從異動點起重排。
 * 回傳新的 activities 陣列；找不到目標或沒變動則回原陣列（同參考）。
 *
 * 路線/移動資訊：景點被刪 → 路線指紋（travelSig）改變 → RoutePrefetcher 會自動重算 travelLegs，
 * 故此函式只負責「活動陣列與時間」，不需處理 travelLegs。
 */
export function deletePlace(activities: Activity[], id: string): Activity[] {
  const idx = activities.findIndex((a) => a.id === id)
  if (idx < 0) return activities
  const target = activities[idx]

  let next: Activity[]
  if (isTransport(target)) {
    next = activities.filter((a) => a.id !== id) // 刪交通卡：只移除這一張
  } else {
    const { blocks, trailing } = buildBlocks(activities) // 刪景點：移除整個 block（景點＋前置交通卡）
    next = flatten(blocks.filter((b) => b.place.id !== id), trailing)
  }
  if (next.length === activities.length) return activities // 沒刪到任何東西

  const from = firstDivergence(activities, next)
  if (from === -1) return next
  return recomputeTimes(next, Math.max(0, from), buildGapHint(activities), toMin(activities[0]?.startTime))
}

/** 回傳 start/end 有變動的活動 id 集合（給預覽高亮與「已調整 N 項」文案）。 */
export function changedTimeIds(before: Activity[], after: Activity[]): Set<string> {
  const prev = new Map(before.map((a) => [a.id, a]))
  const changed = new Set<string>()
  for (const a of after) {
    const b = prev.get(a.id)
    if (!b || b.startTime !== a.startTime || b.endTime !== a.endTime) changed.add(a.id)
  }
  return changed
}
