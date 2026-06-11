'use client'

import { useState } from 'react'
import type { AIResultInfo } from '@/lib/ai/pricing'

interface AIInfoBarProps {
  /** 最近幾次 AI 回傳記錄（最新在前）；可左右滑動切換 */
  history: AIResultInfo[]
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
 * AI 回傳資訊列：顯示最近幾次 AI 呼叫的模型、成功/失敗、usage、費用估算。
 * 預設收合顯示最新一筆摘要；展開後可左右滑動瀏覽最近 10 筆記錄。
 */
export function AIInfoBar({ history }: AIInfoBarProps) {
  const [expanded, setExpanded] = useState(false)
  // 目前瀏覽的記錄索引（0 = 最新）
  const [index, setIndex] = useState(0)

  if (history.length === 0) return null
  const latest = history[0]
  const info = history[Math.min(index, history.length - 1)]
  const isLocalLatest = latest.provider === 'local'

  return (
    <div className="border-t border-gray-100 bg-gray-50/80 text-xs text-gray-500">
      {/* 摘要列（永遠顯示最新一筆；點擊展開） */}
      <button
        onClick={() => {
          setExpanded((v) => !v)
          setIndex(0)
        }}
        className="w-full flex items-center gap-2 px-4 py-2 active:bg-gray-100 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${latest.success ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="font-medium text-gray-600">AI 回傳</span>
        <span className="text-gray-400">·</span>
        <span className="truncate">{latest.model}</span>
        {!isLocalLatest && latest.costTWD != null && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{fmtTWD(latest.costTWD)}</span>
          </>
        )}
        {isLocalLatest && <span className="text-gray-400">· 本機免費</span>}
        {history.length > 1 && (
          <span className="text-gray-400">· {history.length} 筆</span>
        )}
        <svg
          className={`w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展開：水平滑動瀏覽最近記錄 */}
      {expanded && (
        <div>
          <div
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
            onScroll={(e) => {
              const el = e.currentTarget
              const i = Math.round(el.scrollLeft / el.clientWidth)
              if (i !== index) setIndex(i)
            }}
          >
            {history.map((rec, i) => (
              <RecordDetail key={`${rec.timestamp}-${i}`} info={rec} />
            ))}
          </div>
          {/* 頁點指示（多筆才顯示） */}
          {history.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pb-2">
              <span className="text-[10px] text-gray-400 mr-1">← 滑動看歷史</span>
              {history.map((_, i) => (
                <span
                  key={i}
                  className={`rounded-full transition-all ${
                    i === index ? 'w-3.5 h-1.5 bg-purple-400' : 'w-1.5 h-1.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 單筆記錄詳情（佔滿一頁寬，snap 對齊） */
function RecordDetail({ info }: { info: AIResultInfo }) {
  const isLocal = info.provider === 'local'
  const time = new Date(info.timestamp).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  return (
    <div className="w-full flex-shrink-0 snap-center px-4 pb-3 pt-1 space-y-1.5">
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
