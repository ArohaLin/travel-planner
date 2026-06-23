'use client'

import { useEffect, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useToast } from '@/components/ui/Toast'
import type { ItineraryDay } from '@/lib/types/itinerary'
import type { Recommendation, RecommendationCategory, WishlistItem } from '@/lib/types/recommendation'
import { suggestSlots, slotForTargetDay, type Slot } from '@/lib/explore/placement'
import { LodgingTab } from '@/components/explore/LodgingTab'

const CATEGORY_ORDER: RecommendationCategory[] = ['景點', '美食', '住宿', '親子']

interface Props {
  itineraryId: string
  destination: string
  days: ItineraryDay[]
  onClose: () => void
  /** 把願望清單項目加入某一天（指定開始時間）。回傳成功與否。 */
  onAddToDay: (item: WishlistItem, dayIndex: number, startTime: string) => Promise<boolean>
  /** 交給 AI 一次排進行程（C）。 */
  onAiArrange: (items: WishlistItem[]) => void
  initialTab?: 'recommend' | 'wishlist'
  /** B：從某一天進來 → 願望清單依離該天遠近排序、一鍵加入該天 */
  targetDayIndex?: number | null
}

function photoUrl(ref: string | null): string | null {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null
}

interface PlaceResult {
  placeId: string; name: string; address: string | null
  rating: number | null; reviews: number | null
  photoRef: string | null; lat: number | null; lng: number | null
}

// ── 營業時間判斷 ─────────────────────────────────────────────────────────────
interface Hours { businessStatus: string | null; periods: { open?: { day: number; time: string }; close?: { day: number; time: string } }[] | null }
const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2))
function isOpenAt(h: Hours | null, weekday: number, minutes: number): boolean | null {
  if (!h || !h.periods) return null
  if (h.businessStatus && h.businessStatus !== 'OPERATIONAL') return false
  if (h.periods.length === 1 && h.periods[0].open?.time === '0000' && !h.periods[0].close) return true
  const cand = weekday * 1440 + minutes
  for (const p of h.periods) {
    if (!p.open || !p.close) continue
    const o = p.open.day * 1440 + hhmm(p.open.time)
    let c = p.close.day * 1440 + hhmm(p.close.time)
    if (c <= o) c += 7 * 1440
    if ((cand >= o && cand < c) || (cand + 7 * 1440 >= o && cand + 7 * 1440 < c)) return true
  }
  return false
}
const weekdayOf = (date: string) => new Date(date + 'T00:00:00').getDay()
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

