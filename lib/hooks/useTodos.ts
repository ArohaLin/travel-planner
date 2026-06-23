'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { mapTodo, type TodoItem } from '@/lib/types/todo'

/**
 * 待辦資料 hook：抓取本行程的 todo（手動待辦 + 自動提醒覆蓋記號），
 * 訂閱 Realtime 即時同步給協作者，並提供操作函式（皆 POST 後重抓）。
 */
export function useTodos(itineraryId: string) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/todos`, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setTodos((j.todos ?? []) as TodoItem[])
      }
    } catch {
      /* 靜默：保留現有資料 */
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => { void refetch() }, [refetch])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const ch = supabase
      .channel(`todos:${itineraryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todo_items', filter: `itinerary_id=eq.${itineraryId}` },
        () => { void refetch() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [itineraryId, refetch])

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch(`/api/itinerary/${itineraryId}/todos`, {
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
    todos,
    loading,
    refetch,
    addTodo: (title: string) => post({ action: 'add', title }),
    toggleTodo: (id: string, isDone: boolean) => post({ action: 'toggle', id, isDone }),
    editTodo: (id: string, title: string) => post({ action: 'edit', id, title }),
    deleteTodo: (id: string) => post({ action: 'delete', id }),
    resolveAuto: (autoKey: string, isDone: boolean) => post({ action: 'resolveAuto', autoKey, isDone }),
  }
}

export { mapTodo }
