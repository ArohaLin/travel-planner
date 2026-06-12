import { waitUntil } from '@vercel/functions'

/**
 * 讓背景工作（推播發送）在「HTTP 回應結束/連線中斷後」仍保證跑完。
 *
 * 為什麼需要：AI 回應是 streaming，使用者若把 App 滑掉（強制關閉），
 * 連線會被切斷，Vercel 可能在 push 還沒送出前就回收函式。waitUntil 會
 * 延長函式壽命直到 promise 完成，確保通知一定送出。
 * 本機（非 Vercel）環境 waitUntil 會直接執行該 promise，行為等同 fire-and-forget。
 */
export function runAfterResponse(promise: Promise<unknown>): void {
  try {
    waitUntil(promise)
  } catch {
    // 不在 Vercel 請求情境（例如本機）→ 直接執行，避免未捕捉的 rejection
    void promise.catch(() => {})
  }
}
