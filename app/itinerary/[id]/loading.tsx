/**
 * 行程頁載入骨架（#33 點進行程很久像沒反應）：
 * 1. 點擊當下立即顯示骨架，不再停在原頁面像當機
 * 2. App Router 的動態路由有 loading.tsx 才會啟用 Link 預載（prefetch 靜態外殼）
 */
export default function ItineraryLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 animate-pulse">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-5 w-40 bg-gray-200 rounded mb-1.5" />
          <div className="h-3 w-56 bg-gray-100 rounded" />
        </div>
        <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      </div>

      {/* 行程資訊卡 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl p-4">
        <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
        <div className="h-3 w-48 bg-gray-100 rounded mb-2" />
        <div className="h-3 w-36 bg-gray-100 rounded mb-2" />
        <div className="h-3 w-44 bg-gray-100 rounded" />
      </div>

      {/* 行程/地圖 Toggle */}
      <div className="px-4 mt-3">
        <div className="h-10 w-44 bg-gray-200 rounded-full" />
      </div>

      {/* 天數 tabs */}
      <div className="flex gap-2 px-4 mt-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="w-[72px] h-[72px] bg-gray-200 rounded-2xl flex-shrink-0" />
        ))}
      </div>

      {/* 活動卡片 */}
      <div className="px-4 mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 flex flex-col items-center flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-gray-300 mt-3" />
              <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
            </div>
            <div className="flex-1 bg-white rounded-2xl p-3 h-24" />
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-400 mt-6">行程載入中…</p>
    </div>
  )
}
