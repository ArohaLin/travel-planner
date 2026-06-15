/**
 * 個人資料載入骨架：按「個人資料」後立即有畫面回饋。
 * 管理員的 /profile 會在伺服器端查全部使用者＋全部行程，可能要等一下，
 * 沒有這層就會「按了像沒反應」。
 */
export default function ProfileLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 animate-pulse" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="h-6 w-6 bg-gray-200 rounded" />
        <div className="h-6 w-24 bg-gray-200 rounded" />
      </div>

      {/* 個人資料卡 */}
      <div className="px-4 mt-4 space-y-3">
        <div className="bg-white rounded-2xl p-5 flex items-center gap-4">
          <div className="h-16 w-16 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
        </div>
        {/* 區塊骨架 */}
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-5">
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-3 w-full bg-gray-100 rounded mb-2" />
            <div className="h-3 w-2/3 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* 置中明顯載入提示 */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
        <div className="flex items-center gap-3 bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-purple-100 px-6 py-4">
          <svg className="w-7 h-7 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-base font-semibold text-purple-700">載入中…</span>
        </div>
      </div>
    </div>
  )
}
