'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Web Push 訂閱管理（AI 完成通知）。
 * iOS 限制：必須是「加入主畫面」開啟的 PWA（iOS 16.4+）才支援；
 * Safari 分頁中 PushManager 不存在 → state 為 unsupported。
 */

export type PushState =
  | 'loading'        // 檢查中
  | 'unsupported'    // 此環境不支援（未從主畫面開啟 / 舊系統）
  | 'denied'         // 使用者已拒絕（需到系統設定開啟）
  | 'off'            // 支援但尚未啟用
  | 'on'             // 已啟用

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function usePushNotification() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  // 初始化：檢查支援度與目前訂閱狀態；已授權時順便註冊/更新 service worker
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!supported()) {
        setState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setState('denied')
        return
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setState(sub ? 'on' : 'off')
      } catch {
        if (!cancelled) setState('off')
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported()) return false
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return false
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) return false
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) return false
      setState('on')
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async (): Promise<boolean> => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, enable, disable }
}
