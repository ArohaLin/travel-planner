'use client'

import { useState, useRef } from 'react'

/**
 * 宣傳冊浮動返回鈕。
 *
 * 公開頁是獨立全頁、沒有 App 外殼（iPhone PWA standalone 更沒有瀏覽器返回鍵）。
 * - 用原生 history.back()（最快），有上一頁就退回、否則導向首頁。
 * - 按下立即給視覺回饋（縮放＋轉圈），並防連按造成退太多頁。
 */
export function BrochureBackButton() {
  const [busy, setBusy] = useState(false)
  const firedRef = useRef(false)

  function handleBack() {
    if (firedRef.current) return
    firedRef.current = true
    setBusy(true)
    // 下一個 tick 才導航，先讓回饋畫面渲染出來
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back()
      } else {
        window.location.href = '/dashboard'
      }
    }, 0)
  }

  return (
    <button
      onClick={handleBack}
      disabled={busy}
      aria-label="返回"
      className="fixed left-3 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-white/85 backdrop-blur-md shadow-lg text-gray-700 active:scale-90 transition-transform"
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      {busy ? (
        <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      )}
    </button>
  )
}
