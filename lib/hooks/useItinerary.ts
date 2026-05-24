'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Itinerary } from '@/lib/types/itinerary'
import type { MemberRole } from '@/lib/types/collaboration'

interface ItineraryState {
  itinerary: Itinerary | null
  role: MemberRole | null
  version: number
  loading: boolean
  error: string | null
  refresh: () => void
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load')
  return res.json()
}

export function useItinerary(itineraryId: string): ItineraryState {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/itinerary/${itineraryId}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const [localData, setLocalData] = useState<typeof data>(null)

  useEffect(() => {
    if (data) setLocalData(data)
  }, [data])

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`itinerary-updates:${itineraryId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'itineraries',
          filter: `id=eq.${itineraryId}`,
        },
        (payload) => {
          const newRow = payload.new as { data: Itinerary; version: number }
          setLocalData((prev: typeof data) => {
            if (!prev) return prev
            if (newRow.version > prev.version) {
              return { ...prev, data: newRow.data, version: newRow.version }
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [itineraryId])

  const current = localData ?? data

  return {
    itinerary: current?.data ?? null,
    role: current?.role ?? null,
    version: current?.version ?? 0,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  }
}
