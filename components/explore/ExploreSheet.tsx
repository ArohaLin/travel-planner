'use client'

import { useEffect, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useToast } from '@/components/ui/Toast'
import type { Recommendation, RecommendationCategory, WishlistItem } from '@/lib/types/recommendation'

const CATEGORY_ORDER: RecommendationCategory[] = ['景點', '美食', '住宿', '親子']

interface DayOpt {
  dayIndex: number
  date: string
  city?: string
}

interface Props {
  itineraryId: string
  destination: string
  days: DayOpt[]
  onClose: () => void
  /** 把願望清單項目加入某一天（ItineraryClient 實作：送 patch + 標記 added）。回傳成功與否。 */
  onAddToDay: (item: WishlistItem, dayIndex: number) => Promise<boolean>
}

function photoUrl(ref: string | null): string | null {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null
}

export function ExploreSheet({ itineraryId, destination, days, onClose, onAddToDay }: Props) {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'recommend' | 'wishlist'>('recommend')
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const [cat, setCat] = useState<RecommendationCategory>('景點')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // 兩個請求各自獨立容錯：任一失敗（含非 JSON 回應）都不該讓另一個一起變空
    const safe = (url: string) =>
      fetch(url).then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }))
    const [r, w] = await Promise.all([
      safe(`/api/recommendations?q=${encodeURIComponent(destination)}`),
      safe(`/api/itinerary/${itineraryId}/wishlist`),
    ])
    setRecs(r.items ?? [])
    setWishlist(w.items ?? [])
    setLoading(false)
  }, [itineraryId, destination])

  useEffect(() => { load() }, [load])

  // 已在願望清單的 place_id（用來標記推薦卡「已加入」）
  const inWishlist = new Set(wishlist.map((w) => w.googlePlaceId).filter(Boolean) as string[])
  const cats = CATEGORY_ORDER.filter((c) => (recs ?? []).some((r) => r.category === c))
  const shown = (recs ?? []).filter((r) => r.category === cat)

  async function addToWishlist(r: Recommendation) {
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'recommendation',
          recommendationId: r.id,
          googlePlaceId: r.googlePlaceId,
          name: r.name,
          category: r.category,
          lat: r.lat,
          lng: r.lng,
          photoRef: r.photoRef,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setWishlist((prev) => [data.item, ...prev])
        showToast(`已加入願望清單：${r.name}`, 'success')
      } else if (res.status === 409) {
        showToast('已在願望清單中', 'info')
      } else {
        showToast(data.error ?? '加入失敗', 'error')
      }
    } catch {
      showToast('網路錯誤', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function removeFromWishlist(item: WishlistItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist?itemId=${item.id}`, { method: 'DELETE' })
      if (res.ok) setWishlist((prev) => prev.filter((w) => w.id !== item.id))
      else showToast('刪除失敗', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function addToDay(item: WishlistItem, dayIndex: number) {
    setBusyId(item.id)
    try {
      const ok = await onAddToDay(item, dayIndex)
      if (ok) {
        setWishlist((prev) => prev.map((w) => (w.id === item.id ? { ...w, status: 'added' } : w)))
        showToast(`已加入第 ${dayIndex + 1} 天：${item.name}`, 'success')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl sheet-enter flex flex-col"
        style={{ height: '86dvh', maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header + tabs */}
        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="font-semibold text-gray-900">✨ 探索{recs && recs[0] ? ` ${recs[0].region}` : ''}</h2>
            <button onClick={onClose} className="tap-target text-gray-400 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-0.5 px-4 pb-2">
            <button
              onClick={() => setTab('recommend')}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium', tab === 'recommend' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}
            >
              精選推薦
            </button>
            <button
              onClick={() => setTab('wishlist')}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium ml-1', tab === 'wishlist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}
            >
              願望清單{wishlist.length ? `（${wishlist.length}）` : ''}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scroll-touch" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'recommend' ? (
            (recs ?? []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16 px-6">此地區目前還沒有精選推薦。</p>
            ) : (
              <>
                {/* 分類 chips */}
                <div className="sticky top-0 bg-white z-10 px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-gray-50">
                  {cats.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCat(c)}
                      className={clsx('flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium', cat === c ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="px-4 py-3 space-y-3">
                  {shown.map((r) => (
                    <RecCard
                      key={r.id}
                      rec={r}
                      added={!!r.googlePlaceId && inWishlist.has(r.googlePlaceId)}
                      busy={busyId === r.id}
                      onAdd={() => addToWishlist(r)}
                    />
                  ))}
                </div>
              </>
            )
          ) : (
            /* 願望清單 tab */
            wishlist.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16 px-6">願望清單還是空的。到「精選推薦」按 ♡ 加入想去的地方。</p>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {wishlist.map((item) => (
                  <WishCard
                    key={item.id}
                    item={item}
                    days={days}
                    busy={busyId === item.id}
                    onAddToDay={(d) => addToDay(item, d)}
                    onRemove={() => removeFromWishlist(item)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}

/* ── 推薦卡 ─────────────────────────────────────────────────────────────── */
function RecCard({ rec, added, busy, onAdd }: { rec: Recommendation; added: boolean; busy: boolean; onAdd: () => void }) {
  const img = photoUrl(rec.photoRef)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex gap-3 p-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={rec.name} loading="lazy" className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
        ) : (
          <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-gradient-to-br from-purple-100 to-blue-100" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug">{rec.name}</h3>
          </div>
          {rec.ratingSnapshot != null && (
            <p className="text-xs text-amber-600 mt-0.5">
              ★ {rec.ratingSnapshot}
              {rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}
            </p>
          )}
          <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-3">{rec.editorialReason}</p>
        </div>
      </div>
      {(rec.sourceBadges.length > 0 || rec.tags.length > 0) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {rec.sourceBadges.map((b) => (
            <span key={b} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">{b}</span>
          ))}
          {rec.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}
      <button
        onClick={onAdd}
        disabled={added || busy}
        className={clsx(
          'w-full py-2.5 text-sm font-medium border-t border-gray-100 flex items-center justify-center gap-1.5',
          added ? 'text-gray-400' : 'text-purple-600 active:bg-purple-50',
        )}
      >
        {busy ? '加入中…' : added ? '✓ 已在願望清單' : '♡ 加入願望清單'}
      </button>
    </div>
  )
}

/* ── 願望清單卡 ─────────────────────────────────────────────────────────── */
function WishCard({
  item, days, busy, onAddToDay, onRemove,
}: {
  item: WishlistItem
  days: DayOpt[]
  busy: boolean
  onAddToDay: (dayIndex: number) => void
  onRemove: () => void
}) {
  const img = photoUrl(item.photoRef)
  const added = item.status === 'added'
  return (
    <div className={clsx('bg-white rounded-2xl border shadow-sm overflow-hidden', added ? 'border-green-100' : 'border-gray-100')}>
      <div className="flex gap-3 p-3 items-center">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={item.name} loading="lazy" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
        ) : (
          <div className="w-14 h-14 rounded-xl flex-shrink-0 bg-gradient-to-br from-purple-100 to-blue-100" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {item.category ?? ''}{added && <span className="text-green-600 ml-1">・已加入行程</span>}
          </p>
        </div>
        <button onClick={onRemove} disabled={busy} className="tap-target text-gray-300 hover:text-red-500 p-1 flex-shrink-0" title="移除">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
      {/* 加入某天：天數選擇 */}
      <div className="px-3 pb-3">
        <select
          disabled={busy}
          value=""
          onChange={(e) => { const v = e.target.value; if (v !== '') onAddToDay(Number(v)) }}
          className="w-full text-sm border border-purple-200 text-purple-700 rounded-xl px-3 py-2 bg-purple-50 disabled:opacity-50"
        >
          <option value="">{busy ? '加入中…' : added ? '再加入其他天 ▾' : '＋ 加入某一天 ▾'}</option>
          {days.map((d) => (
            <option key={d.dayIndex} value={d.dayIndex}>
              第 {d.dayIndex + 1} 天{d.city ? `・${d.city}` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
