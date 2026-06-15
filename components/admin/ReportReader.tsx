'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { DevReport } from '@/lib/reports'

/**
 * 開發報告閱讀器（iPhone 16 Pro 優化）：react-markdown + remark-gfm，
 * 以自訂元件對應 Tailwind 樣式，行寬、字級、間距都依手機調校；表格可橫向捲動。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const components: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mt-6 mb-3 leading-snug">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-gray-900 mt-7 mb-3 pt-4 border-t border-gray-200 leading-snug">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-[15px] font-semibold text-purple-700 mt-5 mb-2 leading-snug">{children}</h3>,
  p: ({ children }) => <p className="text-[15px] leading-relaxed text-gray-700 my-2.5">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2.5 space-y-1.5 marker:text-gray-300">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2.5 space-y-1.5 marker:text-gray-400">{children}</ol>,
  li: ({ children }) => <li className="text-[15px] leading-relaxed text-gray-700">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="text-gray-500">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline break-all">{children}</a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-purple-200 bg-purple-50/40 pl-3 pr-2 py-1 my-3 text-[13.5px] text-gray-500 leading-relaxed rounded-r">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-gray-200" />,
  // 內聯 code 用淺色膠囊；含換行（程式區塊）則交給 <pre> 的深色框
  code: ({ children }) => {
    const txt = String(children)
    if (txt.includes('\n')) return <code className="text-[13px]">{children}</code>
    return <code className="bg-gray-100 text-purple-700 px-1.5 py-0.5 rounded text-[0.85em] break-words">{children}</code>
  },
  pre: ({ children }) => (
    <pre className="bg-gray-900 text-gray-100 rounded-xl p-3 my-3 overflow-x-auto text-[13px] leading-relaxed scroll-touch">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 scroll-touch -mx-1 px-1">
      <table className="w-full text-[13px] border border-gray-200 rounded-lg overflow-hidden">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="bg-gray-50 text-gray-500 font-medium px-2 py-1.5 text-left border-b border-gray-200 whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 border-b border-gray-100 text-gray-700 align-top">{children}</td>,
}

export function ReportReader({ report }: { report: DevReport }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // 內文已有 H1 標題 → 移除首個 H1，避免與頁首重複
  const body = report.content.replace(/^\s*#\s+.*\n/, '')

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => startTransition(() => router.push('/admin/reports'))}
            disabled={isPending}
            className="tap-target -ml-1 text-gray-500 flex-shrink-0 disabled:opacity-60"
            aria-label="返回報告列表"
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
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 text-[15px] leading-tight truncate">{report.title}</h1>
            <p className="text-xs text-gray-400">
              {[report.category, report.date].filter(Boolean).join('・')}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <article className="px-4 py-3 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
        <Markdown remarkPlugins={[remarkGfm]} components={components}>{body}</Markdown>
      </article>
    </div>
  )
}
