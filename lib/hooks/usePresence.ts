'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/lib/types/collaboration'

export function usePresence(
  itineraryId: string,
  currentUser: { userId: string; displayName: string; avatarUrl: string | null },
  activeDayIndex: number,
) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(null)
  const activeDayRef = useRef(activeDayIndex)

  // Keep the ref updated without re-subscribing
  useEffect(() => {
    activeDayRef.current = activeDayIndex
    // Update tracking data if already subscribed
    if (channelRef.current) {
      channelRef.current.track({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        viewingDayIndex: activeDayIndex,
      }).catch(() => {})
    }
  }, [activeDayIndex, currentUser])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel(`presence:${itineraryId}`, {
      config: { presence: { key: currentUser.userId } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const users = Object.values(state)
          .flat()
          .filter((u) => u.userId !== currentUser.userId)
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUser.userId,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl,
            viewingDayIndex: activeDayRef.current,
          })
        }
      })

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [itineraryId, currentUser.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return onlineUsers
}
