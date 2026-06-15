'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 返回鍵：優先 router.back()（退回上一筆歷史，不污染堆疊），
 * 沒有上一筆時才 push fallback。這樣整條「行程→個人資料→報告列表→報告」
 * 一路返回能正確退回原點，不會卡在中間頁。
 */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onBack() {
    startTransition(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) router.back()
      else router.push(fallback)
    })
  }

  return (
    <button
      onClick={onBack}
      disabled={isPending}
      aria-label="返回"
      className="tap-target -ml-1 text-gray-500 flex-shrink-0 disabled:opacity-60"
    >
      {isPending ? (
        <svg className="w-6 h-6 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      )}
    </button>
  )
}
