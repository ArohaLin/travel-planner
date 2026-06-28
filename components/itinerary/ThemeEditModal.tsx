'use client'

import { useState } from 'react'

interface ThemeEditModalProps {
  dayNumber: number
  initialTheme: string
  onSave: (theme: string) => void
  onClose: () => void
}

/** 編輯每日簡介（day.theme）的小型輸入視窗 */
export function ThemeEditModal({ dayNumber, initialTheme, onSave, onClose }: ThemeEditModalProps) {
  const [theme, setTheme] = useState(initialTheme)

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
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 text-base">編輯每日簡介</h2>
            <p className="text-xs text-gray-400 mt-0.5">第 {dayNumber} 天</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            autoFocus
            rows={3}
            placeholder="簡短描述這天的重點，例如：太魯閣晨遊＋花蓮娘家午餐＋六十石山金針花，夜宿台東"
            className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="px-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-gray-600 border border-gray-200 rounded-2xl">取消</button>
          <button
            onClick={() => onSave(theme.trim())}
            className="flex-1 py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl active:scale-95 transition-transform"
          >
            儲存
          </button>
        </div>
      </div>
    </>
  )
}
