'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/lib/types/collaboration'
import type { AIPlan } from '@/lib/types/patch'
import type { ModelProvider } from '@/lib/ai/client'
import { saveLastAIInfo } from '@/lib/hooks/useLastAIInfo'
import type { AIResultInfo } from '@/lib/ai/pricing'

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
  queueMessage: (text: string, modelProvider?: ModelProvider) => void
  cancelStreaming: () => void
  /** 重新從 DB 抓最新訊息並還原待選方案（開啟視窗/回前景時呼叫，補救行動裝置斷線漏接） */
  refreshMessages: () => void
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
  // 待送訊息佇列：threadId 尚未就緒時先暫存，ready 後自動送出（給 AI 備註籃用）
  const [pendingMessage, setPendingMessage] = useState<{ text: string; model: ModelProvider } | null>(null)

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

      // 字元數限制：從最新往最舊累加，超過就停止往更舊收（但「絕不丟棄較新的訊息」）。
      // 舊版用 filter：若某一則特別長（例如殘缺 JSON）會被整則丟掉 → 對話看起來「突然消失」。
      // 改為一旦超量就 break，保證最新對話一定保留。
      let charSum = 0
      const msgs: typeof allMsgs = []
      for (const m of (allMsgs ?? []).slice().reverse()) {
        msgs.push(m)
        charSum += (m.content ?? '').length
        if (charSum > DISPLAY_CHAR_LIMIT) break
      }
      msgs.reverse()

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
              // 真實 user 訊息到達 → 移除同內容的樂觀暫存，避免重複顯示
              const base =
                msg.role === 'user'
                  ? prev.filter((m) => !(m.id.startsWith('optimistic-') && m.content === msg.content))
                  : prev
              return [...base, msg]
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

  // ── 補救式重新載入 ─────────────────────────────────────────────────────────
  // 行動裝置鎖屏/切 App 時，串流 fetch 與 Realtime websocket 都可能中斷；
  // 伺服器端其實已把 AI 回應（含待選方案）存進 DB，但前端漏接、畫面上什麼都沒有。
  // 從 DB 重新抓最新訊息並還原 pending_selection 方案。

  // 最新 isStreaming（給 visibilitychange 監聽器用，避免閉包抓到舊值）
  const isStreamingRef = useRef(false)
  useEffect(() => { isStreamingRef.current = isStreaming }, [isStreaming])

  // 真正的重載（無防護）：呼叫端自行決定時機
  const reloadFromDb = useCallback(() => {
    if (!threadId) return
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        if (!data) return
        const typedMsgs = data as ChatMessage[]
        setMessages(typedMsgs)
        // 清掉可能殘留的串流畫面狀態（DB 已存好的回覆才是正確結果）
        setStreamingText('')
        setIsGeneratingPlans(false)
        const pendingMsg = [...typedMsgs].reverse().find(
          (m) => m.role === 'assistant' && m.patch_status === 'pending_selection',
        )
        if (pendingMsg?.patch) {
          const plans = extractPlansFromPatch(pendingMsg.patch)
          if (plans && plans.length > 0) {
            setLastPlans(plans)
            setLastPlansMessageId(pendingMsg.id)
            return
          }
        }
        // 沒有待選方案（可能已在他處套用/取消）→ 清掉殘留狀態
        setLastPlans(null)
        setLastPlansMessageId(null)
      })
  }, [threadId])

  // reloadFromDb 的 ref：讓 visibilitychange 監聽器不需隨 threadId 重裝，
  // 消滅「舊監聽器剛移除、新監聽器尚未掛上」時 visibilitychange 被整個漏掉的空窗期。
  const reloadFromDbRef = useRef(reloadFromDb)
  useEffect(() => { reloadFromDbRef.current = reloadFromDb }, [reloadFromDb])

  // 開啟視窗/手動補載：串流進行中不打擾（避免蓋掉正在串流的畫面）
  const refreshMessages = useCallback(() => {
    if (isStreaming) return
    reloadFromDb()
  }, [isStreaming, reloadFromDb])

  // 頁面回到前景（手機解鎖/切回 App）時自動補救
  // 重點：背景化會讓串流 fetch 卡死、isStreaming 卡在 true。若仍沿用「isStreaming 就跳過」
  // 會永遠補不回來 → 這裡先中止已失效的串流、清掉串流畫面狀態，再「無條件」從 DB 重載，
  // 確保 AI 已存進 DB 的回覆與待選方案不會「消失」。
  // 使用 ref 版本的 reloadFromDb（而非直接依賴 reloadFromDb）→ 效果不重裝，消滅空窗期。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isStreamingRef.current) {
        // 背景期間串流必定失效 → 丟掉它，改用伺服器已存好的 DB 結果
        abortRef.current?.abort()
        setIsStreaming(false)
        setStreamingText('')
        setIsGeneratingPlans(false)
      }
      reloadFromDbRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // 空 deps：只裝一次，透過 ref 拿最新的 reloadFromDb，消滅空窗期

  const sendMessage = useCallback(
    async (text: string, iId: string, modelProvider: ModelProvider = 'claude') => {
      if (!threadId || isStreaming) return

      setIsStreaming(true)
      setStreamingText('')
      setIsGeneratingPlans(false)
      setLastPlans(null)
      setLastPlansMessageId(null)

      // 樂觀顯示自己送出的訊息：原本要等 Realtime 回傳才看得到，
      // 行動裝置一送完就切背景時會漏接 → 畫面看起來「訊息不見了」。
      // 先以暫時 id 顯示，真實訊息（同內容）由 Realtime 送達時再替換。
      const optimisticId = `optimistic-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          thread_id: threadId,
          user_id: null,
          role: 'user',
          content: text,
          patch: null,
          patch_status: 'none',
          created_at: new Date().toISOString(),
        },
      ])

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
              const meta = JSON.parse(metaStr) as { mode: string; plans: AIPlan[] | null; aiInfo?: AIResultInfo }
              if (meta.plans && Array.isArray(meta.plans) && meta.plans.length > 0) {
                setLastPlans(meta.plans)
                // messageId will be set when the Realtime INSERT event arrives
                // for now set to null; the INSERT handler will update it if needed
              }
              // 記錄最近一次 AI 回傳資訊
              if (meta.aiInfo) saveLastAIInfo(meta.aiInfo)
            } catch {
              // ignore meta parse errors
            }

            completedSuccessfully = true
            break
          }

          // ── Live streaming display ───────────────────────────────────────
          // <memory> 區塊（#15）不顯示給使用者，從 <memory> 起截斷
          const memStart = accumulated.indexOf('<memory>')
          const plansStart = accumulated.indexOf('<plans>')
          if (plansStart !== -1) {
            const textBeforePlans = accumulated.slice(0, plansStart).trim()
            setStreamingText(textBeforePlans)
            setIsGeneratingPlans(true)
          } else {
            const cut = memStart !== -1 ? accumulated.slice(0, memStart) : accumulated
            setStreamingText(cut.trim())
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

      // 串流完成：主動從 DB 補載，確保 assistant message 進 messages 陣列。
      // 原本依賴 Realtime INSERT，但手機背景期間 WebSocket 可能斷線、INSERT 被漏接。
      // 伺服器在送 __DONE__ 之前已把訊息存入 DB，這裡 400ms 延遲讓 Realtime 有機會先到
      // （避免兩者競爭時多一次無謂的 DB 讀）；若 Realtime 已到，重載只是冪等覆蓋。
      if (completedSuccessfully) {
        setTimeout(() => reloadFromDbRef.current(), 400)
      }
    },
    [threadId, isStreaming, chatMode],
  )

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // 佇列一則訊息（不論 threadId 是否就緒）；ready 後由下方 effect 自動送出
  const queueMessage = useCallback((text: string, model: ModelProvider = 'claude') => {
    setChatMode('adjust')
    setPendingMessage({ text, model })
  }, [])

  // threadId 就緒且非串流中時，自動送出待送訊息
  useEffect(() => {
    if (!pendingMessage || !threadId || isStreaming) return
    const { text, model } = pendingMessage
    setPendingMessage(null)
    sendMessage(text, itineraryId, model)
  }, [pendingMessage, threadId, isStreaming, sendMessage, itineraryId])

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
    queueMessage,
    cancelStreaming,
    refreshMessages,
  }
}
