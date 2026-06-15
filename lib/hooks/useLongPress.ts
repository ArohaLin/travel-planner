'use client'

import { useRef, useCallback } from 'react'

/**
 * 長按偵測：按住 ~400ms 觸發 onLongPress；過程中移動超過 tolerance（＝在捲動）則取消，
 * 不與「點擊開詳情 / 垂直捲動」衝突。長按觸發後抑制隨後的 click（避免又開詳情）。
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 400, moveTolerance = 10 }: { delay?: number; moveTolerance?: number } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    fired.current = false
    start.current = { x: e.clientX, y: e.clientY }
    clear()
    timer.current = setTimeout(() => { fired.current = true; onLongPress() }, delay)
  }, [onLongPress, delay, clear])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current || !timer.current) return
    if (Math.abs(e.clientX - start.current.x) > moveTolerance || Math.abs(e.clientY - start.current.y) > moveTolerance) {
      clear()
    }
  }, [moveTolerance, clear])

  const onPointerUp = useCallback(() => clear(), [clear])
  const onPointerCancel = useCallback(() => clear(), [clear])

  // 長按已觸發 → 攔截隨後的 click，避免又觸發「點擊開詳情」
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture }
}
