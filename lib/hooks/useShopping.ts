'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ShoppingItem, StoreRef } from '@/lib/types/shopping'

export interface ShoppingFields {
  name: string
  quantity?: string | null
  note?: string | null
  stores?: StoreRef[]
  dayIndexes?: number[]
}

/**
 * 採購清單 hook：抓取本行程的 shopping_items、訂閱 Realtime 即時同步、提供操作函式。
 * 比照 useTodos：任何遠端變更就 refetch 整份清單。
 */
export function useShopping(itineraryId: string) {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/shopping`, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setItems((j.items ?? []) as ShoppingItem[])
      }
    } catch {
      /* 靜默：保留現有資料 */
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => { void refetch() }, [refetch])

  // Realtime：本行程的 shopping_items 任何變更 → 重抓
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const ch = supabase
      .channel(`shopping:${itineraryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `itinerary_id=eq.${itineraryId}` },
        () => { void refetch() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [itineraryId, refetch])

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch(`/api/itinerary/${itineraryId}/shopping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        await refetch()
        return res.ok
      } catch {
        return false
      }
    },
    [itineraryId, refetch],
  )

  return {
    items,
    loading,
    refetch,
    addItem: (f: ShoppingFields) => post({ action: 'add', ...f }),
    toggleItem: (id: string, isDone: boolean) => post({ action: 'toggle', id, isDone }),
    editItem: (id: string, f: ShoppingFields) => post({ action: 'edit', id, ...f }),
    deleteItem: (id: string) => post({ action: 'delete', id }),
  }
}
