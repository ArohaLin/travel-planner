'use client'

import { useState } from 'react'
import type { AINote } from '@/lib/hooks/useAINotes'

interface AINotesSheetProps {
  notes: AINote[]
  isSubmitting: boolean
  onUpdateNote: (id: string, note: string) => void
  onRemoveNote: (id: string) => void
  onClearAll: () => void
  /** 送出給 AI（帶整體想法）；實際 AI 呼叫由父層處理 */
  onSubmit: (overallThought: string) => void
  onClose: () => void
}

export function AINotesSheet({
  notes, isSubmitting, onUpdateNote, onRemoveNote, onClearAll, onSubmit, onClose,
}: AINotesSheetProps) {
  const [overall, setOverall] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  // 依天分組
  const byDay = new Map<number, AINote[]>()
  for (const n of notes) {
    if (!byDay.has(n.dayIndex)) byDay.set(n.dayIndex, [])
    byDay.get(n.dayIndex)!.push(n)
  }
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b)

  function startEdit(n: AINote) {
    setEditingId(n.id)
    setEditText(n.note)
  }
  function saveEdit() {
    if (editingId) onUpdateNote(editingId, editText)
    setEditingId(null)
    setEditText('')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl sheet-enter flex flex-col"
        style={{ height: '82vh', maxHeight: 'calc(100vh - env(safe-area-inset-top) - 20px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">
            AI 備註籃 <span className="text-sm text-gray-400">({notes.length})</span>
          </h2>
          {/* #35：清空（紅色+垃圾桶）與關閉（灰色圓鈕）做出明顯區隔，拉開距離 */}
          <div className="flex items-center gap-4">
            {notes.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-sm text-red-500 border border-red-200 bg-red-50 rounded-full px-3 py-1.5 active:bg-red-100 min-h-[36px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                清空全部
              </button>
            )}
            <button
              onClick={onClose}
              title="關閉"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto scroll-touch px-4 py-4">
          {notes.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm font-medium text-gray-500 mb-1">備註籃是空的</p>
              <p className="text-xs text-gray-400">
                在行程的景點卡點「✎ 備註」鈕，<br />把想法收集起來，最後一次交給 AI
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sortedDays.map((dayIndex) => (
                <div key={dayIndex}>
                  <p className="text-xs font-semibold text-purple-500 mb-2">第 {dayIndex + 1} 天</p>
                  <div className="flex flex-col gap-2">
                    {byDay.get(dayIndex)!.map((n) => (
                      <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                        <p className="text-xs text-gray-500 mb-1">📍 {n.activityTitle}</p>
                        {editingId === n.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={2}
                              autoFocus
                              className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => { setEditingId(null); setEditText('') }} className="text-xs text-gray-500 px-3 py-1.5">取消</button>
                              <button onClick={saveEdit} className="text-xs font-medium text-white bg-amber-500 rounded-lg px-3 py-1.5">儲存</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-800 leading-relaxed flex-1 whitespace-pre-wrap">{n.note}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => startEdit(n)} title="編輯" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 hover:bg-white">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                              <button onClick={() => onRemoveNote(n.id)} title="刪除" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-white">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer：整體想法 + 送出 */}
        {notes.length > 0 && (
          <div
            className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <textarea
              value={overall}
              onChange={(e) => setOverall(e.target.value)}
              placeholder="補充整體想法（選填）：例如希望步調更輕鬆、預算再省一點..."
              rows={2}
              className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
            />
            <button
              onClick={() => onSubmit(overall)}
              disabled={isSubmitting}
              className="w-full py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl active:scale-[0.99] transition-transform disabled:opacity-50"
            >
              {isSubmitting ? '正在送出給 AI...' : `送出 ${notes.length} 則備註給 AI 重新規劃`}
            </button>
          </div>
        )}
      </div>

      {/* 清空確認 */}
      {confirmClear && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[60] backdrop-blur-sm" onClick={() => setConfirmClear(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
              <div className="text-3xl text-center mb-3">🗑️</div>
              <h3 className="font-semibold text-gray-900 text-center mb-2">清空所有備註？</h3>
              <p className="text-sm text-gray-500 text-center mb-5">此動作無法復原</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmClear(false)} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-2xl">取消</button>
                <button
                  onClick={() => { onClearAll(); setConfirmClear(false) }}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-2xl"
                >
                  清空
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
