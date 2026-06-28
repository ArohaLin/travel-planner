'use client'

import { useState } from 'react'

// 底部列預覽（S1 目標：6 顆常駐）
function BottomBarPreview({ badge }: { badge: Record<string, number> }) {
  const buttons = [
    {
      key: 'explore',
      label: '探索',
      badge: 0,
      color: 'text-gray-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.8 9.2 11 11 9.2 14.8 13 13Z" />
        </svg>
      ),
    },
    {
      key: 'wishlist',
      label: '願望',
      badge: 0,
      color: 'text-gray-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5C6 16.5 3.5 13 3.5 9.5 3.5 7 5.5 5.2 7.8 5.2c1.6 0 3 .9 4.2 2.6 1.2-1.7 2.6-2.6 4.2-2.6 2.3 0 4.3 1.8 4.3 4.3 0 3.5-2.5 7-8.5 11Z" />
        </svg>
      ),
    },
    {
      key: 'todo',
      label: '待辦',
      badge: badge.todo ?? 3,
      badgeColor: 'bg-red-500',
      color: 'text-gray-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      key: 'shopping',
      label: '採購',
      badge: badge.shopping ?? 5,
      badgeColor: 'bg-amber-500',
      color: 'text-gray-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      key: 'booking',
      label: '預約',
      badge: badge.booking ?? 2,
      badgeColor: 'bg-red-500',
      color: 'text-gray-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
          <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
          <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      ),
    },
    {
      key: 'add',
      label: '新增',
      badge: 0,
      color: 'text-purple-600',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
  ]

  return (
    <div className="bg-white border-t border-black/5 flex items-stretch" style={{ paddingBottom: '20px' }}>
      {buttons.map((btn) => (
        <button
          key={btn.key}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${btn.color} active:bg-gray-50 relative`}
        >
          <div className="relative">
            {btn.icon}
            {btn.badge > 0 && (
              <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 ${btn.badgeColor} text-white text-[10px] font-semibold rounded-full flex items-center justify-center ring-2 ring-white`}>
                {btn.badge > 99 ? '99+' : btn.badge}
              </span>
            )}
          </div>
          <span className="text-[11px]">{btn.label}</span>
        </button>
      ))}
    </div>
  )
}

// 全螢幕 Sheet 框架預覽
function FullscreenSheetPreview({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-gray-900/10 flex items-center justify-center text-gray-600 hover:bg-gray-900/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-4xl mb-2">📋</p>
          <p className="text-sm">全螢幕 Sheet 內容區</p>
          <p className="text-xs mt-1">height: 100dvh ✓</p>
        </div>
      </div>
    </div>
  )
}

export default function DevUIPage() {
  const [iPhoneWidth, setIPhoneWidth] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [openSheet, setOpenSheet] = useState<string | null>(null)
  const [badge] = useState({ todo: 3, shopping: 5, booking: 2 })

  const sheets = [
    'ChatSheet', 'TodoSheet', 'ShoppingSheet', 'BookingSheet（新）',
    'ExploreSheet', 'WeatherDetailSheet', 'ActivityDetailModal',
    'ActivityEditModal', 'AccommodationDetailModal', 'AccommodationEditModal',
    'BugReportSheet', 'RecDetailModal', 'AINotesSheet',
  ]

  return (
    <div className={darkMode ? 'dark bg-gray-950 text-white min-h-screen' : 'bg-gray-100 min-h-screen'}>
      {/* 控制列 */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-2 flex flex-wrap gap-2 items-center text-sm">
        <button
          onClick={() => setIPhoneWidth((v) => !v)}
          className={`px-3 py-1 rounded-full border text-xs font-medium ${iPhoneWidth ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}
        >
          {iPhoneWidth ? '📱 iPhone 16 Pro (393px)' : '🖥 全寬'}
        </button>
        <button
          onClick={() => setDarkMode((v) => !v)}
          className={`px-3 py-1 rounded-full border text-xs font-medium ${darkMode ? 'bg-gray-800 text-white border-gray-700' : 'border-gray-300 text-gray-600'}`}
        >
          {darkMode ? '🌙 深色' : '☀️ 淺色'}
        </button>
        <span className="text-gray-400 text-xs">← 控制列（截圖時可忽略）</span>
      </div>

      <div className="flex justify-center py-6">
        <div
          style={{ width: iPhoneWidth ? 393 : '100%', maxWidth: '100%' }}
          className="relative"
        >
          {/* ── 底部列預覽 ── */}
          <section className="mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
              底部操作列（6 顆常駐）
            </div>
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border">
              {/* 模擬行程內容區 */}
              <div className="p-4 h-24 flex items-center justify-center text-gray-300 text-sm border-b">
                行程卡片內容區...
              </div>
              <BottomBarPreview badge={badge} />
            </div>
            <div className="text-xs text-gray-400 mt-1 px-2">
              ✓ 6 顆 / ✓ 徽章（待辦{badge.todo}、採購{badge.shopping}、預約{badge.booking}）/ ✓ 每顆寬度 ≈ {Math.round(393 / 6)}px
            </div>
          </section>

          {/* ── 全螢幕 Sheet 觸發 ── */}
          <section className="mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
              全螢幕 Sheet（點任一驗高度）
            </div>
            <div className="grid grid-cols-2 gap-2 px-2">
              {sheets.map((s) => (
                <button
                  key={s}
                  onClick={() => setOpenSheet(s)}
                  className="bg-white text-gray-700 text-xs py-2 px-3 rounded-lg border shadow-sm active:bg-gray-50 text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          {/* ── 尺寸參考 ── */}
          <section className="px-2 mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              尺寸參考
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border text-xs text-gray-600 space-y-1">
              <div>iPhone 16 Pro 寬：<strong>393px</strong>（螢幕寬；CSS px）</div>
              <div>底部列每顆寬：<strong>≈65px</strong>（393/6）</div>
              <div>安全區底部：<strong>env(safe-area-inset-bottom) ≈ 34px</strong></div>
              <div>全螢幕高度：<strong>100dvh</strong>（dynamic viewport）</div>
              <div>最小點擊目標：<strong>44×44px</strong></div>
            </div>
          </section>
        </div>
      </div>

      {/* 全螢幕 Sheet 覆蓋 */}
      {openSheet && (
        <FullscreenSheetPreview title={openSheet} onClose={() => setOpenSheet(null)} />
      )}
    </div>
  )
}
