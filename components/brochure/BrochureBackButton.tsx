'use client'

import { useRouter } from 'next/navigation'

/**
 * 宣傳冊浮動返回鈕。
 *
 * 公開頁是獨立全頁、沒有 App 外殼（iPhone PWA standalone 更沒有瀏覽器返回鍵），
 * 從 App 內或從訊息連結點進來的人都需要一個返回出口。
 * - 有上一頁 → 退回上一頁（回到 App 操作介面或來源頁）。
 * - 沒有上一頁（直接開新分頁）→ 退而求其次導向 App 首頁。
 */
export function BrochureBackButton() {
  const router = useRouter()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <button
      onClick={handleBack}
      aria-label="返回"
      className="fixed left-3 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-white/85 backdrop-blur-md shadow-lg text-gray-700 active:scale-95 transition-transform"
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
  )
}
