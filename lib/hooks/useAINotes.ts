'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * AI 備註功能：使用者邊看行程邊針對特定景點記下想法，
 * 最後一次性提交給 AI 重新規劃。備註為「草稿」性質，存 localStorage，
 * 每個行程各自獨立（key = ai-notes-{itineraryId}）。提交並套用後清空。
 */

export interface AINote {
  /** 唯一 id（用 activityId + 時間戳，允許同景點多筆） */
  id: string
  /** 對應的活動 id */
  activityId: string
  /** 第幾天（0-based） */
  dayIndex: number
  /** 景點名稱（快照，方便顯示與提交，不必回查行程） */
  activityTitle: string
  /** 備註內容 */
  note: string
  createdAt: number
}

function storageKey(itineraryId: string) {
  return `ai-notes-${itineraryId}`
}

function loadNotes(itineraryId: string): AINote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(itineraryId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AINote[]) : []
  } catch {
    return []
  }
}

function saveNotes(itineraryId: string, notes: AINote[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(itineraryId), JSON.stringify(notes))
  } catch {
    /* localStorage 滿了或被禁用 → 忽略，至少 session 內可用 */
  }
}

export interface UseAINotesReturn {
  notes: AINote[]
  /** 新增一筆備註 */
  addNote: (params: { activityId: string; dayIndex: number; activityTitle: string; note: string }) => void
  /** 更新某筆備註內容 */
  updateNote: (id: string, note: string) => void
  /** 刪除某筆備註 */
  removeNote: (id: string) => void
  /** 清空全部 */
  clearNotes: () => void
  /** 某活動是否已有備註 */
  hasNoteFor: (activityId: string) => boolean
}

export function useAINotes(itineraryId: string): UseAINotesReturn {
  const [notes, setNotes] = useState<AINote[]>([])

  // 初次載入 + 切換行程時，從 localStorage 讀取
  useEffect(() => {
    setNotes(loadNotes(itineraryId))
  }, [itineraryId])

  // 跨分頁同步（其他分頁改了同一行程的備註時更新）
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === storageKey(itineraryId)) {
        setNotes(loadNotes(itineraryId))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [itineraryId])

  const persist = useCallback(
    (next: AINote[]) => {
      setNotes(next)
      saveNotes(itineraryId, next)
    },
    [itineraryId],
  )

  const addNote = useCallback(
    (params: { activityId: string; dayIndex: number; activityTitle: string; note: string }) => {
      const trimmed = params.note.trim()
      if (!trimmed) return
      const newNote: AINote = {
        id: `${params.activityId}-${Date.now()}`,
        activityId: params.activityId,
        dayIndex: params.dayIndex,
        activityTitle: params.activityTitle,
        note: trimmed,
        createdAt: Date.now(),
      }
      persist([...notes, newNote])
    },
    [notes, persist],
  )

  const updateNote = useCallback(
    (id: string, note: string) => {
      const trimmed = note.trim()
      persist(
        notes
          .map((n) => (n.id === id ? { ...n, note: trimmed } : n))
          .filter((n) => n.note.length > 0), // 清空內容視同刪除
      )
    },
    [notes, persist],
  )

  const removeNote = useCallback(
    (id: string) => {
      persist(notes.filter((n) => n.id !== id))
    },
    [notes, persist],
  )

  const clearNotes = useCallback(() => {
    persist([])
  }, [persist])

  const hasNoteFor = useCallback(
    (activityId: string) => notes.some((n) => n.activityId === activityId),
    [notes],
  )

  return { notes, addNote, updateNote, removeNote, clearNotes, hasNoteFor }
}

/**
 * 把備註清單 + 整體想法組合成提交給 AI 的結構化訊息。
 */
export function composeNotesMessage(notes: AINote[], overallThought: string): string {
  const byDay = new Map<number, AINote[]>()
  for (const n of notes) {
    if (!byDay.has(n.dayIndex)) byDay.set(n.dayIndex, [])
    byDay.get(n.dayIndex)!.push(n)
  }

  const lines: string[] = ['我針對以下景點有調整想法，請一併考量重新規劃行程：', '']
  for (const dayIndex of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    for (const n of byDay.get(dayIndex)!) {
      lines.push(`【第${dayIndex + 1}天・${n.activityTitle}】${n.note}`)
    }
  }

  const overall = overallThought.trim()
  if (overall) {
    lines.push('', `（整體想法）${overall}`)
  }

  return lines.join('\n')
}
