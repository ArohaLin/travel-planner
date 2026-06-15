import Link from 'next/link'
import { REPORTS } from '@/lib/reports'
import { BackButton } from '@/components/admin/BackButton'

export default function ReportsListPage() {
  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center gap-3">
          <BackButton fallback="/profile" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 text-base leading-tight">開發報告</h1>
            <p className="text-xs text-gray-400">僅管理員可見</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {REPORTS.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">目前沒有報告</div>
        ) : (
          REPORTS.map((r) => (
            <Link
              key={r.slug}
              href={`/admin/reports/${r.slug}`}
              className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-4 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                {r.category && (
                  <span className="text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                    {r.category}
                  </span>
                )}
                {r.date && <span className="text-[11px] text-gray-400">{r.date}</span>}
              </div>
              <h2 className="font-semibold text-gray-900 text-[15px] leading-snug">{r.title}</h2>
              {r.summary && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.summary}</p>}
            </Link>
          ))
        )}
      </main>
    </div>
  )
}
