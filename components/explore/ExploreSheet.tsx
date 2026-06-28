'use client'

import { useEffect, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useToast } from '@/components/ui/Toast'
import type { ItineraryDay } from '@/lib/types/itinerary'
import type { Recommendation, RecommendationCategory, WishlistItem } from '@/lib/types/recommendation'
import { suggestSlots, slotForTargetDay, type Slot } from '@/lib/explore/placement'
import { LodgingTab } from '@/components/explore/LodgingTab'
import type { LodgingResearch } from '@/lib/types/lodging'
import { mapLodgingCategory } from '@/lib/utils/lodgingToRec'
import { getCached, setCached } from '@/lib/cache/clientCache'
import { ExploreMap } from '@/components/explore/ExploreMap'
import { RecDetailModal } from '@/components/explore/RecDetailModal'
import { isOpenAt, weekdayOf, toMin, type Hours } from '@/lib/explore/hours'
import type { ShoppingItem } from '@/lib/types/shopping'
import type { ScheduleStore } from '@/components/shopping/ShoppingSheet'

const CATEGORY_ORDER: RecommendationCategory[] = ['景點', '美食', '住宿', '親子']

interface Props {
  itineraryId: string
  destination: string
  days: ItineraryDay[]
  onClose: () => void
  /** 把願望清單項目加入某一天（指定開始時間）。回傳成功與否。 */
  onAddToDay: (item: WishlistItem, dayIndex: number, startTime: string) => Promise<boolean>
  /** 把住宿類願望清單項目取代某天住宿。回傳成功與否。 */
  onReplaceAccommodation?: (item: WishlistItem, dayIndex: number) => Promise<boolean>
  /** 交給 AI 一次排進行程（C）。 */
  onAiArrange: (items: WishlistItem[]) => void
  initialTab?: 'recommend' | 'wishlist'
  /** B：從某一天進來 → 願望清單依離該天遠近排序、一鍵加入該天 */
  targetDayIndex?: number | null
  /** 採購清單（綁店項目顯示在地圖「採購」篩選層） */
  shoppingItems?: ShoppingItem[]
  onToggleShopping?: (id: string, isDone: boolean) => void
  onScheduleShopping?: (store: ScheduleStore, dayIndex: number, startTime: string) => void
}

function photoUrl(ref: string | null): string | null {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null
}

interface PlaceResult {
  placeId: string; name: string; address: string | null
  rating: number | null; reviews: number | null
  photoRef: string | null; lat: number | null; lng: number | null
}

// 營業時間判斷已抽到 lib/explore/hours.ts（isOpenAt / weekdayOf / toMin / Hours），供地圖與詳情共用

