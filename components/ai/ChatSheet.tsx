'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import type { useChat, AssistantLock } from '@/lib/hooks/useChat'
import type { AIPlan } from '@/lib/types/patch'
import { ChatMessage } from './ChatMessage'
import { PlanSelector } from './PlanSelector'
import { AIInfoBar } from './AIInfoBar'
import { useToast } from '@/components/ui/Toast'
import { useModelPreference } from '@/lib/hooks/useModelPreference'
import { useAIInfoHistory } from '@/lib/hooks/useLastAIInfo'
import { usePushNotification } from '@/lib/hooks/usePushNotification'
import { fileToCompressedBase64 } from '@/lib/utils/image'

interface ChatSheetProps {
  itineraryId: string
  chat: ReturnType<typeof useChat>
  onClose: () => void
  /** 方案套用成功後呼叫（讓行程頁立即刷新，不等 Realtime） */
  onPatchApplied?: () => void
  /** 小幫手「用資料更新這張卡」鎖定目標（從卡片詳情開啟）*/
  assistantLock?: AssistantLock | null
  onClearAssistantLock?: () => void
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

const SUGGESTIONS_ASSISTANT = [
  '丟訂房確認截圖，幫我標已預訂',
  '貼一個景點/餐廳連結，加進行程',
  '上傳店家照片，補進對應的卡片',
]

export function ChatSheet({ itineraryId, chat, onClose, onPatchApplied, assistantLock, onClearAssistantLock }: ChatSheetProps) {
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
  const push = usePushNotification()

  const {
    messages, streamingText, isStreaming, isGeneratingPlans,
    chatMode, setChatMode,
    lastPlans, lastPlansMessageId, clearLastPlans, markPlanApplied, markPlanCancelled,
    sendMessage, sendAssistant, cancelStreaming,
  } = chat

  // 小幫手：待送照片（壓縮後 base64）
  const [pendingImages, setPendingImages] = useState<{ mimeType: string; data: string }[]>([])
  // 小幫手：待送 PDF（已上傳至 Supabase，存路徑）
  const [pendingPdfs, setPendingPdfs] = useState<{ name: string; path: string }[]>([])
  const [isPdfUploading, setIsPdfUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const suggestions = chatMode === 'adjust' ? SUGGESTIONS_ADJUST : chatMode === 'consult' ? SUGGESTIONS_CONSULT : SUGGESTIONS_ASSISTANT

  // 小幫手候選落點：最後一則是 assistant 且帶 candidates、且無待選方案時顯示
  const lastMsg = messages[messages.length - 1]
  const candidates: { label: string; value: string }[] =
    chatMode === 'assistant' && !isStreaming && !(lastPlans && lastPlans.length) && lastMsg?.role === 'assistant'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (((lastMsg.patch as any)?.candidates as { label: string; value: string }[] | undefined) ?? [])
      : []

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

  // 行程調整模式只用 Gemini：本地 AI 僅限咨詢；任何情況下調整模式都鎖回 gemini
  useEffect(() => {
    if (chatMode === 'adjust' && modelProvider !== 'gemini') {
      setModelProvider('gemini')
    }
  }, [chatMode, modelProvider, setModelProvider])

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

  // ── 小幫手：加照片/PDF / 送出 / 點候選 ──────────────────────────────
  async function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 允許重選同檔
    if (!files.length) return

    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    const pdfFiles = files.filter((f) => f.type === 'application/pdf')

    // 圖片：壓縮後轉 base64
    if (imageFiles.length) {
      const room = 6 - pendingImages.length
      if (room <= 0) { showToast('最多 6 張照片', 'info') }
      else {
        try {
          const compressed = await Promise.all(imageFiles.slice(0, room).map((f) => fileToCompressedBase64(f)))
          setPendingImages((prev) => [...prev, ...compressed].slice(0, 6))
        } catch { showToast('圖片處理失敗，請換一張試試', 'error') }
      }
    }

    // PDF：直傳 Supabase（繞過 Vercel 4.5MB body 限制）
    for (const file of pdfFiles.slice(0, 3 - pendingPdfs.length)) {
      if (pendingPdfs.length >= 3) { showToast('最多 3 份 PDF', 'info'); break }
      setIsPdfUploading(true)
      try {
        // 1. 取得 Supabase presigned upload URL
        const urlRes = await fetch('/api/ai/request-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        })
        if (!urlRes.ok) throw new Error('無法取得上傳連結')
        const { signedUrl, path } = await urlRes.json()

        // 2. 直傳 PDF 到 Supabase（PUT，不經過 Vercel）
        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        })
        if (!uploadRes.ok) throw new Error('上傳失敗')

        setPendingPdfs((prev) => [...prev, { name: file.name, path }])
      } catch (err) {
        showToast(`PDF 上傳失敗：${file.name}`, 'error')
        console.error('[handleAddFiles] PDF 上傳失敗:', err)
      } finally {
        setIsPdfUploading(false)
      }
    }
  }

