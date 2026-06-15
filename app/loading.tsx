/** 根路由等待畫面：client-side 導向到 / 時由 Suspense 顯示（等待 auth 檢查與 redirect） */
export default function RootLoading() {
  return (
    <div
      className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center gap-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <span className="text-5xl leading-none select-none">✈️</span>
      <h1 className="text-xl font-semibold text-gray-800 tracking-tight">旅程規劃</h1>
      <div className="mt-3">
        <svg className="w-8 h-8 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    </div>
  )
}
