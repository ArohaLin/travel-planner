'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ModelProvider } from '@/lib/ai/client'

const STORAGE_KEY = 'ai_model_preference'

export function useModelPreference() {
  const [modelProvider, setModelProviderState] = useState<ModelProvider>('claude')

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'claude' || saved === 'minimax') {
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
