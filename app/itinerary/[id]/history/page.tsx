import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { formatRelativeTime } from '@/lib/utils/date'
import type { ItineraryChange, Profile } from '@/lib/types/collaboration'
import type { ItineraryPatch, PatchOp } from '@/lib/types/patch'
import type { Itinerary } from '@/lib/types/itinerary'

const CHANGE_TYPE_LABELS: Record<string, string> = {
  ai_patch: '🤖 AI 修改',
  manual_edit: '✏️ 手動修改',
  rollback: '↩️ 還原',
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  sightseeing: '觀光', food: '餐飲', shopping: '購物', transport: '交通',
  experience: '體驗', nature: '自然', rest: '休息', other: '其他',
}

function formatActivityTime(a: { startTime?: string; endTime?: string }): string {
  if (!a.startTime) return ''
  return a.endTime ? `${a.startTime}—${a.endTime}` : a.startTime
}

/** 比較兩個活動的欄位，回傳「改了什麼」的列表 */
function diffActivity(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const diffs: string[] = []

  if (before.title !== after.title && after.title)
    diffs.push(`名稱：「${before.title}」→「${after.title}」`)

  if (before.type !== after.type && after.type)
    diffs.push(`類別：${ACTIVITY_TYPE_LABELS[before.type as string] ?? before.type}→${ACTIVITY_TYPE_LABELS[after.type as string] ?? after.type}`)

  const beforeTime = formatActivityTime(before as { startTime?: string; endTime?: string })
  const afterTime = formatActivityTime(after as { startTime?: string; endTime?: string })
  if (beforeTime !== afterTime && afterTime)
    diffs.push(`時間：${beforeTime}→${afterTime}`)

  if (before.description !== after.description) {
    if (after.description) diffs.push(`更新說明`)
    else diffs.push(`移除說明`)
  }
  if (before.notes !== after.notes) {
    if (after.notes) diffs.push(`更新備註`)
    else diffs.push(`移除備註`)
  }
  if (before.bookingRequired !== after.bookingRequired)
    diffs.push(after.bookingRequired ? `標記需要預訂` : `移除預訂標記`)

  return diffs
}

/** 判斷一個 update_activity op 是否為「時間自動調整」（非主要操作） */
function isTimeShiftOp(op: PatchOp & { _before?: unknown; _activityTitle?: string }): boolean {
  if (op.op !== 'update_activity') return false
  // 如果有 _before，代表是主要的 edit op
  if (op._before) return false
  // 如果 payload 只有 startTime / endTime，代表是 cascade 時間調整
  const keys = Object.keys(op.payload)
  return keys.every((k) => k === 'startTime' || k === 'endTime')
}

type RichOp = PatchOp & { _before?: Record<string, unknown>; _activityTitle?: string }

interface GroupedOpsResult {
  primaryOps: RichOp[]
  shiftOps: RichOp[]
}

function splitOps(ops: PatchOp[]): GroupedOpsResult {
  const primaryOps: RichOp[] = []
  const shiftOps: RichOp[] = []
  for (const op of ops as RichOp[]) {
    if (isTimeShiftOp(op)) shiftOps.push(op)
    else primaryOps.push(op)
  }
  return { primaryOps, shiftOps }
}

interface OpDescription {
  icon: string
  main: string        // 主要動作說明
  diffs: string[]     // 差異項目（編輯時用）
  sub?: string        // 次要補充（時間、類別等）
}

