'use client'

import { useState } from 'react'
import type { AIResultInfo } from '@/lib/ai/pricing'

interface AIInfoBarProps {
  info: AIResultInfo | null
}

const SCENE_LABEL: Record<string, string> = {
  adjust: '行程調整',
  consult: '諮詢服務',
  generate: '建立行程',
}

function fmtUSD(v: number | null): string {
  if (v == null) return '—'
  if (v < 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(4)}`
}
function fmtTWD(v: number | null): string {
  if (v == null) return '—'
  return `NT$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`
}

/**
 * AI 回傳資訊列：顯示最近一次 AI 呼叫的模型、成功/失敗、錯誤碼、usage、費用估算。
 * 預設收合成一行摘要，點擊展開詳情。
 */
export function AIInfoBar({ info }: AIInfoBarProps) {
  const [expanded, setExpanded] = useState(false)

  if (!info) return null

  const isLocal = info.provider === 'local'
  const time = new Date(info.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="border-t border-gray-100 bg-gray-50/80 text-xs text-gray-500">
      {/* 摘要列（可點擊展開） */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 active:bg-gray-100 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${info.success ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="font-medium text-gray-600">AI 回傳</span>
        <span className="text-gray-400">·</span>
        <span className="truncate">{info.model}</span>
        {!isLocal && info.costTWD != null && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{fmtTWD(info.costTWD)}</span>
          </>
        )}
        {isLocal && <span className="text-gray-400">· 本機免費</span>}
        <svg
          className={`w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展開詳情 */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-1.5">
          <Row label="情境" value={SCENE_LABEL[info.scene] ?? info.scene} />
          <Row label="模型版本" value={info.model} />
          <Row
            label="結果"
            value={info.success ? '✅ 成功' : '❌ 失敗'}
            valueClass={info.success ? 'text-green-600' : 'text-red-600'}
          />
          {!info.success && (
            <Row
              label="錯誤"
              value={`${info.errorCode ?? '—'}：${info.errorMeaning ?? '—'}`}
              valueClass="text-red-600"
            />
          )}
          {info.usage ? (
            <>
              <Row label="Token（輸入）" value={info.usage.inputTokens.toLocaleString()} />
              <Row label="Token（輸出）" value={info.usage.outputTokens.toLocaleString()} />
              <Row label="Token（合計）" value={info.usage.totalTokens.toLocaleString()} />
            </>
          ) : (
            <Row label="Token 用量" value={isLocal ? '本機模式（不計費）' : '無資料'} />
          )}
          {!isLocal && (
            <>
              <Row label="費用（美金）" value={fmtUSD(info.costUSD)} />
              <Row label="費用（台幣）" value={fmtTWD(info.costTWD)} valueClass="font-medium text-gray-700" />
            </>
          )}
          <Row label="耗時" value={`${(info.durationMs / 1000).toFixed(1)} 秒`} />
          <Row label="時間" value={time} />
          {!isLocal && (
            <p className="text-[10px] text-gray-400 pt-1">※ 費用為依公開單價估算，實際以供應商帳單為準</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, valueClass = 'text-gray-600' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-right ${valueClass}`}>{value}</span>
    </div>
  )
}