export function ExploreSheet({ itineraryId, destination, days, onClose, onAddToDay, onReplaceAccommodation, onAiArrange, initialTab, targetDayIndex, shoppingItems, onToggleShopping, onScheduleShopping }: Props) {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'recommend' | 'search' | 'wishlist' | 'lodging' | 'shop'>(initialTab ?? (targetDayIndex != null ? 'wishlist' : 'recommend'))
  // 快取鍵（掛載期固定；地區跟著目的地預設，selectedRegion 初始 null）
  const recsKey = `recs:${destination}`
  const wishKey = `wish:${itineraryId}`
  const cachedRecs = getCached<{ items: Recommendation[]; regions: string[]; activeRegion: string }>(recsKey)
  const [recs, setRecs] = useState<Recommendation[] | null>(cachedRecs?.items ?? null)
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() => getCached<WishlistItem[]>(wishKey) ?? [])
  const [cat, setCat] = useState<RecommendationCategory>('景點')
  const [loading, setLoading] = useState(cachedRecs == null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 推薦的清單／地圖檢視切換（地圖跨所有類型）；地圖點店後的完整詳情
  const [recView, setRecView] = useState<'list' | 'map' | 'maplist'>('list')
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null)

  // 地區選擇：selectedRegion=null 表示「跟著目的地預設」；activeRegion 為伺服器實際生效地區
  const [regions, setRegions] = useState<string[]>(cachedRecs?.regions ?? [])
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [activeRegion, setActiveRegion] = useState<string>(cachedRecs?.activeRegion ?? 'all')

  // 搜尋分頁狀態
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<{ curated: Recommendation[]; places: PlaceResult[] } | null>(null)
  const [searching, setSearching] = useState(false)

  // 精選推薦：隨地區改變重抓。stale-while-revalidate——有快取就不轉圈、先顯示舊資料
  const loadRecs = useCallback(async () => {
    if (!getCached(recsKey)) setLoading(true)
    const url = `/api/recommendations?q=${encodeURIComponent(destination)}` +
      (selectedRegion ? `&region=${encodeURIComponent(selectedRegion)}` : '')
    const r = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null)
    const items = r?.items ?? []
    const regs = r?.regions ?? []
    const active = r?.region ?? 'all'
    setRecs(items)
    setRegions(regs)
    setActiveRegion(active)
    setLoading(false)
    // 只快取「預設地區」的結果，讓下次掛載讀到的快取與預設檢視一致
    if (selectedRegion == null) setCached(recsKey, { items, regions: regs, activeRegion: active })
  }, [destination, selectedRegion, recsKey])

  useEffect(() => { loadRecs() }, [loadRecs])

  // 願望清單：只需 itineraryId，不隨地區重抓（背景 revalidate，初值已從快取帶入）
  useEffect(() => {
    fetch(`/api/itinerary/${itineraryId}/wishlist`)
      .then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }))
      .then((w) => setWishlist(w.items ?? []))
  }, [itineraryId])

  // 願望清單快取與所有變更（新增/刪除）同步，切回時可立即顯示
  useEffect(() => { setCached(wishKey, wishlist) }, [wishlist, wishKey])

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

  // 從住宿評價 / 店家評價 tab 加入願望清單
  async function addLodgingToWishlist(item: LodgingResearch) {
    const gid = item.googlePlaceId
    setBusyId(gid)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'search', googlePlaceId: gid, name: item.name, category: mapLodgingCategory(item.category), lat: null, lng: null, photoRef: item.photoRef }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setWishlist((prev) => [data.item, ...prev]); showToast(`已加入願望清單：${item.name}`, 'success') }
      else if (res.status === 409) showToast('已在願望清單中', 'info')
      else showToast(data.error ?? '加入失敗', 'error')
    } catch { showToast('網路錯誤', 'error') } finally { setBusyId(null) }
  }

  async function addToWishlist(r: Recommendation) {
    setBusyId(r.id)
    // lodging_research 來的 Recommendation（id 以 "lodging:" 開頭）→ source='search'，不存 recommendationId
    const isLodgingSource = r.id.startsWith('lodging:')
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: isLodgingSource ? 'search' : 'recommendation',
          recommendationId: isLodgingSource ? null : r.id,
          googlePlaceId: r.googlePlaceId, name: r.name, category: r.category, lat: r.lat, lng: r.lng, photoRef: r.photoRef,
        }),
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

  // 地圖彈卡／詳情「排進某天」：先確保入願望清單（取既有或新建），再排入指定天
  async function addRecToDay(rec: Recommendation, dayIndex: number, startTime: string) {
    setBusyId(rec.id)
    try {
      let item = wishlist.find((w) => !!w.googlePlaceId && w.googlePlaceId === rec.googlePlaceId)
      if (!item) {
        const isLodgingSource = rec.id.startsWith('lodging:')
        const res = await fetch(`/api/itinerary/${itineraryId}/wishlist`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: isLodgingSource ? 'search' : 'recommendation',
            recommendationId: isLodgingSource ? null : rec.id,
            googlePlaceId: rec.googlePlaceId, name: rec.name, category: rec.category, lat: rec.lat, lng: rec.lng, photoRef: rec.photoRef,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.item) { item = data.item as WishlistItem; setWishlist((prev) => [data.item, ...prev]) }
      }
      if (!item) { showToast('加入失敗', 'error'); return }
      const target = item
      const ok = await onAddToDay(target, dayIndex, startTime)
      if (ok) {
        setWishlist((prev) => prev.map((w) => (w.id === target.id ? { ...w, status: 'added' } : w)))
        showToast(`已加入第 ${dayIndex + 1} 天：${rec.name}`, 'success')
      }
    } catch { showToast('網路錯誤', 'error') } finally { setBusyId(null) }
  }

  async function replaceAccommodation(item: WishlistItem, dayIndex: number) {
    if (!onReplaceAccommodation) return
    setBusyId(item.id)
    try {
      const ok = await onReplaceAccommodation(item, dayIndex)
      if (ok) {
        setWishlist((prev) => prev.map((w) => (w.id === item.id ? { ...w, status: 'added' } : w)))
        showToast(`已設為第 ${dayIndex + 1} 天住宿：${item.name}`, 'success')
      }
    } finally { setBusyId(null) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 bg-white sheet-enter flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
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
            <LodgingTab inWishlist={inWishlist} onAddToWishlist={addLodgingToWishlist} busyWishlistId={busyId} />
          ) : tab === 'shop' ? (
            <LodgingTab kind="shop" inWishlist={inWishlist} onAddToWishlist={addLodgingToWishlist} busyWishlistId={busyId} />
          ) : loading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : tab === 'recommend' ? (
            (recs ?? []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16 px-6">此地區目前還沒有精選推薦。</p>
            ) : (
              <>
                <div className="sticky top-0 bg-white z-10 border-b border-gray-50">
                  <div className="px-4 py-2 flex justify-end">
                    <div className="flex-shrink-0 flex bg-gray-100 rounded-lg p-0.5">
                      <button onClick={() => setRecView('list')} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', recView === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500')}>清單</button>
                      <button onClick={() => setRecView('map')} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', recView === 'map' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500')}>地圖</button>
                      <button onClick={() => setRecView('maplist')} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', recView === 'maplist' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500')}>地圖列表</button>
                    </div>
                  </div>
                  {recView === 'list' && (
                    <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                      {cats.map((c) => (
                        <button key={c} onClick={() => setCat(c)} className={clsx('flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium', cat === c ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500')}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
                {recView === 'list' ? (
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
                ) : (
                  <div className="h-[68dvh]">
                    <ExploreMap
                      recs={recs ?? []}
                      days={days}
                      showList={recView === 'maplist'}
                      inWishlist={inWishlist}
                      inItineraryNames={titles}
                      busyId={busyId}
                      onAddToWishlist={addToWishlist}
                      onAddToDay={addRecToDay}
                      onOpenDetail={setDetailRec}
                      shoppingItems={shoppingItems}
                      onToggleShopping={onToggleShopping}
                      onScheduleShopping={onScheduleShopping}
                    />
                  </div>
                )}
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
                    onReplaceAccommodation={onReplaceAccommodation
                      ? (dayIndex) => replaceAccommodation(item, dayIndex)
                      : undefined}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {detailRec && (
        <RecDetailModal
          rec={detailRec}
          days={days}
          added={(!!detailRec.googlePlaceId && inWishlist.has(detailRec.googlePlaceId)) || titles.has(detailRec.name)}
          busy={busyId === detailRec.id}
          onClose={() => setDetailRec(null)}
          onAddWish={() => addToWishlist(detailRec)}
          onAddDay={(di, t) => addRecToDay(detailRec, di, t)}
        />
      )}
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
  item, days, targetDayIndex, inItinerary, busy, onAdd, onRemove, onReplaceAccommodation,
}: {
  item: WishlistItem
  days: ItineraryDay[]
  targetDayIndex: number | null
  inItinerary: boolean
  busy: boolean
  onAdd: (dayIndex: number, startTime: string) => void
  onRemove: () => void
  onReplaceAccommodation?: (dayIndex: number) => void
}) {
  const img = photoUrl(item.photoRef)
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<Hours | null>(null)
  const [confirmReplaceDayIndex, setConfirmReplaceDayIndex] = useState<number | null>(null)
  const [replacePicker, setReplacePicker] = useState(false)
  const isLodging = item.category === '住宿'

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

  function ConfirmReplacePanel({ dayIndex }: { dayIndex: number }) {
    const existingAcc = days.find((d) => d.dayIndex === dayIndex)?.accommodation
    return (
      <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-900 leading-snug">
          確定要把「{item.name}」設為第 {dayIndex + 1} 天住宿？
        </p>
        {existingAcc && (
          <p className="text-xs text-amber-600 mt-1">將取代目前的「{existingAcc.name}」</p>
        )}
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => { onReplaceAccommodation?.(dayIndex); setConfirmReplaceDayIndex(null) }}
            disabled={busy}
            className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-50 active:bg-amber-600"
          >
            {busy ? '處理中…' : '確認取代'}
          </button>
          <button
            onClick={() => { setConfirmReplaceDayIndex(null); setReplacePicker(false) }}
            className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm active:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

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
              <div className="space-y-2">
                <button onClick={() => onAdd(top.dayIndex, top.startTime)} disabled={busy} className="w-full text-sm bg-purple-50 text-purple-700 rounded-xl px-3 py-2 disabled:opacity-50">
                  {busy ? '加入中…' : `加入第 ${top.dayIndex + 1} 天　${top.startTime}${top.distanceKm != null ? `・約 ${top.distanceKm.toFixed(1)}km` : ''}`}
                </button>
                {isLodging && onReplaceAccommodation && confirmReplaceDayIndex !== top.dayIndex && (
                  <button
                    onClick={() => setConfirmReplaceDayIndex(top.dayIndex)}
                    disabled={busy}
                    className="w-full text-sm border border-amber-200 text-amber-700 rounded-xl px-3 py-2 active:bg-amber-50 disabled:opacity-50"
                  >
                    🏨 設為第 {top.dayIndex + 1} 天住宿
                  </button>
                )}
                {confirmReplaceDayIndex === top.dayIndex && <ConfirmReplacePanel dayIndex={top.dayIndex} />}
              </div>
            )
          ) : !open && !replacePicker && confirmReplaceDayIndex === null ? (
            <div className="space-y-2">
              <button onClick={() => setOpen(true)} disabled={busy} className="w-full text-sm border border-purple-200 text-purple-700 rounded-xl px-3 py-2 active:bg-purple-50 disabled:opacity-50">
                📍 排入行程
              </button>
              {isLodging && onReplaceAccommodation && (
                <button onClick={() => setReplacePicker(true)} disabled={busy} className="w-full text-sm border border-amber-200 text-amber-700 rounded-xl px-3 py-2 active:bg-amber-50 disabled:opacity-50">
                  🏨 設為某天住宿
                </button>
              )}
            </div>
          ) : replacePicker && confirmReplaceDayIndex === null ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 font-medium">選擇要設為住宿的天：</p>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <button
                    key={d.dayIndex}
                    onClick={() => setConfirmReplaceDayIndex(d.dayIndex)}
                    disabled={busy}
                    className="text-xs border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 active:bg-amber-50 disabled:opacity-50"
                  >
                    第 {d.dayIndex + 1} 天{d.accommodation ? `（取代「${d.accommodation.name}」）` : ''}
                  </button>
                ))}
              </div>
              <button onClick={() => setReplacePicker(false)} className="text-xs text-gray-400 active:text-gray-600">取消</button>
            </div>
          ) : !open && confirmReplaceDayIndex !== null ? (
            <ConfirmReplacePanel dayIndex={confirmReplaceDayIndex} />
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
              {isLodging && onReplaceAccommodation && confirmReplaceDayIndex === null && (
                <div>
                  <p className="text-xs text-amber-700 font-medium mb-1.5">🏨 或設為某天住宿：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {days.map((d) => (
                      <button
                        key={d.dayIndex}
                        onClick={() => setConfirmReplaceDayIndex(d.dayIndex)}
                        disabled={busy}
                        className="text-xs border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 active:bg-amber-50 disabled:opacity-50"
                      >
                        第 {d.dayIndex + 1} 天{d.accommodation ? `（取代）` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {confirmReplaceDayIndex !== null && (
                <ConfirmReplacePanel dayIndex={confirmReplaceDayIndex} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
