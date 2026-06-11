'use client'

import { useState, useEffect } from 'react'
import type { AIResultInfo } from '@/lib/ai/pricing'

/**
 * 記錄「最近幾次 AI 回傳資訊」（最新在前，最多 MAX_RECORDS 筆），
 * 存 localStorage 以便跨頁（建立精靈→行程頁）讀取。
 * 全域單一 key（不分行程）；AIInfoBar 可左右滑動瀏覽歷史記錄。
 */
const KEY = 'ai-info-history'
const LEGACY_KEY = 'last-ai-info' // 舊版單筆 key，首次讀取時遷移
const EVENT = 'ai-info-history-changed'
const MAX_RECORDS = 10

function readAll(): AIResultInfo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AIResultInfo[]
    // 遷移舊版單筆記錄
    const legacy = window.localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const one = JSON.parse(legacy) as AIResultInfo
      const arr = [one]
      window.localStorage.setItem(KEY, JSON.stringify(arr))
      window.localStorage.removeItem(LEGACY_KEY)
      return arr
    }
    return []
  } catch {
    return []
  }
}

export function saveLastAIInfo(info: AIResultInfo) {
  if (typeof window === 'undefined') return
  try {
    const arr = [info, ...readAll()].slice(0, MAX_RECORDS)
    window.localStorage.setItem(KEY, JSON.stringify(arr))
    // 通知同分頁的其他 hook 實例更新（storage 事件只跨分頁，同分頁要自己派發）
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    /* ignore */
  }
}

/** 最近幾次 AI 回傳記錄（最新在前） */
export function useAIInfoHistory(): AIResultInfo[] {
  const [history, setHistory] = useState<AIResultInfo[]>([])

  useEffect(() => {
    setHistory(readAll())
    const update = () => setHistory(readAll())
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])

  return history
}

/** 最近一次 AI 回傳記錄（相容舊用法） */
export function useLastAIInfo(): AIResultInfo | null {
  const history = useAIInfoHistory()
  return history[0] ?? null
}
