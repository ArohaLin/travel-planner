'use client'

import { useState, useCallback } from 'react'
import type { ShareStatus } from '@/lib/types/brochure'

/**
 * 建立者/管理者專用：產生並管理「對外宣傳冊」公開連結。
 * 自包含 modal：載入狀態 → 產生（抓照片/地圖）→ 顯示連結可複製 → 重新產生 / 關閉。
 */
export function BrochureShareButton({ itineraryId }: { itineraryId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<null | string>(null)
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/share`)
      if (res.ok) setStatus(await res.json())
      else setError('載入分享狀態失敗')
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  function openModal() {
    setOpen(true)
    setCopied(false)
    loadStatus()
  }

  async function act(action: 'enable' | 'disable' | 'regenerate', label: string) {
    setBusy(label)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setStatus(data)
      else setError(data.error ?? '操作失敗')
    } catch {
      setError('網路錯誤，請再試一次')
    } finally {
      setBusy(null)
    }
  }

  async function copyLink() {
    if (!status?.url) return
    try {
      await navigator.clipboard.writeText(status.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('複製失敗，請手動選取網址')
    }
  }

  const enabled = status?.enabled

  return (
    <>
      {/* Header 按鈕 */}
      <button onClick={openModal} className="tap-target text-gray-500 p-1" title="分享宣傳冊">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full max-h-[88dvh] overflow-y-auto">
              <div className="text-3xl text-center mb-2">📖</div>
              <h3 className="font-semibold text-gray-900 text-center mb-1">分享旅程宣傳冊</h3>
              <p className="text-xs text-gray-400 text-center mb-5">
                產生一份對外、唯讀的精裝行程手冊，任何人有連結即可瀏覽（免登入、不能修改）。
              </p>

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !enabled ? (
                /* 尚未開啟 */
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => act('enable', 'enable')}
                    disabled={busy !== null}
                    className="w-full py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {busy === 'enable' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        產生中…可能需要數秒
                      </>
                    ) : (
                      '✨ 產生宣傳冊並開啟分享'
                    )}
                  </button>
                  <p className="text-xs text-gray-400 text-center leading-relaxed">
                    產生時會為每個景點抓取代表照片與路線圖，稍待片刻。
                  </p>
                </div>
              ) : (
                /* 已開啟 */
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">公開連結</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={status?.url ?? ''}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 bg-gray-50"
                      />
                      <button
                        onClick={copyLink}
                        className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-xl"
                      >
                        {copied ? '已複製' : '複製'}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <a
                        href={status?.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 underline"
                      >
                        在新分頁開啟預覽 ↗
                      </a>
                      {status?.photoCount ? (
                        <span className="text-xs text-gray-400">已抓 {status.photoCount} 張照片</span>
                      ) : (
                        <span className="text-xs text-amber-500">無照片（地圖金鑰未啟用）</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
                    <button
                      onClick={() => act('enable', 'refresh')}
                      disabled={busy !== null}
                      className="w-full py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {busy === 'refresh' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          更新中…
                        </>
                      ) : (
                        '🔄 重新整理內容（行程改過後更新照片/地圖）'
                      )}
                    </button>
                    <button
                      onClick={() => act('regenerate', 'regenerate')}
                      disabled={busy !== null}
                      className="w-full py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-2xl disabled:opacity-60"
                    >
                      {busy === 'regenerate' ? '更換中…' : '🔗 換一條新連結（舊連結立即失效）'}
                    </button>
                    <button
                      onClick={() => act('disable', 'disable')}
                      disabled={busy !== null}
                      className="w-full py-2.5 text-sm font-medium text-red-600 border border-red-100 rounded-2xl disabled:opacity-60"
                    >
                      {busy === 'disable' ? '關閉中…' : '關閉公開分享'}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-500 text-center mt-3">{error}</p>}

              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 text-sm text-gray-400 mt-3"
              >
                關閉
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
