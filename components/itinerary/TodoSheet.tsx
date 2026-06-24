'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { AutoTodo, AutoTodoCategory, TodoItem } from '@/lib/types/todo'

interface TodoSheetProps {
  open: boolean
  onClose: () => void
  /** 目前仍需處理的自動提醒（已排除被標記完成/略過者）*/
  autoTodos: AutoTodo[]
  /** 已被「完成/略過」但條件仍成立的自動提醒（供恢復）*/
  resolvedAutoTodos: AutoTodo[]
  /** 手動待辦（含已完成）*/
  manualTodos: TodoItem[]
  canEdit: boolean
  onAddTodo: (title: string) => void | Promise<unknown>
  onToggleTodo: (id: string, isDone: boolean) => void | Promise<unknown>
  onEditTodo: (id: string, title: string) => void | Promise<unknown>
  onDeleteTodo: (id: string) => void | Promise<unknown>
  onResolveAuto: (key: string, isDone: boolean) => void | Promise<unknown>
  onGoDay: (dayIndex: number) => void
  onReserveActivity: (dayIndex: number, activityId: string) => void | Promise<unknown>
  onReserveLodging: (dayIndex: number) => void | Promise<unknown>
}

const CHIP: Record<AutoTodoCategory, string> = {
  reserve: 'bg-purple-50 text-purple-600',
  lodging: 'bg-purple-50 text-purple-600',
  noLodging: 'bg-teal-50 text-teal-600',
  tight: 'bg-amber-50 text-amber-600',
  pretrip: 'bg-blue-50 text-blue-600',
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={clsx(className, 'animate-spin text-purple-500')} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function TodoSheet({
  open, onClose, autoTodos, resolvedAutoTodos, manualTodos, canEdit,
  onAddTodo, onToggleTodo, onEditTodo, onDeleteTodo, onResolveAuto,
  onGoDay, onReserveActivity, onReserveLodging,
}: TodoSheetProps) {
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [busyAdd, setBusyAdd] = useState(false)
  const [busyItem, setBusyItem] = useState<{ id: string; kind: 'toggle' | 'delete' | 'edit' } | null>(null)

  if (!open) return null

  const undone = manualTodos.filter((t) => !t.isDone)
  const done = manualTodos.filter((t) => t.isDone)
  const unfinishedCount = autoTodos.length + undone.length
  const resolvedCount = done.length + resolvedAutoTodos.length

  async function add() {
    const t = newTitle.trim()
    if (!t || busyAdd) return
    setBusyAdd(true)
    try { await onAddTodo(t); setNewTitle('') } finally { setBusyAdd(false) }
  }
  async function toggle(id: string, isDone: boolean) {
    setBusyItem({ id, kind: 'toggle' })
    try { await onToggleTodo(id, isDone) } finally { setBusyItem(null) }
  }
  async function del(id: string) {
    setBusyItem({ id, kind: 'delete' })
    try { await onDeleteTodo(id) } finally { setBusyItem(null) }
  }
  async function commitEdit(item: TodoItem) {
    const v = editText.trim()
    setEditingId(null)
    if (!v || v === item.title) return
    setBusyItem({ id: item.id, kind: 'edit' })
    try { await onEditTodo(item.id, v) } finally { setBusyItem(null) }
  }
  async function restore(key: string) {
    setBusyKey(key)
    try { await onResolveAuto(key, false) } finally { setBusyKey(null) }
  }

  async function runPrimary(t: AutoTodo) {
    const p = t.primary
    if (!p) return
    if (p.kind === 'openUrl') { window.open(p.url, '_blank', 'noopener'); return }
    setBusyKey(t.key)
    try {
      if (p.kind === 'reserveActivity') await onReserveActivity(p.dayIndex, p.activityId)
      else if (p.kind === 'reserveLodging') await onReserveLodging(p.dayIndex)
      else if (p.kind === 'done') await onResolveAuto(t.key, true)
    } finally {
      setBusyKey(null)
    }
  }
  async function skip(t: AutoTodo) {
    setBusyKey(t.key)
    try { await onResolveAuto(t.key, true) } finally { setBusyKey(null) }
  }

  function renderManualRow(item: TodoItem, isDoneRow: boolean) {
    const bk = busyItem?.id === item.id ? busyItem.kind : null
    return (
      <div key={item.id} className={clsx('flex items-center gap-3 py-2.5 border-b border-gray-100', bk && 'opacity-60')}>
        {!canEdit ? (
          <span className="w-5 h-5 block rounded-md border-2 border-gray-200 flex-shrink-0" />
        ) : bk === 'toggle' ? (
          <span className="flex-shrink-0"><Spinner className="w-5 h-5" /></span>
        ) : isDoneRow ? (
          <button onClick={() => toggle(item.id, false)} disabled={!!bk} aria-label="取消完成" className="flex-shrink-0">
            <span className="w-5 h-5 flex items-center justify-center rounded-md bg-emerald-500 text-white">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </span>
          </button>
        ) : (
          <button onClick={() => toggle(item.id, true)} disabled={!!bk} aria-label="標記完成" className="flex-shrink-0">
            <span className="w-5 h-5 block rounded-md border-2 border-gray-300" />
          </button>
        )}

        {editingId === item.id ? (
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={() => commitEdit(item)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 text-sm text-gray-800 border-b border-purple-300 focus:outline-none py-0.5"
            style={{ fontSize: '16px' }}
          />
        ) : (
          <span
            onClick={() => { if (canEdit && !bk && !isDoneRow) { setEditingId(item.id); setEditText(item.title ?? '') } }}
            className={clsx('flex-1 text-sm leading-snug', isDoneRow ? 'text-gray-400 line-through' : 'text-gray-800')}
          >
            {item.title}
          </span>
        )}

        {bk === 'edit' && <Spinner className="w-4 h-4 flex-shrink-0" />}
        {canEdit && bk !== 'edit' && (
          bk === 'delete' ? (
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center"><Spinner className="w-4 h-4" /></span>
          ) : (
            <button onClick={() => del(item.id)} disabled={!!bk} aria-label="刪除" className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500">
              <XIcon />
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[200] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ height: 'calc(96dvh - env(safe-area-inset-top))', maxHeight: 'calc(96dvh - env(safe-area-inset-top))' }}
      >
        {/* 抓握條 + 標題 */}
        <div className="flex-shrink-0 px-5 pt-3 pb-2 border-b border-gray-100">
          <div className="flex justify-center mb-2"><span className="w-9 h-1 rounded-full bg-gray-300" /></div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">待辦事項</h2>
            {unfinishedCount > 0 && (
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">{unfinishedCount} 件未完成</span>
            )}
            <button onClick={onClose} aria-label="關閉" className="ml-auto w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
          {unfinishedCount === 0 && resolvedCount === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">目前沒有待辦事項 🎉</p>
          )}

          {/* 自動提醒 */}
          {autoTodos.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-1 mb-2 text-xs text-gray-400">
                <span>✨</span><span>自動提醒 · 依目前行程自動產生</span>
              </div>
              <div className="flex flex-col gap-2 mb-5">
                {autoTodos.map((t) => (
                  <div key={t.key} className="flex gap-3 p-3 border border-gray-200 rounded-2xl">
                    <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0', CHIP[t.category])}>{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{t.title}</p>
                      {t.subtitle && <p className="text-xs text-gray-500 mt-0.5">{t.subtitle}</p>}
                      {canEdit && (
                        busyKey === t.key ? (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-purple-600">
                            <Spinner className="w-3.5 h-3.5" /> 處理中…
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {t.primary && (
                              <button
                                onClick={() => runPrimary(t)}
                                className={clsx(
                                  'text-xs font-semibold px-2.5 py-1 rounded-lg',
                                  t.primary.kind === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700',
                                )}
                              >
                                {t.primary.label}
                              </button>
                            )}
                            {t.dayIndex != null && (
                              <button
                                onClick={() => { onGoDay(t.dayIndex!); onClose() }}
                                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600"
                              >
                                前往第 {t.dayIndex + 1} 天 ›
                              </button>
                            )}
                            {t.primary?.kind !== 'done' && (
                              <button onClick={() => skip(t)} className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-400">略過</button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 我的待辦 */}
          <div className="flex items-center gap-1.5 px-1 mb-1 text-xs text-gray-400">
            <span>👤</span><span>我的待辦 · 手動新增（協作者共用）</span>
          </div>

          <div className="flex flex-col">
            {undone.map((item) => renderManualRow(item, false))}
          </div>

          {/* 新增 */}
          {canEdit && (
            <div className="flex items-center gap-2 mt-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
                placeholder="新增待辦事項…"
                className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{ fontSize: '16px' }}
              />
              <button onClick={() => void add()} disabled={!newTitle.trim() || busyAdd} className="flex-shrink-0 w-[68px] py-2.5 rounded-xl bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center">
                {busyAdd ? <Spinner className="w-4 h-4 text-white" /> : '新增'}
              </button>
            </div>
          )}

          {/* 已完成 / 已略過（可恢復）*/}
          {resolvedCount > 0 && (
            <>
              <button onClick={() => setShowDone((v) => !v)} className="mt-4 text-xs text-gray-400 px-1">
                {showDone ? '隱藏' : '顯示'}已完成・已略過（{resolvedCount}）
              </button>
              {showDone && (
                <div className="flex flex-col mt-2">
                  {resolvedAutoTodos.map((t) => (
                    <div key={t.key} className="flex items-center gap-3 py-2.5 border-b border-gray-100">
                      <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 opacity-60', CHIP[t.category])}>{t.icon}</span>
                      <span className="flex-1 text-sm text-gray-400 leading-snug">{t.title}</span>
                      {canEdit && (
                        busyKey === t.key
                          ? <Spinner className="w-4 h-4 flex-shrink-0" />
                          : <button onClick={() => restore(t.key)} className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600">恢復</button>
                      )}
                    </div>
                  ))}
                  {done.map((item) => renderManualRow(item, true))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
