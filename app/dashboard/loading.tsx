/** Dashboard 載入骨架：登入後進入主頁時立即有畫面回饋（#33 配套） */
export default function DashboardLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 animate-pulse">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div className="h-6 w-28 bg-gray-200 rounded mb-1.5" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
        <div className="h-10 w-20 bg-gray-200 rounded-full" />
      </div>

      {/* 行程卡片列表 */}
      <div className="px-4 mt-4 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-4">
            <div className="h-5 w-48 bg-gray-200 rounded mb-2.5" />
            <div className="h-3 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-400 mt-6">載入中…</p>
    </div>
  )
}
