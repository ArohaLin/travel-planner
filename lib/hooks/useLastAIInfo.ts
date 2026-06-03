'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AIResultInfo } from '@/lib/ai/pricing'

/**
 * 記錄「最近一次 AI 回傳資訊」，存 localStorage 以便跨頁（建立精靈→行程頁）讀取。
 * 全域單一 key（不分行程），因為使用者只關心最近一次。
 */
const KEY = 'last-ai-info'
const EVENT = 'last-ai-info-changed'

export function saveLastAIInfo(info: AIResultInfo) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(info))
    // 通知同分頁的其他 hook 實例更新（storage 事件只跨分頁，同分頁要自己派發）
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    /* ignore */
  }
}

function read(): AIResultInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AIResultInfo) : null
  } catch {
    return null
  }
}

export function useLastAIInfo(): AIResultInfo | null {
  const [info, setInfo] = useState<AIResultInfo | null>(null)

  useEffect(() => {
    setInfo(read())
    const update = () => setInfo(read())
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])

  const refresh = useCallback(() => setInfo(read()), [])
  // 回傳 info；refresh 掛在物件上不需要時可忽略
  void refresh
  return info
}
