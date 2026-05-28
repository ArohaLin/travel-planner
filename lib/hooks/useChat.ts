'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/lib/types/collaboration'
import type { AIPlan } from '@/lib/types/patch'
import type { ModelProvider } from '@/lib/ai/client'

export type ChatMode = 'adjust' | 'consult'
export type { ModelProvider }

interface UseChatReturn {
  messages: ChatMessage[]
  threadId: string | null
  streamingText: string
  isStreaming: boolean
  isGeneratingPlans: boolean
  chatMode: ChatMode
  setChatMode: (mode: ChatMode) => void
  lastPlans: AIPlan[] | null
  lastPlansMessageId: string | null
  clearLastPlans: () => void
  markPlanApplied: (messageId: string, planIndex: number, planTitle: string) => void
  markPlanCancelled: (messageId: string) => void
  sendMessage: (text: string, itineraryId: string, modelProvider?: ModelProvider) => Promise<void>
  cancelStreaming: () => void
}

export function useChat(itineraryId: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isGeneratingPlans, setIsGeneratingPlans] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>('adjust')
  const [lastPlans, setLastPlans] = useState<AIPlan[] | null>(null)
  const [lastPlansMessageId, setLastPlansMessageId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Helper to extract plans array regardless of patch format (raw array or wrapped object)
  function extractPlansFromPatch(patch: unknown): AIPlan[] | null {
    if (!patch) return null
    if (Array.isArray(patch)) return patch as AIPlan[]
    const obj = patch as Record<string, unknown>
    if (Array.isArray(obj.plans)) return obj.plans as AIPlan[]
    return null
  }

  // Re-load thread & messages whenever itineraryId or chatMode changes
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Clear previous state immediately so the UI doesn't flash stale data
    setMessages([])
    setLastPlans(null)
    setLastPlansMessageId(null)
    setStreamingText('')
    setThreadId(null)

    async function loadThread() {
      // Fetch (or create) the thread for this itinerary+mode via API
      const res = await fetch(`/api/itinerary/${itineraryId}/thread?mode=${chatMode}`)
      if (!res.ok || cancelled) return

      const { threadId: tid } = await res.json() as { threadId: string }
      if (!tid || cancelled) return

      setThreadId(tid)

      // 最多載入 30 則，並以字元數為二次過濾（保留最新訊息）
      const DISPLAY_MSG_LIMIT = 30
      const DISPLAY_CHAR_LIMIT = 20000 // 超過就從最舊的開始丟棄

      const { data: allMsgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', tid)
        .order('created_at', { ascending: true })
        .limit(DISPLAY_MSG_LIMIT)

      // 字元數限制：從最新往最舊累加，超過就捨棄
      let charSum = 0
      const msgs = (allMsgs ?? []).slice().reverse().filter(m => {
        const len = (m.content ?? '').length
        if (charSum + len > DISPLAY_CHAR_LIMIT) return false
        charSum += len
        return true
      }).reverse()

      if (cancelled) return
      const typedMsgs = (msgs as ChatMessage[]) ?? []
      setMessages(typedMsgs)

      // Restore any pending plans from the most recent pending_selection message
      const pendingMsg = [...typedMsgs].reverse().find(
        (m) => m.role === 'assistant' && m.patch_status === 'pending_selection',
      )
      if (pendingMsg?.patch) {
        const plans = extractPlansFromPatch(pendingMsg.patch)
        if (plans && plans.length > 0) {
          setLastPlans(plans)
          setLastPlansMessageId(pendingMsg.id)
        }
      }

      // Subscribe to new messages via Realtime
      channel = supabase
        .channel(`chat:${tid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${tid}` },
          (payload) => {
            const msg = payload.new as ChatMessage
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
            // When the DB assistant message arrives, clear the streaming display
            if (msg.role === 'assistant') {
              setStreamingText('')
              setIsGeneratingPlans(false)
              // ── Primary source of truth for plans ──────────────────────────
              // Parsing the __DONE__ meta from the stream is unreliable (JSON can
              // be split across network chunks). Instead, read plans directly from
              // the persisted DB message — this is always complete and correct.
              if (msg.patch_status === 'pending_selection' && msg.patch) {
                const plans = extractPlansFromPatch(msg.patch)
                if (plans && plans.length > 0) {
                  console.log('[useChat] Realtime INSERT → setting lastPlans from DB message', plans.length, 'plans, msgId:', msg.id)
                  setLastPlans(plans)
                  setLastPlansMessageId(msg.id)
                }
              }
            }
          },
        )
        // Also listen for UPDATE events (e.g. when patch_status changes from pending → applied)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${tid}` },
          (payload) => {
            const msg = payload.new as ChatMessage
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
            // If the pending message was just applied/cancelled, clear lastPlans
            if (msg.patch_status === 'applied' || msg.patch_status === 'cancelled') {
              setLastPlansMessageId((prevId) => {
                if (prevId === msg.id) {
                  setLastPlans(null)
                  return null
                }
                return prevId
              })
            }
          },
        )
        .subscribe()
    }

    loadThread()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [itineraryId, chatMode])

  const sendMessage = useCallback(
    async (text: string, iId: string, modelProvider: ModelProvider = 'claude') => {
      if (!threadId || isStreaming) return

      setIsStreaming(true)
      setStreamingText('')
      setIsGeneratingPlans(false)
      setLastPlans(null)
      setLastPlansMessageId(null)

      abortRef.current = new AbortController()
      let completedSuccessfully = false

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itineraryId: iId,
            threadId,
            userMessage: text,
            mode: chatMode,
            modelProvider,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.body) throw new Error('No response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk

          // ── Check for stream-end marker ──────────────────────────────────
          const doneMarkerIdx = accumulated.indexOf('\n\n__DONE__')
          if (doneMarkerIdx !== -1) {
            const metaStr = accumulated.slice(doneMarkerIdx + '\n\n__DONE__'.length)
            const beforeDone = accumulated.slice(0, doneMarkerIdx)

            // Strip everything from <plans> onwards (complete or incomplete tag)
            const cleanedText = beforeDone
              .replace(/<plans>[\s\S]*/g, '')
              .trim()

            // Keep showing cleaned text until Realtime delivers the DB message
            setStreamingText(cleanedText)
            setIsGeneratingPlans(false)

            try {
              const meta = JSON.parse(metaStr) as { mode: string; plans: AIPlan[] | null }
              if (meta.plans && Array.isArray(meta.plans) && meta.plans.length > 0) {
                setLastPlans(meta.plans)
                // messageId will be set when the Realtime INSERT event arrives
                // for now set to null; the INSERT handler will update it if needed
              }
            } catch {
              // ignore meta parse errors
            }

            completedSuccessfully = true
            break
          }

          // ── Live streaming display ───────────────────────────────────────
          const plansStart = accumulated.indexOf('<plans>')
          if (plansStart !== -1) {
            const textBeforePlans = accumulated.slice(0, plansStart).trim()
            setStreamingText(textBeforePlans)
            setIsGeneratingPlans(true)
          } else {
            setStreamingText(accumulated.trim())
            setIsGeneratingPlans(false)
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // User cancelled — silently clean up
        } else {
          console.error('[useChat] Fetch error:', err)
          setStreamingText('[發生錯誤，請再試一次]')
        }
      } finally {
        setIsStreaming(false)
        if (!completedSuccessfully) {
          setStreamingText('')
          setIsGeneratingPlans(false)
        }
      }
    },
    [threadId, isStreaming, chatMode],
  )

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // When the Realtime INSERT fires for the assistant message, capture its ID as lastPlansMessageId
  // We do this by watching messages for a new pending_selection message after streaming
  useEffect(() => {
    if (lastPlans && !lastPlansMessageId) {
      const pendingMsg = [...messages].reverse().find(
        (m) => m.role === 'assistant' && m.patch_status === 'pending_selection',
      )
      if (pendingMsg) {
        setLastPlansMessageId(pendingMsg.id)
      }
    }
  }, [messages, lastPlans, lastPlansMessageId])

  // Optimistically update a message to applied state (don't wait for Realtime UPDATE)
  const markPlanApplied = useCallback(
    (messageId: string, planIndex: number, planTitle: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const existingPlans = extractPlansFromPatch(m.patch) ?? []
          return {
            ...m,
            patch_status: 'applied',
            patch: { plans: existingPlans, selectedPlanIndex: planIndex, selectedPlanTitle: planTitle },
          }
        }),
      )
      setLastPlans(null)
      setLastPlansMessageId(null)
    },
    [],
  )

  const markPlanCancelled = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, patch_status: 'cancelled' } : m)),
    )
    setLastPlans(null)
    setLastPlansMessageId(null)
  }, [])

  const clearLastPlans = useCallback(() => {
    setLastPlans(null)
    setLastPlansMessageId(null)
  }, [])

  return {
    messages,
    threadId,
    streamingText,
    isStreaming,
    isGeneratingPlans,
    chatMode,
    setChatMode,
    lastPlans,
    lastPlansMessageId,
    clearLastPlans,
    markPlanApplied,
    markPlanCancelled,
    sendMessage,
    cancelStreaming,
  }
}
