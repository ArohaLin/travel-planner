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
  /** prevPlan = 本次 AI 提供的方案，補充說明後一起送給 AI */
  onRegenerate: (supplementText: string, prevPlan: AIPlan) => void
  isApplying: boolean
  applyingIndex: number | null
}

export function PlanSelector({
  plans,
  itineraryId: _itineraryId,
  onPlanSelected,
  onCancel,
  onRegenerate,
  isApplying,
}: Props) {
  const [showRegenerateInput, setShowRegenerateInput] = useState(false)
  const [supplementText, setSupplementText] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState(false)

  // 永遠只有 1 個方案
  const plan = plans[0]
  if (!plan) return null

  function handleRegenerate() {
    if (!supplementText.trim()) return
    onRegenerate(supplementText.trim(), plan)
    setSupplementText('')
    setShowRegenerateInput(false)
  }

  return (
    <div className="border-t border-gray-100 bg-white px-4 pt-4 pb-3 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">✦ AI 調整方案</p>

      {/* 方案卡片（常態展開）*/}
      <div className="border border-purple-200 rounded-2xl overflow-hidden">
        {/* 標題列 */}
        <div className="bg-purple-50 px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-600 text-white flex-shrink-0">
            最佳方案
          </span>
          <span className="font-semibold text-gray-900 text-sm">{plan.title}</span>
        </div>

        {/* 內容 */}
        <div className="px-4 py-3 space-y-3 bg-white border-t border-purple-100">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-0.5">如何調整</p>
            <p className="text-sm text-gray-700 leading-relaxed">{plan.description}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-0.5">推薦原因</p>
            <p className="text-sm text-gray-600 leading-relaxed">{plan.rationale}</p>
          </div>

          {plan.comparison && plan.comparison.length > 0 && (
            <ComparisonTable items={plan.comparison} />
          )}
        </div>
      </div>

      {/* 主要操作按鈕 */}
      <div className="flex gap-2">
        <button
          onClick={() => setPendingConfirm(true)}
          disabled={isApplying || showRegenerateInput}
          className={clsx(
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
            'bg-purple-600 text-white hover:bg-purple-700',
            'disabled:opacity-50',
          )}
        >
          {isApplying ? '套用中...' : '✓ 確認套用方案'}
        </button>
        <button
          onClick={() => { setShowRegenerateInput(v => !v); setSupplementText('') }}
          disabled={isApplying}
          className={clsx(
            'flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border',
            showRegenerateInput
              ? 'bg-purple-50 border-purple-300 text-purple-700'
              : 'border-purple-200 text-purple-600 hover:bg-purple-50',
            'disabled:opacity-40',
          )}
        >
          ↺ 補充說明重新生成
        </button>
      </div>

      {/* 補充說明輸入框 */}
      {showRegenerateInput && (
        <div className="space-y-2">
          <textarea
            value={supplementText}
            onChange={e => setSupplementText(e.target.value)}
            placeholder="說明你希望如何調整，例如：希望更省錢、不要太趕、改成下午時段..."
            rows={3}
            className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowRegenerateInput(false); setSupplementText('') }}
              className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleRegenerate}
              disabled={!supplementText.trim()}
              className="flex-1 py-2 text-sm font-medium bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40"
            >
              重新生成方案
            </button>
          </div>
        </div>
      )}

      {/* 取消按鈕 */}
      {!showRegenerateInput && (
        <button
          onClick={onCancel}
          disabled={isApplying}
          className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
        >
          取消調整
        </button>
      )}

      {/* ── 確認套用 Dialog ─────────────────────────────────────────────────── */}
      {pendingConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm"
            onClick={() => setPendingConfirm(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[85vw] max-w-sm bg-white rounded-3xl shadow-2xl p-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 text-base">確認套用方案？</h3>
              <p className="text-sm text-gray-500 mt-1">「{plan.title}」</p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{plan.description}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingConfirm(false)}
                className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-2xl hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => { onPlanSelected(plan); setPendingConfirm(false) }}
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
