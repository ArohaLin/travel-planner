'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ItineraryDay } from '@/lib/types/itinerary'
import type { Recommendation } from '@/lib/types/recommendation'
import { foodIcon } from '@/lib/explore/foodIcons'
import { suggestSlots, type Slot } from '@/lib/explore/placement'
import { isOpenAt, weekdayOf, toMin, type Hours } from '@/lib/explore/hours'

const FOOD_COLOR = '#D85A30'

function photoUrl(ref: string | null): string | null {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null
}

interface Props {
  rec: Recommendation
  days: ItineraryDay[]
  added: boolean
  busy: boolean
  onClose: () => void
  onAddWish: () => void
  onAddDay: (dayIndex: number, startTime: string) => void
}

/** 推薦完整詳情視窗（對齊 ActivityDetailModal 版型，餵 Recommendation 資料）。 */
export function RecDetailModal({ rec, days, added, busy, onClose, onAddWish, onAddDay }: Props) {
  const [hours, setHours] = useState<Hours | null>(null)
  const [picking, setPicking] = useState(false)
  const img = photoUrl(rec.photoRef)

  useEffect(() => {
    if (!rec.googlePlaceId) return
    let cancel = false
    fetch(`/api/place/hours?placeId=${encodeURIComponent(rec.googlePlaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (!cancel && h) setHours(h) })
      .catch(() => {})
    return () => { cancel = true }
  }, [rec.googlePlaceId])

  const now = new Date()
  const openNow = isOpenAt(hours, now.getDay(), now.getHours() * 60 + now.getMinutes())

  const slots = useMemo(() => suggestSlots({ lat: rec.lat, lng: rec.lng }, days), [rec.id, rec.lat, rec.lng, days])
  const top = slots[0] as Slot | undefined
  const dayDate = (di: number) => days.find((d) => d.dayIndex === di)?.date ?? ''
  const slotWarn = (s: Slot) => isOpenAt(hours, weekdayOf(dayDate(s.dayIndex)), toMin(s.startTime)) === false

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name)}${
    rec.googlePlaceId ? `&query_place_id=${encodeURIComponent(rec.googlePlaceId)}` : ''
  }`

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl flex flex-col sheet-enter"
        style={{ height: '86dvh', maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)' }}
      >
        {/* Hero 大圖 */}
        <div className="relative flex-shrink-0">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt={rec.name} className="w-full h-44 object-cover rounded-t-3xl" />
            : <div className="w-full h-44 rounded-t-3xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-5xl">{foodIcon(rec.subCategory, rec.name)}</div>}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center"
            aria-label="關閉"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scroll-touch px-4 py-3 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{rec.name}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {rec.ratingSnapshot != null && (
                <span className="text-sm text-amber-600">★ {rec.ratingSnapshot}{rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}</span>
              )}
              {openNow === true && <span className="text-xs text-green-600 font-medium">● 營業中</span>}
              {openNow === false && <span className="text-xs text-gray-400 font-medium">● 休息中</span>}
              <span className="text-xs text-gray-400">{rec.category}{rec.tier === 'longlist' ? '・其他選擇' : ''}</span>
            </div>
          </div>

          {(rec.sourceBadges.length > 0 || rec.tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {rec.sourceBadges.map((b) => <span key={b} className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{b}</span>)}
              {rec.tags.map((t) => <span key={t} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>)}
            </div>
          )}

          {rec.editorialReason && (
            <div>
              <p className="text-xs text-gray-400 mb-1">精選理由</p>
              <p className="text-sm text-gray-700 leading-relaxed">{rec.editorialReason}</p>
            </div>
          )}

          {hours?.weekdayText && hours.weekdayText.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">營業時間</p>
              <div className="text-xs text-gray-600 space-y-0.5">
                {hours.weekdayText.map((t, i) => <p key={i}>{t}</p>)}
              </div>
            </div>
          )}

          {rec.address && (
            <div>
              <p className="text-xs text-gray-400 mb-1">地址</p>
              <p className="text-sm text-gray-700 leading-relaxed">{rec.address}</p>
            </div>
          )}

          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 active:bg-gray-50"
          >
            🗺️ 在 Google 地圖開啟／導航 ↗
          </a>
        </div>

        {/* 底部動作列 */}
        <div className="flex-shrink-0 border-t border-gray-100 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          {picking ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">排進哪一天？</p>
              {top && (
                <button
                  onClick={() => { onAddDay(top.dayIndex, top.startTime); setPicking(false) }}
                  disabled={busy}
                  className="w-full text-left bg-orange-50 rounded-xl px-3 py-2 disabled:opacity-50"
                >
                  <p className="text-sm text-orange-900 font-medium">
                    建議：第 {top.dayIndex + 1} 天　{top.startTime}{top.distanceKm != null ? `・約 ${top.distanceKm.toFixed(1)}km` : ''}
                  </p>
                  <p className="text-[11px] text-orange-500 mt-0.5">
                    {top.anchorTitle ? `接在「${top.anchorTitle}」之後` : '接在當天行程之後'}{slotWarn(top) ? '・⚠ 此時段可能未營業' : ''}
                  </p>
                </button>
              )}
              <div className="flex flex-wrap gap-1.5">
                {slots.slice(1).map((s) => (
                  <button
                    key={s.dayIndex}
                    onClick={() => { onAddDay(s.dayIndex, s.startTime); setPicking(false) }}
                    disabled={busy}
                    className="text-xs border border-gray-200 text-gray-600 rounded-full px-2.5 py-1 active:bg-gray-50 disabled:opacity-50"
                  >
                    第 {s.dayIndex + 1} 天 {s.startTime}{s.distanceKm != null ? `（${s.distanceKm.toFixed(0)}km）` : ''}
                  </button>
                ))}
              </div>
              <button onClick={() => setPicking(false)} className="text-xs text-gray-400 active:text-gray-600">取消</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onAddWish}
                disabled={added || busy}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border ${added ? 'border-gray-100 text-gray-400' : 'border-gray-200 text-gray-700 active:bg-gray-50'}`}
              >
                {busy ? '…' : added ? '✓ 已加入願望' : '♡ 加入願望'}
              </button>
              <button
                onClick={() => setPicking(true)}
                disabled={busy}
                className="flex-1 h-10 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: FOOD_COLOR }}
              >
                ＋ 排進某天
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