  // 把鎖定目標換成送 API 的欄位（活動 → 活動 id+天；住宿 → 住宿天）
  function lockPayload() {
    if (!assistantLock) return {}
    return assistantLock.kind === 'activity'
      ? { lockedActivityId: assistantLock.activityId, lockedDayIndex: assistantLock.dayIndex }
      : { lockedAccommodationDayIndex: assistantLock.dayIndex }
  }

  async function handleAssistantSend() {
    const note = input.trim()
    const hasContent = note || pendingImages.length > 0 || pendingPdfs.length > 0
    if (!hasContent || isStreaming || isPdfUploading) return
    const payload = {
      note, images: pendingImages,
      pdfPaths: pendingPdfs.map((p) => p.path),
      ...lockPayload(),
    }
    setInput('')
    setPendingImages([])
    setPendingPdfs([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    isAtBottomRef.current = true
    const r = await sendAssistant(payload)
    if (!r.ok) showToast(r.error ?? '小幫手暫時無回應', 'error')
  }

  async function handleCandidate(value: string) {
    if (isStreaming) return
    isAtBottomRef.current = true
    const r = await sendAssistant({
      note: value,
      ...lockPayload(),
    })
    if (!r.ok) showToast(r.error ?? '小幫手暫時無回應', 'error')
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
          selectedPlanComparison: plan.comparison ?? null,
        }),
      })

      if (res.ok) {
        showToast(`「${plan.title}」已套用！`, 'success')
        // Optimistically mark the message as applied so the green badge renders immediately
        if (lastPlansMessageId) {
          markPlanApplied(lastPlansMessageId, plan.planIndex, plan.title)
        } else {
          clearLastPlans()
        }
        // 立即刷新行程資料（#38：不等 Realtime 推播，出去看行程就是新的）
        onPatchApplied?.()
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
      if (isStreaming) return
      if (chatMode === 'assistant') handleAssistantSend()
      else handleSend()
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
        className="fixed inset-0 z-50 bg-white sheet-enter flex flex-col"
        style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex flex-col border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <h2 className="font-semibold text-gray-900 text-sm">和 AI 說</h2>
            <button
              onClick={onClose}
              className="tap-target text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 模式切換 Toggle（獨立一列、滿版三等分）*/}
          <div className="flex items-stretch bg-gray-100 rounded-xl p-0.5 gap-0.5 mx-4 mb-2">
            <button
              onClick={() => { setChatMode('adjust'); setModelProvider('gemini'); clearLastPlans(); onClearAssistantLock?.() }}
              className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium transition-all', chatMode === 'adjust' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500')}
            >
              ✎ 調整
            </button>
            <button
              onClick={() => { setChatMode('consult'); clearLastPlans(); onClearAssistantLock?.() }}
              className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium transition-all', chatMode === 'consult' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500')}
            >
              💬 咨詢
            </button>
            <button
              onClick={() => { setChatMode('assistant'); clearLastPlans() }}
              className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium transition-all', chatMode === 'assistant' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500')}
            >
              🤖 小幫手
            </button>
          </div>

          {/* 模型切換列：調整模式只有 Gemini；咨詢模式可選 Gemini 或 本地 AI */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <span className="text-xs text-gray-400">AI 模型：</span>
            {chatMode === 'assistant' ? (
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">✦ Gemini · 看圖</span>
            ) : (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
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
              {chatMode === 'consult' && (
                <button
                  onClick={() => setModelProvider('local')}
                  disabled={isStreaming}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-50',
                    modelProvider === 'local'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  🖥 本地 AI
                </button>
              )}
            </div>
            )}

            {/* AI 完成通知開關（iOS 需從主畫面開啟的 PWA 才支援） */}
            {push.state !== 'unsupported' && push.state !== 'loading' && (
              <button
                onClick={async () => {
                  if (push.busy) return
                  if (push.state === 'on') {
                    const ok = await push.disable()
                    if (ok) showToast('已關閉 AI 完成通知', 'info')
                  } else if (push.state === 'denied') {
                    showToast('通知已被拒絕，請到 iPhone 設定 → 通知 開啟', 'error')
                  } else {
                    const ok = await push.enable()
                    showToast(ok ? '已開啟 AI 完成通知 🔔' : '開啟失敗，請再試一次', ok ? 'success' : 'error')
                  }
                }}
                title={push.state === 'on' ? 'AI 完成通知：開（點擊關閉）' : 'AI 完成通知：關（點擊開啟）'}
                className={clsx(
                  'ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors',
                  push.state === 'on' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400',
                  push.busy && 'opacity-50',
                )}
              >
                {push.state === 'on' ? '🔔' : '🔕'}
              </button>
            )}
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
                {chatMode === 'adjust' ? '✎' : chatMode === 'consult' ? '💬' : '🤖'}
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">
                {chatMode === 'adjust' ? '行程調整模式' : chatMode === 'consult' ? '咨詢服務模式' : '小幫手模式'}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {chatMode === 'adjust'
                  ? 'AI 會提供 1 個調整方案，你決定是否採用'
                  : chatMode === 'consult'
                    ? 'AI 提供旅遊建議，不修改行程'
                    : '丟照片／網址／文字，AI 自動抽取資訊填入行程；確認方案才套用'}
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

          {/* #37：處理中明顯提示「可先離開 App」 */}
          {isStreaming && (
            <div className="flex items-start gap-2.5 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3">
              <span className="text-lg leading-none mt-0.5">📱</span>
              <p className="text-sm text-purple-800 leading-relaxed">
                AI 處理中（約 1～2 分鐘）——<span className="font-bold">可以先離開 App 做別的事</span>，
                {push.state === 'on'
                  ? '完成後會推播通知你回來查看。'
                  : '完成後回來即可查看（點右上 🔔 開啟通知，完成時會主動提醒你）。'}
              </p>
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

          {/* 小幫手候選落點：一鍵選擇要怎麼填 */}
          {candidates.length > 0 && (
            <div className="flex flex-col gap-2 pl-9">
              <p className="text-xs text-gray-400">請選擇要怎麼處理：</p>
              {candidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => handleCandidate(c.value)}
                  className="text-left text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5 rounded-2xl active:bg-amber-100 transition-colors"
                >
                  {c.label}
                </button>
              ))}
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
          {/* 小幫手：待送照片縮圖列 + 隱藏的檔案選擇 */}
          {chatMode === 'assistant' && (
            <>
              {assistantLock && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <span className="flex-1 truncate">🔒 只更新這張卡：<span className="font-medium">{assistantLock.title}</span></span>
                  <button onClick={() => onClearAssistantLock?.()} className="flex-shrink-0 text-amber-600 underline">解除</button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleAddFiles} />
              {(pendingImages.length > 0 || pendingPdfs.length > 0 || isPdfUploading) && (
                <div className="flex gap-2 overflow-x-auto pb-2 scroll-touch">
                  {pendingImages.map((im, i) => (
                    <div key={`img-${i}`} className="relative flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:${im.mimeType};base64,${im.data}`} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                      <button
                        onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900/80 text-white rounded-full flex items-center justify-center text-xs leading-none"
                        aria-label="移除照片"
                      >×</button>
                    </div>
                  ))}
                  {pendingPdfs.map((pdf, i) => (
                    <div key={`pdf-${i}`} className="relative flex-shrink-0">
                      <div className="w-14 h-14 rounded-lg border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-0.5">
                        <span className="text-xl leading-none">📄</span>
                        <span className="text-[9px] text-red-600 font-medium px-1 text-center leading-tight line-clamp-2">{pdf.name}</span>
                      </div>
                      <button
                        onClick={() => setPendingPdfs((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900/80 text-white rounded-full flex items-center justify-center text-xs leading-none"
                        aria-label="移除 PDF"
                      >×</button>
                    </div>
                  ))}
                  {isPdfUploading && (
                    <div className="flex-shrink-0 w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 items-end">
            {chatMode === 'assistant' && !isStreaming && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="tap-target w-11 h-11 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center active:scale-95 transition-transform flex-shrink-0 hover:bg-gray-200"
                title="加照片"
                aria-label="加照片"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-4 4 3 3-2 6 4" />
                </svg>
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === 'adjust'
                  ? '輸入調整需求，AI 將提供最佳方案...'
                  : chatMode === 'consult'
                    ? '輸入旅遊問題，AI 提供建議...'
                    : '貼網址、或補充說明（可不填，直接加照片送出）...'
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
              /* Cancel / interrupt button — 小幫手非串流，僅顯示忙碌不可中斷 */
              chatMode === 'assistant' ? (
                <div className="w-11 h-11 bg-gray-200 text-gray-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                </div>
              ) : (
              <button
                onClick={handleCancel}
                className="tap-target w-11 h-11 bg-red-500 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0 shadow-sm"
                title="中斷 AI 回覆"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
              )
            ) : (
              <button
                onClick={chatMode === 'assistant' ? handleAssistantSend : handleSend}
                disabled={chatMode === 'assistant' ? (!input.trim() && pendingImages.length === 0 && pendingPdfs.length === 0) || isPdfUploading : !input.trim()}
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
