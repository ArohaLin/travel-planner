/**
 * /admin 區載入提示：進入「開發報告」時，layout 會先在伺服器端驗證管理員身分，
 * 這層讓導航當下立即有「載入中」回饋，不會像沒反應。
 */
export default function AdminLoading() {
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-3 bg-white rounded-2xl shadow-lg border border-purple-100 px-6 py-4">
        <svg className="w-7 h-7 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-base font-semibold text-purple-700">載入中…</span>
      </div>
    </div>
  )
}