export function ExploreSheet({ itineraryId, destination, days, onClose, onAddToDay, onAiArrange, initialTab, targetDayIndex }: Props) {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'recommend' | 'search' | 'wishlist' | 'lodging' | 'shop'>(initialTab ?? (targetDayIndex != null ? 'wishlist' : 'recommend'))
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const [cat, setCat] = useState<RecommendationCategory>('景點')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 地區選擇：selectedRegion=null 表示「跟著目的地預設」；activeRegion 為伺服器實際生效地區
  const [regions, setRegions] = useState<string[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [activeRegion, setActiveRegion] = useState<string>('all')

  // 搜尋分頁狀態
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<{ curated: Recommendation[]; places: PlaceResult[] } | null>(null)
  const [searching, setSearching] = useState(false)

  // 精選推薦：隨地區改變重抓
  const loadRecs = useCallback(async () => {
    setLoading(true)
    const url = `/api/recommendations?q=${encodeURIComponent(destination)}` +
      (selectedRegion ? `&region=${encodeURIComponent(selectedRegion)}` : '')
    const r = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null)
    setRecs(r?.items ?? [])
    setRegions(r?.regions ?? [])
    setActiveRegion(r?.region ?? 'all')
    setLoading(false)
  }, [destination, selectedRegion])

  useEffect(() => { loadRecs() }, [loadRecs])

  // 願望清單：只需 itineraryId，不隨地區重抓
  useEffect(() => {
    fetch(`/api/itinerary/${itineraryId}/wishlist`)
      .then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }))
      .then((w) => setWishlist(w.items ?? []))
  }, [itineraryId])

  // 搜尋：debounce 400ms、最少 2 字
  useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 2) { setSearchRes(null); setSearching(false); return }
    setSearching(true)
    const regionParam = activeRegion && activeRegion !== 'all' ? `&region=${encodeURIComponent(activeRegion)}` : ''
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}&near=${encodeURIComponent(destination)}${regionParam}`)
        const data = res.ok ? await res.json() : { curated: [], places: [] }
        setSearchRes({ curated: data.curated ?? [], places: data.places ?? [] })
      } catch {
        setSearchRes({ curated: [], places: [] })
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [searchQ, destination, activeRegion])

  const inWishlist = new Set(wishlist.map((w) => w.googlePlaceId).filter(Boolean) as string[])
  // 已在行程：以名稱比對（不論 A 智慧加入或 C 由 AI 排入都能反映）
  const titles = new Set(days.flatMap((d) => d.activities.map((a) => a.title)))
  const cats = CATEGORY_ORDER.filter((c) => (recs ?? []).some((r) => r.category === c))
  const featured = (recs ?? []).filter((r) => r.category === cat && r.tier === 'featured')
  const longlist = (recs ?? []).filter((r) => r.category === cat && r.tier === 'longlist')

  // B：依離 targetDay 遠近排序
  const sortedWishlist = targetDayIndex == null
    ? wishlist
    : [...wishlist].sort((a, b) => {
        const da = slotForTargetDay(a, days, targetDayIndex)?.distanceKm ?? Infinity
        const db = slotForTargetDay(b, days, targetDayIndex)?.distanceKm ?? Infinity
        return da - db
      })
  const openCount = wishlist.filter((w) => !titles.has(w.name)).length

  async function addToWishlist(r: Recommendation) {
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'recommendation', recommendationId: r.id, googlePlaceId: r.googlePlaceId, name: r.name, category: r.category, lat: r.lat, lng: r.lng, photoRef: r.photoRef }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setWishlist((prev) => [data.item, ...prev]); showToast(`已加入願望清單：${r.name}`, 'success') }
      else if (res.status === 409) showToast('已在願望清單中', 'info')
      else showToast(data.error ?? '加入失敗', 'error')
    } catch { showToast('網路錯誤', 'error') } finally { setBusyId(null) }
  }

  async function addPlace(p: PlaceResult) {
    setBusyId(p.placeId)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'search', googlePlaceId: p.placeId, name: p.name, lat: p.lat, lng: p.lng, photoRef: p.photoRef }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setWishlist((prev) => [data.item, ...prev]); showToast(`已加入願望清單：${p.name}`, 'success') }
      else if (res.status === 409) showToast('已在願望清單中', 'info')
      else showToast(data.error ?? '加入失敗', 'error')
    } catch { showToast('網路錯誤', 'error') } finally { setBusyId(null) }
  }

  async function removeFromWishlist(item: WishlistItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist?itemId=${item.id}`, { method: 'DELETE' })
      if (res.ok) setWishlist((prev) => prev.filter((w) => w.id !== item.id))
      else showToast('刪除失敗', 'error')
    } finally { setBusyId(null) }
  }

  async function addToDay(item: WishlistItem, dayIndex: number, startTime: string) {
    setBusyId(item.id)
    try {
      const ok = await onAddToDay(item, dayIndex, startTime)
      if (ok) {
        setWishlist((prev) => prev.map((w) => (w.id === item.id ? { ...w, status: 'added' } : w)))
        showToast(`已加入第 ${dayIndex + 1} 天：${item.name}`, 'success')
      }
    } finally { setBusyId(null) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl sheet-enter flex flex-col" style={{ height: '86dvh', maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>

        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="font-semibold text-gray-900">
              {targetDayIndex != null
                ? `第 ${targetDayIndex + 1} 天・從願望清單加入`
                : `✨ 探索${activeRegion === 'all' ? (regions.length > 1 ? ' 全部地區' : '') : ` ${activeRegion}`}`}
            </h2>
            <button onClick={onClose} className="tap-target text-gray-400 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {targetDayIndex == null && (
            <div className="flex gap-1 px-4 pb-2 overflow-x-auto no-scrollbar">
              <button onClick={() => setTab('recommend')} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 whitespace-nowrap', tab === 'recommend' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}>精選推薦</button>
              <button onClick={() => setTab('search')} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 whitespace-nowrap', tab === 'search' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}>🔍 搜尋</button>
              <button onClick={() => setTab('wishlist')} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 whitespace-nowrap', tab === 'wishlist' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}>願望清單{wishlist.length ? `（${wishlist.length}）` : ''}</button>
              <button onClick={() => setTab('lodging')} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 whitespace-nowrap', tab === 'lodging' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}>🏨 住宿評價</button>
              <button onClick={() => setTab('shop')} className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 whitespace-nowrap', tab === 'shop' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500')}>🏄 店家評價</button>
            </div>
          )}
          {/* 地區選擇器：精選/搜尋分頁、且有多個地區時才出現 */}
          {targetDayIndex == null && (tab === 'recommend' || tab === 'search') && regions.length > 1 && (
            <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar">
              <RegionChip label="全部" active={activeRegion === 'all'} onClick={() => setSelectedRegion('all')} />
              {regions.map((rg) => (
                <RegionChip key={rg} label={rg} active={activeRegion === rg} onClick={() => setSelectedRegion(rg)} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scroll-touch" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {tab === 'lodging' ? (
            <LodgingTab />
          ) : tab === 'shop' ? (
            <LodgingTab category="台東衝浪" kind="shop" />
          ) : loading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : tab === 'recommend' ? (
            (recs ?? []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16 px-6">此地區目前還沒有精選推薦。</p>
            ) : (
              <>
                <div className="sticky top-0 bg-white z-10 px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-gray-50">
                  {cats.map((c) => (
                    <button key={c} onClick={() => setCat(c)} className={clsx('flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium', cat === c ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500')}>{c}</button>
                  ))}
                </div>
                <div className="px-4 py-3 space-y-3">
                  {featured.map((r) => (
                    <RecCard key={r.id} rec={r} added={(!!r.googlePlaceId && inWishlist.has(r.googlePlaceId)) || titles.has(r.name)} busy={busyId === r.id} onAdd={() => addToWishlist(r)} />
                  ))}
                  {longlist.length > 0 && (
                    <LonglistSection
                      items={longlist}
                      inWishlist={inWishlist}
                      titles={titles}
                      busyId={busyId}
                      onAdd={addToWishlist}
                    />
                  )}
                </div>
              </>
            )
          ) : tab === 'search' ? (
            <div className="flex flex-col h-full">
              <div className="sticky top-0 bg-white z-10 px-4 py-2.5 border-b border-gray-50">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
                  <input
                    autoFocus
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder={`搜尋地點${destination ? `（如「${destination}」附近）` : ''}…`}
                    className="w-full bg-gray-100 rounded-xl pl-9 pr-9 py-2.5 text-base text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  {searchQ && (
                    <button onClick={() => setSearchQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
                {searchQ.trim().length < 2 ? (
                  <p className="text-center text-gray-400 text-sm py-12 px-6">輸入地點名稱搜尋，可加入願望清單。<br />精選清單命中會置頂，其餘為 Google 即時資料。</p>
                ) : searching && !searchRes ? (
                  <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
                ) : searchRes && (searchRes.curated.length + searchRes.places.length) === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-12 px-6">找不到「{searchQ.trim()}」相關地點。</p>
                ) : searchRes ? (
                  <>
                    {searchRes.curated.length > 0 && (
                      <>
                        <p className="text-[11px] tracking-wide text-purple-400 font-medium">精選清單命中</p>
                        {searchRes.curated.map((r) => (
                          <RecCard key={r.id} rec={r} added={(!!r.googlePlaceId && inWishlist.has(r.googlePlaceId)) || titles.has(r.name)} busy={busyId === r.id} onAdd={() => addToWishlist(r)} />
                        ))}
                      </>
                    )}
                    {searchRes.places.length > 0 && (
                      <>
                        {searchRes.curated.length > 0 && <p className="text-[11px] tracking-wide text-gray-400 font-medium pt-2">Google 搜尋結果</p>}
                        {searchRes.places.map((p) => (
                          <SearchCard key={p.placeId} place={p} added={inWishlist.has(p.placeId) || titles.has(p.name)} busy={busyId === p.placeId} onAdd={() => addPlace(p)} />
                        ))}
                      </>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            wishlist.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16 px-6">願望清單還是空的。到「精選推薦」按 ♡ 加入想去的地方。</p>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {targetDayIndex == null && openCount > 0 && (
                  <button
                    onClick={() => { onAiArrange(wishlist.filter((w) => !titles.has(w.name))); onClose() }}
                    className="w-full py-2.5 rounded-2xl bg-purple-600 text-white text-sm font-medium active:bg-purple-700"
                  >
                    ✨ 讓 AI 幫我排進行程（{openCount} 個未排）
                  </button>
                )}
                {sortedWishlist.map((item) => (
                  <WishCard
                    key={item.id}
                    item={item}
                    days={days}
                    targetDayIndex={targetDayIndex ?? null}
                    inItinerary={titles.has(item.name)}
                    busy={busyId === item.id}
                    onAdd={(dayIndex, startTime) => addToDay(item, dayIndex, startTime)}
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

/* ── 地區選擇 chip ───────────────────────────────────────────────────────── */
function RegionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx('flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border', active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200')}
    >
      {label}
    </button>
  )
}

/* ── 推薦卡 ─────────────────────────────────────────────────────────────── */
function RecCard({ rec, added, busy, onAdd }: { rec: Recommendation; added: boolean; busy: boolean; onAdd: () => void }) {
  const img = photoUrl(rec.photoRef)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex gap-3 p-3">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={rec.name} loading="lazy" className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-gradient-to-br from-purple-100 to-blue-100" />}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{rec.name}</h3>
          {rec.ratingSnapshot != null && (
            <p className="text-xs text-amber-600 mt-0.5">★ {rec.ratingSnapshot}{rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}</p>
          )}
          <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-3">{rec.editorialReason}</p>
        </div>
      </div>
      {(rec.sourceBadges.length > 0 || rec.tags.length > 0) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {rec.sourceBadges.map((b) => <span key={b} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">{b}</span>)}
          {rec.tags.slice(0, 4).map((t) => <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t}</span>)}
        </div>
      )}
      <button onClick={onAdd} disabled={added || busy} className={clsx('w-full py-2.5 text-sm font-medium border-t border-gray-100 flex items-center justify-center gap-1.5', added ? 'text-gray-400' : 'text-purple-600 active:bg-purple-50')}>
        {busy ? '加入中…' : added ? '✓ 已加入' : '♡ 加入願望清單'}
      </button>
    </div>
  )
}

/* ── 漏網之魚展開區 ───────────────────────────────────────────────────────── */
function LonglistSection({ items, inWishlist, titles, busyId, onAdd }: {
  items: Recommendation[]
  inWishlist: Set<string>
  titles: Set<string>
  busyId: string | null
  onAdd: (r: Recommendation) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-2 text-xs text-gray-400"
      >
        <span className="flex-1 h-px bg-gray-100" />
        <span className="flex-shrink-0">{open ? '▴' : '▾'} 其他不錯的選擇（{items.length}）</span>
        <span className="flex-1 h-px bg-gray-100" />
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-400 text-center">以下未經精選策展，依評分排序，供參考</p>
          {items.map((r) => (
            <LongCard
              key={r.id}
              rec={r}
              added={(!!r.googlePlaceId && inWishlist.has(r.googlePlaceId)) || titles.has(r.name)}
              busy={busyId === r.id}
              onAdd={() => onAdd(r)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 漏網之魚卡（精簡版，含簡介）─────────────────────────────────────────── */
function LongCard({ rec, added, busy, onAdd }: { rec: Recommendation; added: boolean; busy: boolean; onAdd: () => void }) {
  const img = photoUrl(rec.photoRef)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex gap-2.5 p-2.5">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={rec.name} loading="lazy" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="font-medium text-gray-900 text-sm leading-snug flex-1 min-w-0">{rec.name}</p>
            <button
              onClick={onAdd}
              disabled={added || busy}
              className={clsx('flex-shrink-0 text-sm px-2.5 py-1 rounded-lg', added ? 'text-gray-400' : 'text-purple-600 border border-purple-200 active:bg-purple-50')}
            >
              {busy ? '…' : added ? '✓' : '♡'}
            </button>
          </div>
          {rec.ratingSnapshot != null && (
            <p className="text-xs text-amber-500 mt-0.5">★ {rec.ratingSnapshot}{rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}</p>
          )}
          {rec.editorialReason && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{rec.editorialReason}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 搜尋結果卡（Google 即時）─────────────────────────────────────────────── */
function SearchCard({ place, added, busy, onAdd }: { place: PlaceResult; added: boolean; busy: boolean; onAdd: () => void }) {
  const img = photoUrl(place.photoRef)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex gap-2.5 p-2.5">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={place.name} loading="lazy" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="font-medium text-gray-900 text-sm leading-snug flex-1 min-w-0">{place.name}</p>
            <button
              onClick={onAdd}
              disabled={added || busy}
              className={clsx('flex-shrink-0 text-sm px-2.5 py-1 rounded-lg', added ? 'text-gray-400' : 'text-purple-600 border border-purple-200 active:bg-purple-50')}
            >
              {busy ? '…' : added ? '✓' : '♡'}
            </button>
          </div>
          {place.rating != null && (
            <p className="text-xs text-amber-500 mt-0.5">★ {place.rating}{place.reviews != null && <span className="text-gray-400">（{place.reviews}）</span>}</p>
          )}
          {place.address && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{place.address}</p>}
        </div>
      </div>
    </div>
  )
}

/* ── 願望清單卡（A 智慧建議 / B 加入指定天）──────────────────────────────── */
function WishCard({
  item, days, targetDayIndex, inItinerary, busy, onAdd, onRemove,
}: {
  item: WishlistItem
  days: ItineraryDay[]
  targetDayIndex: number | null
  inItinerary: boolean
  busy: boolean
  onAdd: (dayIndex: number, startTime: string) => void
  onRemove: () => void
}) {
  const img = photoUrl(item.photoRef)
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<Hours | null>(null)

  useEffect(() => {
    if (!open || !item.googlePlaceId || hours) return
    fetch(`/api/place/hours?placeId=${encodeURIComponent(item.googlePlaceId)}`)
      .then((r) => r.ok ? r.json() : null).then((h) => h && setHours(h)).catch(() => {})
  }, [open, item.googlePlaceId, hours])

  const dayCity = (di: number) => days.find((d) => d.dayIndex === di)?.city
  const dayDate = (di: number) => days.find((d) => d.dayIndex === di)?.date ?? ''
  const closedWarn = (s: Slot) => (isOpenAt(hours, weekdayOf(dayDate(s.dayIndex)), toMin(s.startTime)) === false ? '⚠ 此時段可能未營業' : null)

  const slots = targetDayIndex != null
    ? ([slotForTargetDay(item, days, targetDayIndex)].filter(Boolean) as Slot[])
    : suggestSlots(item, days)
  const top = slots[0]
  const alts = slots.slice(1, 3)

  return (
    <div className={clsx('bg-white rounded-2xl border shadow-sm overflow-hidden', inItinerary ? 'border-green-100' : 'border-gray-100')}>
      <div className="flex gap-3 p-3 items-center">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={item.name} loading="lazy" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-14 h-14 rounded-xl flex-shrink-0 bg-gradient-to-br from-purple-100 to-blue-100" />}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{item.category ?? ''}{inItinerary && <span className="text-green-600 ml-1">・已在行程</span>}</p>
        </div>
        <button onClick={onRemove} disabled={busy} className="tap-target text-gray-300 hover:text-red-500 p-1 flex-shrink-0" title="移除">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        </button>
      </div>

      {!inItinerary && (
        <div className="px-3 pb-3">
          {targetDayIndex != null ? (
            top && (
              <button onClick={() => onAdd(top.dayIndex, top.startTime)} disabled={busy} className="w-full text-sm bg-purple-50 text-purple-700 rounded-xl px-3 py-2 disabled:opacity-50">
                {busy ? '加入中…' : `加入第 ${top.dayIndex + 1} 天　${top.startTime}${top.distanceKm != null ? `・約 ${top.distanceKm.toFixed(1)}km` : ''}`}
              </button>
            )
          ) : !open ? (
            <button onClick={() => setOpen(true)} disabled={busy} className="w-full text-sm border border-purple-200 text-purple-700 rounded-xl px-3 py-2 active:bg-purple-50 disabled:opacity-50">📍 排入行程</button>
          ) : (
            <div className="space-y-2">
              {top && (
                <div className="bg-purple-50 rounded-xl p-2.5">
                  <p className="text-xs text-purple-900">
                    建議 <span className="font-semibold">第 {top.dayIndex + 1} 天　{top.startTime}</span>{dayCity(top.dayIndex) ? `・${dayCity(top.dayIndex)}` : ''}
                  </p>
                  <p className="text-[11px] text-purple-500 mt-0.5">
                    {top.anchorTitle ? `接在「${top.anchorTitle}」之後` : '接在當天行程之後'}{top.distanceKm != null ? `・約 ${top.distanceKm.toFixed(1)}km` : ''}
                  </p>
                  {closedWarn(top) && <p className="text-[11px] text-amber-600 mt-0.5">{closedWarn(top)}</p>}
                  <button onClick={() => onAdd(top.dayIndex, top.startTime)} disabled={busy} className="mt-2 w-full text-sm bg-purple-600 text-white rounded-lg py-1.5 disabled:opacity-50">
                    {busy ? '加入中…' : '採用此建議'}
                  </button>
                </div>
              )}
              {alts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {alts.map((s) => (
                    <button key={s.dayIndex} onClick={() => onAdd(s.dayIndex, s.startTime)} disabled={busy} className="text-xs border border-gray-200 text-gray-600 rounded-full px-2.5 py-1 active:bg-gray-50 disabled:opacity-50">
                      第 {s.dayIndex + 1} 天 {s.startTime}{s.distanceKm != null ? `（${s.distanceKm.toFixed(0)}km）` : ''}
                    </button>
                  ))}
                </div>
              )}
              <details>
                <summary className="text-xs text-gray-400 cursor-pointer">其他天／手動選</summary>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {days.map((d) => {
                    const s = slotForTargetDay(item, days, d.dayIndex)!
                    return (
                      <button key={d.dayIndex} onClick={() => onAdd(d.dayIndex, s.startTime)} disabled={busy} className="text-xs border border-gray-200 text-gray-600 rounded-full px-2.5 py-1 active:bg-gray-50 disabled:opacity-50">
                        第 {d.dayIndex + 1} 天 {s.startTime}
                      </button>
                    )
                  })}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
