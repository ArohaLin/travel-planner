'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import type { useChat } from '@/lib/hooks/useChat'
import type { AIPlan } from '@/lib/types/patch'
import { ChatMessage } from './ChatMessage'
import { PlanSelector } from './PlanSelector'
import { AIInfoBar } from './AIInfoBar'
import { useToast } from '@/components/ui/Toast'
import { useModelPreference } from '@/lib/hooks/useModelPreference'
import { useAIInfoHistory } from '@/lib/hooks/useLastAIInfo'

interface ChatSheetProps {
  itineraryId: string
  chat: ReturnType<typeof useChat>
  onClose: () => void
}

const SUGGESTIONS_ADJUST = [
  '幫我調整行程讓節奏更輕鬆',
  '第一天下午加一個著名景點',
  '推薦當地必吃美食餐廳',
  '有什麼省錢的交通建議？',
]

const SUGGESTIONS_CONSULT = [
  '這個行程時間安排合理嗎？',
  '預算估計大約多少？',
  '需要注意哪些文化禁忌？',
  '旅遊保險需要買嗎？',
]

export function ChatSheet({ itineraryId, chat, onClose }: ChatSheetProps) {
  const [input, setInput] = useState('')
  const [isApplying, setIsApplying] = useState(false)
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  // Saves the text in the input box right before it's sent, so we can restore it on cancel
  const lastSentTextRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Whether the user is scrolled close to the bottom of the chat
  const isAtBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { showToast } = useToast()
  const { modelProvider, setModelProvider } = useModelPreference()
  const aiInfoHistory = useAIInfoHistory()

  const {
    messages, streamingText, isStreaming, isGeneratingPlans,
    chatMode, setChatMode,
    lastPlans, lastPlansMessageId, clearLastPlans, markPlanApplied, markPlanCancelled,
    sendMessage, cancelStreaming,
  } = chat

  const suggestions = chatMode === 'adjust' ? SUGGESTIONS_ADJUST : SUGGESTIONS_CONSULT

  // Track whether the user is near the bottom of the scroll container
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 80
    isAtBottomRef.current = atBottom
    setShowScrollToBottom(!atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    isAtBottomRef.current = true
    setShowScrollToBottom(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Auto-scroll: only when user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, lastPlans])

  // Always scroll when a new complete message is added (e.g. user's own message just appeared)
  const prevMessageCountRef = useRef(0)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      // Always scroll for user messages; for assistant only if already at bottom
      if (lastMsg?.role === 'user' || isAtBottomRef.current) {
        isAtBottomRef.current = true
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  // 開啟視窗時補載最新訊息與待選方案：
  // 行動裝置鎖屏/切 App 會讓串流與 Realtime 斷線，AI 回應已存 DB 但前端漏接，
  // 重開視窗時從 DB 重新載入，確保方案卡不會「消失」。
  useEffect(() => {
    chat.refreshMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    lastSentTextRef.current = text
    setInput('')
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto'
    // Scroll to bottom when user sends
    isAtBottomRef.current = true
    await sendMessage(text, itineraryId, modelProvider)
  }

  function handleCancel() {
    cancelStreaming()
    // Restore the previously sent text so the user can continue editing
    setInput(lastSentTextRef.current)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      const scrollHeight = inputRef.current.scrollHeight
      inputRef.current.style.height = `${Math.min(scrollHeight, 128)}px`
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handlePlanSelected(plan: AIPlan) {
    setIsApplying(true)
    setApplyingIndex(plan.planIndex - 1)

    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: plan.patch,
          chatMessageId: lastPlansMessageId,
          selectedPlanIndex: plan.planIndex,
          selectedPlanTitle: plan.title,
        }),
      })

      if (res.ok) {
        showToast(`方案 ${plan.planIndex}「${plan.title}」已套用！`, 'success')
        // Optimistically mark the message as applied so the green badge renders immediately
        if (lastPlansMessageId) {
          markPlanApplied(lastPlansMessageId, plan.planIndex, plan.title)
        } else {
          clearLastPlans()
        }
      } else if (res.status === 409) {
        showToast('行程已被更新，請重新整理', 'error')
      } else {
        const data = await res.json()
        showToast(data.error ?? '套用失敗', 'error')
      }
    } catch {
      showToast('網路錯誤，請再試一次', 'error')
    } finally {
      setIsApplying(false)
      setApplyingIndex(null)
    }
  }

  async function handleCancelPlans() {
    const msgId = lastPlansMessageId
    // Optimistically update local state immediately
    if (msgId) {
      markPlanCancelled(msgId)
      // Fire-and-forget DB update
      fetch(`/api/chat-message/${msgId}/cancel`, { method: 'POST' }).catch(() => {})
    } else {
      clearLastPlans()
    }
    showToast('已取消調整', 'info')
  }

  async function handleRegenerate(supplementText: string, prevPlan: AIPlan) {
    // 把前次方案標題+描述一起帶給 AI，讓 AI 知道之前提供了什麼，可以更精準地調整
    const planContext = `\n\n（上次方案：「${prevPlan.title}」— ${prevPlan.description}）`
    clearLastPlans()
    await sendMessage(
      `請根據以下補充說明，重新提供 1 個最佳調整方案：${supplementText}${planContext}`,
      itineraryId,
      modelProvider,
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) handleSend()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl sheet-enter flex flex-col"
        style={{
          height: '82vh',
          maxHeight: 'calc(100vh - env(safe-area-inset-top) - 20px)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex flex-col border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="font-semibold text-gray-900">和 AI 說說你的想法</h2>

            {/* 模式切換 Toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-0.5 gap-0.5">
              <button
                onClick={() => { setChatMode('adjust'); clearLastPlans() }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  chatMode === 'adjust'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ✎ 行程調整
              </button>
              <button
                onClick={() => { setChatMode('consult'); clearLastPlans() }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  chatMode === 'consult'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                💬 咨詢服務
              </button>
            </div>

            <button
              onClick={onClose}
              className="tap-target text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 模型切換列 */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <span className="text-xs text-gray-400">AI 模型：</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setModelProvider('claude')}
                disabled={isStreaming}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50',
                  modelProvider === 'claude'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ✦ Claude
              </button>
              <button
                onClick={() => setModelProvider('minimax')}
                disabled={isStreaming}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50',
                  modelProvider === 'minimax'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ⚡ MiniMax
              </button>
              <button
                onClick={() => setModelProvider('gemini')}
                disabled={isStreaming}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50',
                  modelProvider === 'gemini'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ✦ Gemini
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto scroll-touch px-4 py-4 flex flex-col gap-4"
        >
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-6 text-gray-400">
              <div className="text-3xl mb-2">
                {chatMode === 'adjust' ? '✎' : '💬'}
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">
                {chatMode === 'adjust' ? '行程調整模式' : '咨詢服務模式'}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {chatMode === 'adjust'
                  ? 'AI 將提供 3 個方案供你選擇'
                  : 'AI 提供旅遊建議，不修改行程'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full active:bg-gray-200 tap-target"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && (streamingText || (!streamingText && !isGeneratingPlans)) && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-sm flex-shrink-0 mt-1">
                {chatMode === 'adjust' ? '✎' : '💬'}
              </div>
              {streamingText ? (
                <div className="max-w-[80%] bg-white border border-gray-100 rounded-2xl rounded-tl-sm shadow-sm px-4 py-3 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">
                  {streamingText}
                  {!isGeneratingPlans && (
                    <span className="inline-block w-1 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              ) : (
                <div className="flex gap-1 mt-2.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Plans generating indicator — shown when <plans> tag detected */}
          {isGeneratingPlans && (
            <div className="flex gap-2 items-center">
              <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-sm flex-shrink-0">
                ✨
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-purple-700 flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                AI 正在生成調整方案，請稍候...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 w-9 h-9 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:shadow-xl transition-all active:scale-95"
            aria-label="跳到最新訊息"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        </div>

        {/* Plan Selector（固定在訊息區下方，可捲動）*/}
        {lastPlans && lastPlans.length > 0 && (
          <div
            className="overflow-y-auto flex-shrink-0 scroll-touch"
            style={{ maxHeight: 'calc(82dvh - 220px)' }}
          >
            <PlanSelector
              plans={lastPlans}
              itineraryId={itineraryId}
              onPlanSelected={handlePlanSelected}
              onCancel={handleCancelPlans}
              onRegenerate={handleRegenerate}
              isApplying={isApplying}
              applyingIndex={applyingIndex}
            />
          </div>
        )}

        {/* AI 回傳資訊列（最近一次） */}
        <div className="flex-shrink-0">
          <AIInfoBar history={aiInfoHistory} />
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === 'adjust'
                  ? '輸入調整需求，AI 將提供最佳方案...'
                  : '輸入旅遊問題，AI 提供建議...'
              }
              rows={1}
              className={clsx(
                'flex-1 resize-none px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50',
                'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent',
                'text-gray-900 placeholder-gray-400 leading-relaxed',
                'max-h-32 overflow-y-auto scroll-touch',
              )}
              style={{ minHeight: '48px' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`
              }}
            />
            {isStreaming ? (
              /* Cancel / interrupt button */
              <button
                onClick={handleCancel}
                className="tap-target w-11 h-11 bg-red-500 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0 shadow-sm"
                title="中斷 AI 回覆"
              >
                {/* Stop square icon */}
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              /* Send button */
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="tap-target w-11 h-11 bg-purple-600 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 flex-shrink-0"
              >
                <svg className="w-5 h-5 -rotate-45 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