function describeRichOp(op: RichOp): OpDescription {
  switch (op.op) {
    case 'add_activity': {
      const a = op.payload
      const time = formatActivityTime(a)
      const typeLabel = ACTIVITY_TYPE_LABELS[a.type ?? ''] ?? ''
      return {
        icon: '＋',
        main: `新增「${a.title ?? '活動'}」`,
        diffs: [],
        sub: [typeLabel, time].filter(Boolean).join('・'),
      }
    }

    case 'update_activity': {
      const before = op._before as Record<string, unknown> | undefined
      const after = op.payload as Record<string, unknown>

      if (before) {
        // 這是手動編輯：顯示前後差異
        const title = (after.title as string) ?? (before.title as string) ?? '活動'
        const diffs = diffActivity(before, after)
        return {
          icon: '✎',
          main: `修改「${title}」`,
          diffs,
          sub: diffs.length === 0 ? '（無可辨識的欄位變更）' : undefined,
        }
      } else {
        // AI 改的，沒有 _before：盡量從 payload 推斷
        const title = (after.title as string) ?? (op._activityTitle as string) ?? ''
        const time = formatActivityTime(after as { startTime?: string; endTime?: string })
        const parts: string[] = []
        if (after.title) parts.push(`名稱改為「${after.title}」`)
        if (time) parts.push(`時間改為 ${time}`)
        if (after.description) parts.push('更新說明')
        return {
          icon: '✎',
          main: title ? `修改「${title}」` : '修改活動',
          diffs: parts.length > 0 ? parts : [],
          sub: parts.length === 0 ? '（AI 局部更新）' : undefined,
        }
      }
    }

    case 'remove_activity': {
      const before = op._before as Record<string, unknown> | undefined
      if (before) {
        const time = formatActivityTime(before as { startTime?: string; endTime?: string })
        const typeLabel = ACTIVITY_TYPE_LABELS[before.type as string] ?? ''
        return {
          icon: '－',
          main: `刪除「${before.title}」`,
          diffs: [],
          sub: [typeLabel, time].filter(Boolean).join('・'),
        }
      }
      return { icon: '－', main: '刪除活動', diffs: [] }
    }

    case 'reorder_activities':
      return { icon: '↕', main: '重新排序活動', diffs: [] }

    case 'set_day_accommodation':
      return {
        icon: '🏨',
        main: op.payload
          ? `設定住宿「${(op.payload as { name?: string }).name ?? ''}」`
          : '移除住宿',
        diffs: [],
      }

    case 'update_day':
      return {
        icon: '📅',
        main: `更新當天設定${op.payload.theme ? `（主題：${op.payload.theme}）` : ''}`,
        diffs: [],
      }

    case 'set_metadata':
      return { icon: '📝', main: '更新行程基本資訊', diffs: [] }

    case 'add_city_transport':
      return { icon: '✈️', main: `新增 ${op.payload.fromCity} → ${op.payload.toCity} 交通`, diffs: [] }

    case 'update_city_transport':
      return { icon: '✈️', main: '更新城市間交通', diffs: [] }

    case 'remove_city_transport':
      return { icon: '✈️', main: '移除城市間交通', diffs: [] }

    default:
      return { icon: '•', main: '其他操作', diffs: [] }
  }
}

function groupOpsByDay(ops: RichOp[]): Map<number, RichOp[]> {
  const map = new Map<number, RichOp[]>()
  for (const op of ops) {
    const idx = 'dayIndex' in op ? (op.dayIndex as number) : -1
    if (!map.has(idx)) map.set(idx, [])
    map.get(idx)!.push(op)
  }
  return map
}

function getDayLabel(
  dayIndex: number,
  itinerary: Itinerary | null,
): string {
  if (dayIndex === -1) return '整體行程'
  const day = itinerary?.days.find((d) => d.dayIndex === dayIndex)
  if (!day) return `第 ${dayIndex + 1} 天`
  return `第 ${dayIndex + 1} 天・${day.city}（${day.date}）`
}

