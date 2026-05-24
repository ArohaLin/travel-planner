'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import type { AIPlan, AIPlanComparisonItem } from '@/lib/types/patch'

function ComparisonTable({ items }: { items: AIPlanComparisonItem[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">修改前後比較</p>
      <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_1fr] bg-gray-50 border-b border-gray-100">
          <div className="px-2 py-1.5 text-gray-400 font-medium border-r border-gray-100 min-w-[60px]">項目</div>
          <div className="px-2 py-1.5 text-red-500 font-medium border-r border-gray-100">修改前</div>
          <div className="px-2 py-1.5 text-green-600 font-medium">修改後</div>
        </div>
        {/* Rows */}
        {items.map((row, idx) => (
          <div
            key={idx}
            className={clsx(
              'grid grid-cols-[auto_1fr_1fr]',
              idx < items.length - 1 && 'border-b border-gray-100',
            )}
          >
            <div className="px-2 py-1.5 text-gray-500 border-r border-gray-100 min-w-[60px] leading-snug">
              {row.item}
            </div>
            <div className="px-2 py-1.5 text-gray-600 border-r border-gray-100 leading-snug">
              {row.before}
            </div>
            <div className="px-2 py-1.5 text-gray-800 leading-snug font-medium">
              {row.after}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  plans: AIPlan[]
  itineraryId: string
  onPlanSelected: (plan: AIPlan) => void
  onCancel: () => void
  onRegenerate: (supplementText: string) => void
  isApplying: boolean
  applyingIndex: number | null
}

export function PlanSelector({
  plans,
  itineraryId,
  onPlanSelected,
  onCancel,
  onRegenerate,
  isApplying,
  applyingIndex,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showRegenerateInput, setShowRegenerateInput] = useState(false)
  const [supplementText, setSupplementText] = useState('')
  /** 等待確認的方案；非 null 時顯示確認對話框 */
  const [pendingPlan, setPendingPlan] = useState<AIPlan | null>(null)

  function handleRegenerate() {
    if (!supplementText.trim()) return
    onRegenerate(supplementText.trim())
    setSupplementText('')
    setShowRegenerateInput(false)
  }

  /** 點擊「選擇方案」→ 先進確認階段 */
  function requestSelectPlan(plan: AIPlan) {
    setPendingPlan(plan)
  }

  /** 確認後真正套用 */
  function confirmSelectPlan() {
    if (!pendingPlan) return
    onPlanSelected(pendingPlan)
    setPendingPlan(null)
  }

  const planColors = [
    { border: 'border-purple-200', bg: 'bg-purple-50', badge: 'bg-purple-600 text-white', btn: 'bg-purple-600 hover:bg-purple-700 text-white' },
    { border: 'border-blue-200', bg: 'bg-blue-50', badge: 'bg-blue-600 text-white', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { border: 'border-emerald-200', bg: 'bg-emerald-50', badge: 'bg-emerald-600 text-white', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  ]

  return (
    <div className="border-t border-gray-100 bg-white px-4 pt-4 pb-2 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI 提供了 {plans.length} 個調整方案</p>

      {plans.map((plan, i) => {
        const color = planColors[i] ?? planColors[0]
        const isOpen = expanded === i

        return (
          <div
            key={plan.planIndex}
            className={clsx('border rounded-2xl overflow-hidden transition-all', color.border)}
          >
            {/* Plan header */}
            <button
              className={clsx('w-full text-left px-4 py-3 flex items-center gap-3', color.bg)}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0', color.badge)}>
                方案 {plan.planIndex}
              </span>
              <span className="font-semibold text-gray-900 text-sm flex-1">{plan.title}</span>
              <svg
                className={clsx('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Plan body (collapsible) */}
            {isOpen && (
              <div className="px-4 py-3 space-y-3 bg-white border-t" style={{ borderColor: 'inherit' }}>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">如何調整</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{plan.description}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">推薦原因</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{plan.rationale}</p>
                </div>

                {/* Before / After comparison table */}
                {plan.comparison && plan.comparison.length > 0 && (
                  <ComparisonTable items={plan.comparison} />
                )}

                <button
                  onClick={() => requestSelectPlan(plan)}
                  disabled={isApplying}
                  className={clsx(
                    'mt-1 w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50',
                    color.btn
                  )}
                >
                  {isApplying && applyingIndex === i ? '套用中...' : `選擇方案 ${plan.planIndex} →`}
                </button>
              </div>
            )}

            {/* Collapsed: quick select button */}
            {!isOpen && (
              <button
                onClick={() => requestSelectPlan(plan)}
                disabled={isApplying}
                className={clsx(
                  'w-full py-2 text-xs font-medium transition-colors border-t disabled:opacity-50',
                  color.btn
                )}
                style={{ borderColor: 'inherit' }}
              >
                {isApplying && applyingIndex === i ? '套用中...' : `選擇此方案 →`}
              </button>
            )}
          </div>
        )
      })}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={isApplying}
          className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
        >
          取消調整
        </button>
        <button
          onClick={() => setShowRegenerateInput((v) => !v)}
          disabled={isApplying}
          className="flex-1 py-2 text-sm text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 disabled:opacity-40"
        >
          ↺ 補充說明重新生成
        </button>
      </div>

      {showRegenerateInput && (
        <div className="space-y-2">
          <textarea
            value={supplementText}
            onChange={(e) => setSupplementText(e.target.value)}
            placeholder="補充你的需求或偏好（例如：希望省錢一點、不想走太多路...）"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowRegenerateInput(false)}
              className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleRegenerate}
              disabled={!supplementText.trim()}
              className="flex-1 py-2 text-sm font-medium bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40"
            >
              重新生成
            </button>
          </div>
        </div>
      )}

      {/* ── 套用方案確認 Dialog ──────────────────────────────────────────── */}
      {pendingPlan && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm"
            onClick={() => setPendingPlan(null)}
          />
          {/* Dialog */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[85vw] max-w-sm bg-white rounded-3xl shadow-2xl p-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 text-base">確認套用方案？</h3>
              <p className="text-sm text-gray-500 mt-1">
                即將套用「{pendingPlan.title}」
              </p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                {pendingPlan.description}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingPlan(null)}
                className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-2xl hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmSelectPlan}
                disabled={isApplying}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-2xl hover:bg-purple-700 disabled:opacity-50"
              >
                {isApplying ? '套用中...' : '確認套用'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
