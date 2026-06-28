'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Booking } from '@/lib/types/booking'
import { mapBooking } from '@/lib/types/booking'

interface UseBookingsResult {
  bookings: Booking[]
  canEdit: boolean
  loading: boolean
  error: string | null
  addBooking: (data: Partial<Booking>) => Promise<Booking | null>
  editBooking: (id: string, data: Partial<Booking>) => Promise<boolean>
  deleteBooking: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useBookings(itineraryId: string): UseBookingsResult {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(null)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/bookings`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setBookings(json.bookings ?? [])
      setCanEdit(json.canEdit ?? false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  // 訂閱 Realtime
  useEffect(() => {
    fetchBookings()

    const supabase = getSupabaseBrowserClient()
    const ch = supabase
      .channel(`bookings:${itineraryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `itinerary_id=eq.${itineraryId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBookings((prev) => {
              if (prev.some((b) => b.id === payload.new.id)) return prev
              return [...prev, mapBooking(payload.new)].sort(byDate)
            })
          } else if (payload.eventType === 'UPDATE') {
            setBookings((prev) => prev.map((b) => b.id === payload.new.id ? mapBooking(payload.new) : b))
          } else if (payload.eventType === 'DELETE') {
            setBookings((prev) => prev.filter((b) => b.id !== payload.old.id))
          }
        },
      )
      .subscribe()

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [itineraryId, fetchBookings])

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/itinerary/${itineraryId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  const addBooking = useCallback(async (data: Partial<Booking>): Promise<Booking | null> => {
    try {
      const json = await post({ action: 'add', ...toBody(data) })
      return json.booking ?? null
    } catch { return null }
  }, [itineraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  const editBooking = useCallback(async (id: string, data: Partial<Booking>): Promise<boolean> => {
    try {
      await post({ action: 'edit', id, ...toBody(data) })
      return true
    } catch { return false }
  }, [itineraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteBooking = useCallback(async (id: string): Promise<boolean> => {
    try {
      await post({ action: 'delete', id })
      return true
    } catch { return false }
  }, [itineraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { bookings, canEdit, loading, error, addBooking, editBooking, deleteBooking, refresh: fetchBookings }
}

function byDate(a: Booking, b: Booking): number {
  const da = a.date ?? ''
  const db = b.date ?? ''
  return da < db ? -1 : da > db ? 1 : 0
}

function toBody(data: Partial<Booking>): Record<string, unknown> {
  return {
    title: data.title,
    type: data.type,
    status: data.status,
    date: data.date,
    endDate: data.endDate,
    time: data.time,
    cost: data.cost,
    depositPaid: data.depositPaid,
    bookingPlatform: data.bookingPlatform,
    orderNumber: data.orderNumber,
    bookingUrl: data.bookingUrl,
    freeCancelBy: data.freeCancelBy,
    contact: data.contact,
    notes: data.notes,
  }
}
