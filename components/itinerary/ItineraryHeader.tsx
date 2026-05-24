'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Itinerary } from '@/lib/types/itinerary'
import type { MemberRole, PresenceUser, GlobalRole } from '@/lib/types/collaboration'
import { formatDateRange } from '@/lib/utils/date'
import { Avatar } from '@/components/ui/Avatar'
import { BugReportSheet } from '@/components/ui/BugReportSheet'

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

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: metadata.title, url })
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div
      className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Back */}
        <button
          onClick={() => router.push('/dashboard')}
          className="tap-target -ml-1 text-gray-500 flex-shrink-0"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 truncate text-base leading-tight">{metadata.title}</h1>
          <p className="text-xs text-gray-400 truncate">
            {formatDateRange(metadata.startDate, metadata.endDate)}
          </p>
        </div>

        {/* Presence avatars */}
        {onlineUsers.length > 0 && (
          <div className="flex -space-x-2 flex-shrink-0">
            {onlineUsers.slice(0, 4).map((u) => (
              <Avatar
                key={u.userId}
                name={u.displayName}
                src={u.avatarUrl}
                size="sm"
                className="ring-2 ring-white"
              />
            ))}
            {onlineUsers.length > 4 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 ring-2 ring-white">
                +{onlineUsers.length - 4}
              </div>
            )}
          </div>
        )}

        {/* 當前使用者頭像（點擊進入 /profile） */}
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

        {/* Bug report / tracker */}
        {currentUser && (
          <div className="flex-shrink-0">
            <BugReportSheet globalRole={currentUser.globalRole} />
          </div>
        )}

        {/* More menu */}
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={handleShare} className="tap-target text-gray-500 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          </button>
          {role === 'owner' && (
            <Link href={`/itinerary/${itineraryId}/members`} className="tap-target text-gray-500 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
