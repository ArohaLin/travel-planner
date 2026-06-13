'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Itinerary } from '@/lib/types/itinerary'
import { formatDateRange } from '@/lib/utils/date'

/**
 * 歷程節點的「預覽 / 還原」控制（限有快照的節點）。
 * 預覽：抓該節點快照，顯示唯讀逐日摘要。
 * 還原：限建立者/管理者，二次確認後把整份行程改回此版本（非破壞式，可再還原回去）。
 */
export function RestoreControls({
  itineraryId,
  changeId,
  canRestore,
}: {
  itineraryId: string
  changeId: string
  canRestore: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [snapshot, setSnapshot] = useState<Itinerary | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function openPreview() {
    setOpen(true); setConfirming(false); setErr(null); setSnapshot(null); setLoading(true)
    try {
      const r = await fetch(`/api/itinerary/${itineraryId}/restore?changeId=${changeId}`)
      const d = await r.json()
      if (r.ok) setSnapshot(d.snapshot as Itinerary)
      else setErr(d.error ?? '載入失敗')
    } catch {
      setErr('網路錯誤')
    } finally {
      setLoading(false)
    }
  }

  async function doRestore() {
    setRestoring(true); setErr(null)
    try {
      const r = await fetch(`/api/itinerary/${itineraryId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        router.push(`/itinerary/${itineraryId}`)
        router.refresh()
      } else {
        setErr(d.error ?? '還原失敗')
        setRestoring(false)
      }
    } catch {
      setErr('網路錯誤，請再試一次')
      setRestoring(false)
    }
  }

  return (
    <>
      <button
        onClick={openPreview}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full active:bg-purple-100"
      >
        👁 預覽此版本{canRestore ? ' / 還原' : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[86dvh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h3 className="font-semibold text-gray-900">版本預覽</h3>
                <button onClick={() => setOpen(false)} className="text-gray-400 p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : snapshot ? (
                  <SnapshotSummary itinerary={snapshot} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">{err ?? '無法載入此版本'}</p>
                )}
              </div>

              {/* Footer */}
              {canRestore && snapshot && (
                <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                  {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
                  {!confirming ? (
                    <button
                      onClick={() => setConfirming(true)}
                      className="w-full py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-2xl"
                    >
                      ↩ 還原到此版本
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-gray-500 text-center">
                        將把整份行程改回此版本（之後仍可再還原回來）。確定嗎？
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirming(false)}
                          disabled={restoring}
                          className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-2xl disabled:opacity-60"
                        >
                          取消
                        </button>
                        <button
                          onClick={doRestore}
                          disabled={restoring}
                          className="flex-1 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {restoring && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                          {restoring ? '還原中…' : '確定還原'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** 唯讀逐日摘要（預覽用） */
function SnapshotSummary({ itinerary }: { itinerary: Itinerary }) {
  const { metadata, days } = itinerary
  return (
    <div>
      <p className="font-serif text-lg text-gray-900">{metadata.title}</p>
      <p className="text-xs text-gray-400 mb-4">{formatDateRange(metadata.startDate, metadata.endDate)}</p>
      <div className="flex flex-col gap-4">
        {days.map((day) => {
          const acts = [...day.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
          return (
            <div key={day.dayIndex}>
              <p className="text-sm font-medium text-gray-900">
                <span className="font-serif text-purple-400 mr-2">Day {day.dayIndex + 1}</span>
                {day.city}
                {day.theme ? <span className="text-gray-400 font-normal"> · {day.theme}</span> : null}
              </p>
              <div className="mt-1 rounded-xl bg-gray-50 px-3 py-2">
                {acts.length === 0 && !day.accommodation ? (
                  <p className="text-xs text-gray-300">（無安排）</p>
                ) : (
                  <>
                    {acts.map((a) => (
                      <div key={a.id} className="flex gap-3 py-0.5 text-[13px] leading-relaxed">
                        <span className="flex-shrink-0 w-12 tabular-nums text-purple-500">{a.startTime}</span>
                        <span className="text-gray-700">{a.title}</span>
                      </div>
                    ))}
                    {day.accommodation && (
                      <div className="flex gap-3 py-0.5 text-[13px] leading-relaxed">
                        <span className="flex-shrink-0 w-12 text-amber-500">🏨 宿</span>
                        <span className="text-gray-700">{day.accommodation.name}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