export default async function HistoryPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('itinerary_members')
    .select('role')
    .eq('itinerary_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!member) redirect('/dashboard')

  const { data: changes } = await supabase
    .from('itinerary_changes')
    .select(`
      id, change_type, description, created_at, patch,
      profiles ( id, display_name, avatar_url )
    `)
    .eq('itinerary_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Load itinerary data to get day labels
  let itinerary: Itinerary | null = null
  try {
    const serviceClient = createServiceRoleClient()
    const { data: row } = await serviceClient
      .from('itineraries')
      .select('data')
      .eq('id', params.id)
      .single()
    if (row?.data) itinerary = row.data as Itinerary
  } catch {
    // gracefully degrade — day labels will just show index
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="bg-white sticky top-0 z-10 px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center gap-3">
          <Link href={`/itinerary/${params.id}`} className="tap-target -ml-1 text-gray-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="font-semibold text-gray-900">修改歷程</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {!changes || changes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>還沒有修改記錄</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {changes.map((change, idx) => {
              const profile = change.profiles as unknown as Profile
              const patch = change.patch as ItineraryPatch
              const ops = patch?.ops ?? []

              const { primaryOps, shiftOps } = splitOps(ops)
              const groupedPrimary = groupOpsByDay(primaryOps)
              const sortedPrimaryDayIndices = Array.from(groupedPrimary.keys()).sort((a, b) => {
                if (a === -1) return -1
                if (b === -1) return 1
                return a - b
              })

              return (
                <div key={change.id} className="flex gap-3">
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-purple-400 mt-5 flex-shrink-0" />
                    {idx < changes.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gray-200 my-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-3">
                      {/* Who + when */}
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar
                          name={profile?.display_name ?? '?'}
                          src={profile?.avatar_url}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {profile?.display_name ?? '已離開的成員'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatRelativeTime(change.created_at)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {CHANGE_TYPE_LABELS[change.change_type]}
                          </span>
                        </div>
                      </div>

                      {/* Per-day breakdown (primary ops only) */}
                      {sortedPrimaryDayIndices.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {sortedPrimaryDayIndices.map((dayIdx) => {
                            const dayOps = groupedPrimary.get(dayIdx)!
                            const dayLabel = getDayLabel(dayIdx, itinerary)
                            return (
                              <div key={dayIdx} className="bg-gray-50 rounded-xl px-3 py-2">
                                <p className="text-xs font-medium text-gray-400 mb-1.5">{dayLabel}</p>
                                <ul className="flex flex-col gap-2">
                                  {dayOps.map((op, opIdx) => {
                                    const desc = describeRichOp(op)
                                    return (
                                      <li key={opIdx} className="flex flex-col gap-0.5">
                                        {/* 主動作標題 */}
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-semibold text-purple-500 w-4 flex-shrink-0 text-center">
                                            {desc.icon}
                                          </span>
                                          <span className="text-sm font-medium text-gray-800">{desc.main}</span>
                                        </div>
                                        {/* 類別/時間補充 */}
                                        {desc.sub && (
                                          <p className="text-xs text-gray-400 ml-5.5 pl-0.5">{desc.sub}</p>
                                        )}
                                        {/* 差異列表（before → after） */}
                                        {desc.diffs.length > 0 && (
                                          <ul className="ml-5 flex flex-col gap-0.5 mt-0.5">
                                            {desc.diffs.map((d, di) => (
                                              <li key={di} className="text-xs text-gray-500 flex items-start gap-1">
                                                <span className="text-gray-300 flex-shrink-0">›</span>
                                                <span>{d}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">無詳細操作記錄</p>
                      )}

                      {/* 時間自動調整摘要 */}
                      {shiftOps.length > 0 && (
                        <div className="mt-2 px-3 py-1.5 bg-blue-50 rounded-xl flex items-center gap-2">
                          <span className="text-blue-400 text-xs flex-shrink-0">⏱</span>
                          <p className="text-xs text-blue-600">
                            {`後方 ${shiftOps.length} 個活動時間自動調整：`}
                            {shiftOps
                              .map((op) => (op as RichOp)._activityTitle)
                              .filter(Boolean)
                              .slice(0, 3)
                              .join('、')}
                            {shiftOps.length > 3 ? `⋯等` : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
