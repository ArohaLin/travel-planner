'use client'

import { useState } from 'react'

interface AddNoteModalProps {
  activityTitle: string
  onSave: (note: string) => void
  onClose: () => void
}

/** 針對單一景點新增 AI 備註的小型輸入框 */
export function AddNoteModal({ activityTitle, onSave, onClose }: AddNoteModalProps) {
  const [note, setNote] = useState('')

  function handleSave() {
    const t = note.trim()
    if (!t) return
    onSave(t)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-base">新增 AI 備註</h2>
          <p className="text-xs text-gray-400 mt-0.5">📍 {activityTitle}</p>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
            rows={3}
            placeholder="寫下你對這個景點的想法，例如：想多留 1 小時、想換成在地小吃、這天太趕想拿掉..."
            className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <p className="text-xs text-gray-400 mt-2">備註會收進「備註籃」，稍後可一次交給 AI 重新規劃</p>
        </div>
        <div className="px-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-gray-600 border border-gray-200 rounded-2xl">取消</button>
          <button
            onClick={handleSave}
            disabled={!note.trim()}
            className="flex-1 py-3 text-sm font-semibold text-white bg-amber-500 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
          >
            加入備註籃
          </button>
        </div>
      </div>
    </>
  )
}
