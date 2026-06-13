'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ModelProvider } from '@/lib/ai/client'

const STORAGE_KEY = 'ai_model_preference'

export function useModelPreference() {
  // 預設 Gemini（調整/建立只用 Gemini；咨詢可選 Gemini 或 本地 AI）
  const [modelProvider, setModelProviderState] = useState<ModelProvider>('gemini')

  // Load from localStorage on mount（只接受 gemini / local；舊的 claude/minimax 一律視為 gemini）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'gemini' || saved === 'local') {
        setModelProviderState(saved)
      }
    } catch {
      // ignore SSR / private browsing issues
    }
  }, [])

  const setModelProvider = useCallback((provider: ModelProvider) => {
    setModelProviderState(provider)
    try {
      localStorage.setItem(STORAGE_KEY, provider)
    } catch {
      // ignore
    }
  }, [])

  return { modelProvider, setModelProvider }
}
