'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Itinerary } from '@/lib/types/itinerary'
import type { MemberRole, PresenceUser, GlobalRole } from '@/lib/types/collaboration'
import { formatDateRange } from '@/lib/utils/date'
import { Avatar } from '@/components/ui/Avatar'
import { BugReportSheet, type BugReportImperativeRef } from '@/components/ui/BugReportSheet'
import { BrochureShareButton, type BrochureImperativeRef } from '@/components/brochure/BrochureShareButton'

interface ItineraryHeaderProps {
  itinerary: Itinerary
  itineraryId: string
  role: MemberRole
  onlineUsers: PresenceUser[]
  currentUser?: { displayName: string; avatarUrl: string | null; globalRole: GlobalRole } | null
}

export function ItineraryHeader({
  itinerary, itineraryId, role, onlineUsers, currentUser,
}: ItineraryHeaderProps) {
  const router = useRouter()
  const { metadata } = itinerary

  const brochureRef = useRef<BrochureImperativeRef>(null)
  const bugRef = useRef<BugReportImperativeRef>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [brochureStale, setBrochureStale] = useState(false)

  const isAdmin = currentUser?.globalRole === 'admin'
  const canManage = role === 'owner' || isAdmin

  async function handleShare() {
    const url = window.location.href
    setMoreOpen(false)
    if (navigator.share) {
      await navigator.share({ title: metadata.title, url })
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  const MAX_PRESENCE = 2
  const visibleUsers = onlineUsers.slice(0, MAX_PRESENCE)
  const extraCount = onlineUsers.length - MAX_PRESENCE

  return (
    <div
      className="bg-white sticky top-0 z-[50] border-b border-gray-100 shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        {/* 返回 */}
        <button
          onClick={() => router.push('/dashboard')}
          className="tap-target -ml-1 text-gray-500 flex-shrink-0"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* 標題 + 日期 */}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 truncate text-base leading-tight">{metadata.title}</h1>
          <p className="text-xs text-gray-400 truncate">
            {formatDateRange(metadata.startDate, metadata.endDate)}
          </p>
        </div>

        {/* Presence 頭像（最多 2 個） */}
        {visibleUsers.length > 0 && (
          <div className="flex -space-x-2 flex-shrink-0">
            {visibleUsers.map((u) => (
              <Avatar
                key={u.userId}
                name={u.displayName}
                src={u.avatarUrl}
                size="sm"
                className="ring-2 ring-white"
              />
            ))}
            {extraCount > 0 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 ring-2 ring-white">
                +{extraCount}
              </div>
            )}
          </div>
        )}

        {/* 當前使用者頭像（點進個人資料） */}
        {currentUser && (
          <Link href="/profile" className="flex-shrink-0">
            <Avatar
              name={currentUser.displayName}
              src={currentUser.avatarUrl}
              size="sm"
              className="ring-2 ring-purple-200"
            />
          </Link>
        )}

        {/* ⋯ 更多選單 */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="tap-target text-gray-500 p-1 relative"
            aria-label="更多選項"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
            {/* stale 小點：宣傳冊需更新時顯示 */}
            {brochureStale && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
            )}
          </button>

          {moreOpen && (
            <>
              <div className="fixed inset-0 z-[55]" onClick={() => setMoreOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-[60] overflow-hidden">
                {/* 宣傳冊 */}
                <button
                  onClick={() => { setMoreOpen(false); brochureRef.current?.open() }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                >
                  <span className="w-5 text-center">📖</span>
                  <span className="flex-1">{canManage ? '分享宣傳冊' : '旅程宣傳冊'}</span>
                  {brochureStale && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                </button>

                {/* 分享連結 */}
                <button
                  onClick={handleShare}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                >
                  <span className="w-5 text-center">🔗</span>
                  <span>分享行程連結</span>
                </button>

                {/* 成員管理（owner / admin） */}
                {canManage && (
                  <Link
                    href={`/itinerary/${itineraryId}/members`}
                    onClick={() => setMoreOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span className="w-5 text-center">👥</span>
                    <span>成員管理</span>
                  </Link>
                )}

                <div className="border-t border-gray-100 my-1" />

                {/* 問題回報（所有登入者） */}
                {currentUser && (
                  <button
                    onClick={() => { setMoreOpen(false); bugRef.current?.openReport() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span className="w-5 text-center">⚠️</span>
                    <span>回報問題</span>
                  </button>
                )}

                {/* 問題追蹤（管理員） */}
                {isAdmin && (
                  <button
                    onClick={() => { setMoreOpen(false); bugRef.current?.openTracker() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span className="w-5 text-center">📋</span>
                    <span>問題追蹤</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 隱藏的功能元件（由 ref 控制） */}
      <BrochureShareButton
        ref={brochureRef}
        itineraryId={itineraryId}
        canManage={canManage}
        hideTrigger
        onStaleChange={setBrochureStale}
      />
      {currentUser && (
        <BugReportSheet
          ref={bugRef}
          globalRole={currentUser.globalRole}
          hideTrigger
        />
      )}
    </div>
  )
}
