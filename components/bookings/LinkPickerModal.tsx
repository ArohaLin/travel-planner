'use client'

import { useState } from 'react'
import type { Itinerary } from '@/lib/types/itinerary'

interface LinkPickerModalProps {
  itinerary: Itinerary
  standaloneId: string
  onClose: () => void
  onConfirm: (standaloneId: string, targetType: 'activity' | 'accommodation', targetId: string, dayIndex: number) => Promise<void>
}

export function LinkPickerModal({ itinerary, standaloneId, onClose, onConfirm }: LinkPickerModalProps) {
  const [selected, setSelected] = useState<{ type: 'activity' | 'accommodation'; id: string; dayIndex: number } | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    if (!selected) return
    setBusy(true)
    try {
      await onConfirm(standaloneId, selected.type, selected.id, selected.dayIndex)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[230]" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[240] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[80dvh]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">選擇要連結的行程項目</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 text-lg leading-none"
          >×</button>
        </div>

        <p className="px-4 py-2 text-xs text-gray-400">選取後，獨立預約的資料將併入行程卡，並從獨立清單移除。</p>

        {/* 景點列表 */}
        <div className="overflow-y-auto flex-1 px-4 py-2 space-y-4">
          {itinerary.days.map((day, di) => {
            const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date((day.date ?? '') + 'T00:00:00').getDay()]
            const dateStr = day.date ? `${day.date.slice(5).replace('-', '/')} 週${weekday}` : `第 ${di + 1} 天`
            const hasItems = day.activities.length > 0 || !!day.accommodation
            if (!hasItems) return null

            return (
              <div key={di}>
                <p className="text-xs text-gray-400 font-medium mb-1.5">
                  第 {di + 1} 天 · {dateStr}
                </p>
                <div className="space-y-1.5">
                  {day.activities.map((act) => {
                    const isSelected = selected?.type === 'activity' && selected.id === act.id
                    return (
                      <button
                        key={act.id}
                        onClick={() => setSelected({ type: 'activity', id: act.id, dayIndex: di })}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                          isSelected
                            ? 'border-purple-400 bg-purple-50 text-purple-900'
                            : 'border-gray-200 bg-white text-gray-800 active:bg-gray-50'
                        }`}
                      >
                        <span className="text-xs text-gray-400 mr-1.5">活動</span>
                        {act.title}
                        {act.startTime && <span className="text-xs text-gray-400 ml-1">· {act.startTime}</span>}
                      </button>
                    )
                  })}
                  {day.accommodation && (
                    (() => {
                      const acc = day.accommodation!
                      const isSelected = selected?.type === 'accommodation' && selected.id === acc.id
                      return (
                        <button
                          key={acc.id}
                          onClick={() => setSelected({ type: 'accommodation', id: acc.id, dayIndex: di })}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                            isSelected
                              ? 'border-purple-400 bg-purple-50 text-purple-900'
                              : 'border-gray-200 bg-white text-gray-800 active:bg-gray-50'
                          }`}
                        >
                          <span className="text-xs text-gray-400 mr-1.5">住宿</span>
                          {acc.name}
                        </button>
                      )
                    })()
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pt-2 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 active:bg-gray-50">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || busy}
            className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-semibold active:bg-purple-600 disabled:opacity-40"
          >
            {busy ? '處理中…' : '確認連結'}
          </button>
        </div>
      </div>
    </>
  )
}
