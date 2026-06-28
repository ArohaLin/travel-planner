'use client'

import { useEffect, useState } from 'react'
import { toMin, fromMin } from '@/lib/itinerary/reschedule'

/**
 * 出發地卡片的時間編輯視窗：先按編輯鈕才開啟，改完按「確認」才生效（避免在卡片上誤觸）。
 * - 整理行李開始＝出發地卡片「起始」（純記錄，不動其它活動）
 * - 出發時間＝當天第一個行程的開始（改了當天行程往後順移重算）
 */
export function DepartureEditModal({
  open,
  prepStart,
  departTime,
  onClose,
  onSave,
}: {
  open: boolean
  prepStart: string
  departTime: string
  onClose: () => void
  onSave: (prepStart: string, departTime: string) => void
}) {
  const [s, setS] = useState(prepStart)
  const [e, setE] = useState(departTime)
  useEffect(() => {
    if (open) { setS(prepStart); setE(departTime) }
  }, [open, prepStart, departTime])

  if (!open) return null

  // 整理行李開始永遠 ≤ 出發時間（區間不可顛倒）
  function onPrepChange(v: string) {
    const vm = toMin(v), em = toMin(e)
    setS(vm != null && em != null && vm > em ? e : v)
  }
  function onDepChange(v: string) {
    setE(v)
    const vm = toMin(v), sm = toMin(s)
    // 出發提早到比整理開始還早 → 整理開始跟著往前（維持預設 90 分窗）
    if (vm != null && (sm == null || sm > vm)) setS(fromMin(Math.max(0, vm - 90)))
  }

  const inputCls =
    'mt-1 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-purple-400'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800">編輯出發地時間</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 -mr-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          「出發時間」就是當天第一個行程的開始；調整後當天行程會往後順移。
        </p>

        <label className="block mb-3">
          <span className="text-sm text-gray-600">整理行李開始</span>
          <input type="time" value={s} onChange={(ev) => onPrepChange(ev.target.value)} className={inputCls} />
        </label>

        <label className="block mb-5">
          <span className="text-sm text-gray-600">出發時間（當天第一個行程）</span>
          <input type="time" value={e} onChange={(ev) => onDepChange(ev.target.value)} className={inputCls} />
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium active:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(s, e)}
            className="flex-1 py-2.5 rounded-xl bg-purple-500 text-white font-semibold active:bg-purple-600"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
