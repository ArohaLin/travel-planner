'use client'

import { useMemo, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable,
  pointerWithin, closestCenter, type DragStartEvent, type DragEndEvent, type CollisionDetection,
  type PointerActivationConstraint,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Activity, ItineraryDay } from '@/lib/types/itinerary'
import type { PatchOp } from '@/lib/types/patch'
import { buildBlocks, applyReorder, moveBlockToDay, changedTimeIds, type Block } from '@/lib/itinerary/reschedule'

// PointerSensor 只接受滑鼠事件，避免在觸控裝置上與 TouchSensor 衝突（distance:6 太靈敏）
class MouseOnlySensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) =>
        nativeEvent.pointerType === 'mouse',
    },
  ]
}

const TYPE_ICONS: Record<string, string> = {
  sightseeing: '🏛️', food: '🍽️', shopping: '🛍️', transport: '🚌',
  experience: '🎯', nature: '🌿', rest: '😌', other: '📌',
}

interface Props {
  days: ItineraryDay[]
  initialDayIndex: number
  onApply: (ops: PatchOp[], changedCount: number) => void | Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  saving?: boolean
}

export function DragSortView({ days, initialDayIndex, onApply, onCancel, onDirtyChange, saving }: Props) {
  const [active, setActive] = useState(initialDayIndex)
  // 本地工作副本（只放有改動的天）；未改動的天讀原始 days
  const [working, setWorking] = useState<Record<number, Activity[]>>({})
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    onDirtyChange?.(Object.keys(working).length > 0)
  }, [working, onDirtyChange])

  const origOf = (di: number) => days.find((d) => d.dayIndex === di)?.activities ?? []
  const actsOf = (di: number) => working[di] ?? origOf(di)

  const sensors = useSensors(
    useSensor(MouseOnlySensor, { activationConstraint: { distance: 8 } as PointerActivationConstraint }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 10 } }),
  )

  const activeActs = actsOf(active)
  const { blocks, trailing } = useMemo(() => buildBlocks(activeActs), [activeActs])
  const changed = useMemo(() => changedTimeIds(origOf(active), activeActs), [active, activeActs]) // eslint-disable-line react-hooks/exhaustive-deps
  const blockIds = blocks.map((b) => b.place.id)
  const dragBlock = blocks.find((b) => b.place.id === dragId)

  // 變動統計（給套用按鈕）
  const dirtyDays = Object.keys(working).map(Number)
  const totalChanged = dirtyDays.reduce((sum, di) => sum + changedTimeIds(origOf(di), actsOf(di)).size, 0)

  // 碰撞偵測：先看是否落在「天數 chip」droppable，否則用列表內最近者
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args)
    const dayHit = hits.find((h) => String(h.id).startsWith('day-'))
    if (dayHit) return [dayHit]
    return closestCenter(args)
  }

  function setDay(di: number, acts: Activity[]) {
    setWorking((w) => ({ ...w, [di]: acts }))
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null)
    const placeId = String(e.active.id)
    const over = e.over
    if (!over) return
    const overId = String(over.id)

    // 跨天：拖到天數 chip
    if (overId.startsWith('day-')) {
      const target = Number(overId.slice(4))
      if (target === active) return
      const res = moveBlockToDay(actsOf(active), actsOf(target), placeId)
      if (!res) return
      setWorking((w) => ({ ...w, [active]: res.source, [target]: res.target }))
      setActive(target)
      if (navigator.vibrate) navigator.vibrate(15)
      return
    }

    // 同天重排
    if (overId === placeId) return
    const oldIndex = blockIds.indexOf(placeId)
    const newIndex = blockIds.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return
    const order = arrayMove(blockIds, oldIndex, newIndex)
    const next = applyReorder(activeActs, order)
    if (next !== activeActs) setDay(active, next)
  }

  return (
    <div className="pb-28">
      {/* 標頭 + 提示 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
          <span>⇅ 拖拉排序中</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">上下拖換順序；拖到上方天數移到別天。時間與路程會自動重算，確認後才存。</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e: DragStartEvent) => { setDragId(String(e.active.id)); if (navigator.vibrate) navigator.vibrate(10) }}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        {/* 天數 chip：拖曳時為跨天放置目標 */}
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {days.map((d) => (
            <DayDrop key={d.dayIndex} dayIndex={d.dayIndex} active={d.dayIndex === active} dragging={!!dragId} onSelect={() => !dragId && setActive(d.dayIndex)} />
          ))}
        </div>

        {/* 可拖列表 */}
        <div className="px-4">
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            {blocks.map((b) => (
              <SortableBlock key={b.place.id} block={b} changed={changed} />
            ))}
          </SortableContext>

          {/* 釘底交通卡（不參與排序）*/}
          {trailing.map((t) => (
            <div key={t.id} className="ml-9 mb-2 text-xs text-gray-400 flex items-center gap-1.5">
              <span className="tabular-nums">{t.startTime}</span><span>🚗 {t.toLabel || t.title}</span>
            </div>
          ))}

          {/* 住宿（不參與排序，僅顯示脈絡）*/}
          {days.find((d) => d.dayIndex === active)?.accommodation && (
            <div className="mt-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              🏨 住宿：{days.find((d) => d.dayIndex === active)!.accommodation!.name}（不參與排序）
            </div>
          )}
        </div>

        <DragOverlay>
          {dragBlock ? (
            <div className="rounded-xl border border-purple-300 bg-white shadow-lg px-3 py-2 flex items-center gap-2 opacity-95">
              <span>{TYPE_ICONS[dragBlock.place.type] ?? '📌'}</span>
              <span className="font-medium text-sm text-gray-900 truncate">{dragBlock.place.placeLabel || dragBlock.place.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 底部固定列：套用 / 取消 */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <button onClick={onCancel} disabled={saving} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium disabled:opacity-50">取消</button>
        <button
          onClick={() => {
            const ops: PatchOp[] = dirtyDays.map((di) => ({ op: 'update_day', dayIndex: di, payload: { activities: actsOf(di) } }))
            onApply(ops, totalChanged)
          }}
          disabled={saving || dirtyDays.length === 0}
          className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold active:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {dirtyDays.length === 0 ? '尚未調整' : `套用變更（已調整 ${totalChanged} 項時間）`}
        </button>
      </div>
    </div>
  )
}

/* ── 天數 chip（拖曳時為 droppable）─────────────────────────────────────── */
function DayDrop({ dayIndex, active, dragging, onSelect }: { dayIndex: number; active: boolean; dragging: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}` })
  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={clsx(
        'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors min-h-[40px]',
        isOver && !active ? 'bg-purple-600 text-white border-purple-600 scale-105' :
        active ? 'bg-purple-100 text-purple-700 border-purple-200' :
        dragging ? 'bg-white text-gray-500 border-dashed border-purple-300' : 'bg-gray-100 text-gray-500 border-transparent',
      )}
    >
      第 {dayIndex + 1} 天
    </button>
  )
}

/* ── 可拖的 block（前置交通卡小列 + 景點卡）───────────────────────────── */
function SortableBlock({ block, changed }: { block: Block; changed: Set<string> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.place.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const p = block.place
  const isChanged = changed.has(p.id)

  return (
    <div ref={setNodeRef} style={style} className={clsx('mb-2', isDragging && 'opacity-40')}>
      {/* 前置交通卡（小列，跟著一起搬）*/}
      {block.leading.map((t) => (
        <div key={t.id} className="ml-9 mb-1 text-xs text-gray-400 flex items-center gap-1.5">
          <span className="tabular-nums">{t.startTime}</span>
          <span>🚗 {t.toLabel ? `前往 ${t.toLabel}` : t.title}</span>
        </div>
      ))}

      {/* 景點卡（整列為拖曳把手）*/}
      <div
        {...attributes}
        {...listeners}
        style={{ touchAction: 'none' }}
        className={clsx(
          'flex items-center gap-3 rounded-xl border px-3 py-2.5 bg-white select-none cursor-grab active:cursor-grabbing',
          isChanged ? 'border-purple-300 ring-1 ring-purple-100' : 'border-gray-200',
        )}
      >
        {/* 拖拉把手圖示 */}
        <span className="text-gray-300 flex-shrink-0">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </span>
        <span className="text-lg flex-shrink-0">{TYPE_ICONS[p.type] ?? '📌'}</span>
        <div className="flex-1 min-w-0">
          <div className={clsx('text-xs tabular-nums', isChanged ? 'text-purple-600 font-semibold' : 'text-gray-500')}>
            {p.startTime}{p.endTime ? `–${p.endTime}` : ''}{isChanged && ' ·已調整'}
          </div>
          <div className="font-medium text-sm text-gray-900 truncate">{p.placeLabel || p.title}</div>
        </div>
      </div>
    </div>
  )
}
