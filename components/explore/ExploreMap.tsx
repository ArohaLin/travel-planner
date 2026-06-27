'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { ItineraryDay, GeoLocation } from '@/lib/types/itinerary'
import type { Recommendation, RecommendationCategory } from '@/lib/types/recommendation'
import { foodIcon } from '@/lib/explore/foodIcons'
import { suggestSlots, type Slot } from '@/lib/explore/placement'
import { isOpenAt, weekdayOf, toMin, type Hours } from '@/lib/explore/hours'
import { MyLocationButton } from '@/components/map/MyLocationButton'
import { flyTo } from '@/lib/maps/flyTo'
import type { ShoppingItem } from '@/lib/types/shopping'
import type { ScheduleStore } from '@/components/shopping/ShoppingSheet'

const ROUTE_COLOR = '#2563eb' // 行程脈絡（藍）
const TAIWAN_CENTER = { lat: 23.6978, lng: 120.9605 }

// 類型 → marker 顏色 + 預設 emoji（美食另用 foodIcon 依店名細分）
const CAT_STYLE: Record<RecommendationCategory, { color: string; emoji: string }> = {
  景點: { color: '#0d9488', emoji: '🏞️' },
  美食: { color: '#D85A30', emoji: '🍴' },
  住宿: { color: '#7c3aed', emoji: '🏨' },
  親子: { color: '#db2777', emoji: '🎠' },
}
function catColor(c: RecommendationCategory): string {
  return CAT_STYLE[c]?.color ?? '#6b7280'
}
function recEmoji(rec: Recommendation): string {
  return rec.category === '美食' ? foodIcon(rec.subCategory, rec.name) : CAT_STYLE[rec.category]?.emoji ?? '📍'
}

const SHOP_COLOR = '#d97706' // 採購（琥珀）
type FilterKey = '全部' | RecommendationCategory | '採購'
const FILTERS: FilterKey[] = ['全部', '景點', '美食', '住宿', '親子', '採購']

function photoUrl(ref: string | null): string | null {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null
}
function hasCoord(loc?: GeoLocation | null): boolean {
  return (
    !!loc &&
    typeof loc.lat === 'number' && isFinite(loc.lat) &&
    typeof loc.lng === 'number' && isFinite(loc.lng) &&
    (loc.lat !== 0 || loc.lng !== 0)
  )
}

interface RoutePoint { lat: number; lng: number; label: string; acc: boolean }

/** 取某天的脈絡點：依時間排序的可定位活動（非交通/休息）＋當晚住宿。 */
function dayRoutePoints(day: ItineraryDay): RoutePoint[] {
  const pts: RoutePoint[] = []
  const acts = [...day.activities]
    .filter((a) => a.type !== 'transport' && a.type !== 'rest' && hasCoord(a.location))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  acts.forEach((a, i) => pts.push({ lat: a.location!.lat, lng: a.location!.lng, label: String(i + 1), acc: false }))
  if (day.accommodation && hasCoord(day.accommodation.location)) {
    pts.push({ lat: day.accommodation.location!.lat, lng: day.accommodation.location!.lng, label: '宿', acc: true })
  }
  return pts
}

interface ExploreMapProps {
  /** 全部推薦（所有類型、featured + longlist）；地圖讀即時資料，名單更新即反映 */
  recs: Recommendation[]
  days: ItineraryDay[]
  /** 是否顯示右側列表（地圖列表模式）；切換時不重掛元件 → 地圖位置/縮放不變 */
  showList: boolean
  inWishlist: Set<string>
  inItineraryNames: Set<string>
  busyId: string | null
  onAddToWishlist: (r: Recommendation) => void
  onAddToDay: (r: Recommendation, dayIndex: number, startTime: string) => void
  onOpenDetail: (r: Recommendation) => void
  /** 綁店的採購項（「採購」篩選層用，琥珀購物袋點） */
  shoppingItems?: ShoppingItem[]
  onToggleShopping?: (id: string, isDone: boolean) => void
  onScheduleShopping?: (store: ScheduleStore, dayIndex: number, startTime: string) => void
}

export function ExploreMap({
  recs, days, showList, inWishlist, inItineraryNames, busyId, onAddToWishlist, onAddToDay, onOpenDetail,
  shoppingItems, onToggleShopping, onScheduleShopping,
}: ExploreMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRoute, setShowRoute] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('全部')
  const isShopping = filter === '採購'

  const withCoord = useMemo(() => recs.filter((r) => r.lat != null && r.lng != null), [recs])
  const mappable = useMemo(
    () => (isShopping ? [] : filter === '全部' ? withCoord : withCoord.filter((r) => r.category === filter)),
    [withCoord, filter, isShopping],
  )
  // 採購店聚合（綁店、有座標、未買）→ 一店一點
  const shoppingStores = useMemo(() => {
    const m = new globalThis.Map<string, ScheduleStore & { placeId: string; items: ShoppingItem[] }>()
    for (const it of shoppingItems ?? []) {
      if (it.isDone || !it.placeId || it.lat == null || it.lng == null) continue
      const g = m.get(it.placeId) ?? { placeId: it.placeId, placeName: it.placeName ?? '店家', lat: it.lat, lng: it.lng, itemNames: [], items: [] }
      g.items.push(it); g.itemNames.push(it.name)
      m.set(it.placeId, g)
    }
    return Array.from(m.values())
  }, [shoppingItems])
  // 列表排序：精選優先，再評分高到低
  const list = useMemo(
    () => [...mappable].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'featured' ? -1 : 1
      return (b.ratingSnapshot ?? 0) - (a.ratingSnapshot ?? 0)
    }),
    [mappable],
  )

  const selected = isShopping ? null : (mappable.find((r) => r.id === selectedId) ?? null)
  const selectedStore = isShopping ? (shoppingStores.find((s) => s.placeId === selectedId) ?? null) : null
  const center = withCoord.length ? { lat: withCoord[0].lat as number, lng: withCoord[0].lng as number } : TAIWAN_CENTER

  // 切換篩選後若選取已不在目前集合內，清掉
  useEffect(() => {
    const inRecs = mappable.some((r) => r.id === selectedId)
    const inStores = shoppingStores.some((s) => s.placeId === selectedId)
    if (selectedId && !inRecs && !inStores) setSelectedId(null)
  }, [mappable, shoppingStores, selectedId])

  return (
    <div className="relative w-full h-full flex">
      {/* 地圖欄 */}
      <div className="relative flex-1 min-w-0">
        <Map
          defaultCenter={center}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          <ExploreMapContent recs={mappable} stores={isShopping ? shoppingStores : []} days={days} showRoute={showRoute} selectedId={selectedId} onSelect={setSelectedId} />
          <MyLocationButton />
        </Map>

        {/* 行程脈絡圖層開關 */}
        <button
          onClick={() => setShowRoute((s) => !s)}
          className={`absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full shadow-md px-3 py-2 text-xs font-medium min-h-[36px] border transition-colors ${
            showRoute ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/95 text-gray-500 border-gray-200'
          }`}
        >
          <span>🗺️</span>
          <span>{showRoute ? '行程脈絡：開' : '行程脈絡：關'}</span>
        </button>

        {/* 類型篩選（浮在地圖上；地圖與地圖列表模式都有，切換不改變 marker 集合與地圖位置） */}
        <div className="absolute top-14 left-2 right-2 z-10 flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f
            const color = f === '全部' ? '#374151' : f === '採購' ? SHOP_COLOR : catColor(f)
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm border"
                style={active ? { background: color, color: '#fff', borderColor: color } : { background: 'rgba(255,255,255,0.95)', color: '#6b7280', borderColor: '#e5e7eb' }}
              >
                {f}
              </button>
            )
          })}
        </div>

        {/* 底部彈卡 */}
        {selected && (
          <PlaceCard
            rec={selected}
            days={days}
            added={(!!selected.googlePlaceId && inWishlist.has(selected.googlePlaceId)) || inItineraryNames.has(selected.name)}
            busy={busyId === selected.id}
            onAddWish={() => onAddToWishlist(selected)}
            onAddDay={(di, t) => onAddToDay(selected, di, t)}
            onDetail={() => onOpenDetail(selected)}
            onClose={() => setSelectedId(null)}
          />
        )}
        {selectedStore && onToggleShopping && onScheduleShopping && (
          <ShoppingMapCard
            store={selectedStore}
            days={days}
            onToggle={onToggleShopping}
            onSchedule={onScheduleShopping}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* 右側列表欄（僅地圖列表模式；切換不重掛地圖 → 位置/縮放不變） */}
      {showList && (
        <div className="w-[42%] max-w-[200px] overflow-y-auto scroll-touch border-l border-gray-100 bg-white">
          {isShopping ? (
            shoppingStores.length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8 px-3">沒有綁店家的採購項</p>
            ) : (
              shoppingStores.map((s) => {
                const active = s.placeId === selectedId
                return (
                  <button
                    key={s.placeId}
                    onClick={() => setSelectedId(s.placeId)}
                    className={`w-full text-left px-2.5 py-2 border-b border-gray-50 flex flex-col gap-0.5 ${active ? 'bg-amber-50' : 'active:bg-gray-50'}`}
                    style={active ? { boxShadow: `inset 3px 0 0 ${SHOP_COLOR}` } : undefined}
                  >
                    <span className="text-xs text-gray-800 leading-snug line-clamp-2">🛍 {s.placeName}</span>
                    <span className="text-[11px] text-gray-400">{s.items.length} 項要買</span>
                  </button>
                )
              })
            )
          ) : list.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-8 px-3">此類型沒有可顯示的地點</p>
          ) : (
            list.map((r) => {
              const active = r.id === selectedId
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-2.5 py-2 border-b border-gray-50 flex flex-col gap-0.5 ${active ? 'bg-gray-50' : 'active:bg-gray-50'}`}
                  style={active ? { boxShadow: `inset 3px 0 0 ${catColor(r.category)}` } : undefined}
                >
                  <span className="text-xs text-gray-800 leading-snug line-clamp-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                      style={{ background: r.tier === 'featured' ? catColor(r.category) : '#fff', border: `1.5px solid ${catColor(r.category)}` }}
                    />
                    {r.name}
                  </span>
                  {r.ratingSnapshot != null && (
                    <span className="text-[11px] text-amber-600">★ {r.ratingSnapshot}{r.reviewsSnapshot != null && <span className="text-gray-400">（{r.reviewsSnapshot}）</span>}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

interface StorePoint { placeId: string; placeName: string; lat: number; lng: number }

function ExploreMapContent({
  recs, stores, days, showRoute, selectedId, onSelect,
}: {
  recs: Recommendation[]
  stores: StorePoint[]
  days: ItineraryDay[]
  showRoute: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const map = useMap()

  // 目前顯示的點（採購層用 stores，否則 recs）→ fitBounds
  const pts = stores.length
    ? stores.map((s) => ({ lat: s.lat, lng: s.lng }))
    : recs.map((r) => ({ lat: r.lat as number, lng: r.lng as number }))
  const boundsKey = pts.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!map || pts.length === 0) return
    if (pts.length === 1) {
      map.setCenter(pts[0])
      map.setZoom(15)
      return
    }
    const b = new google.maps.LatLngBounds()
    pts.forEach((p) => b.extend(p))
    if (!b.isEmpty()) map.fitBounds(b, 56)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey])

  // 選中（含右側列表點擊）→ 平滑飛行（不瞬移）
  useEffect(() => {
    if (!map || !selectedId) return
    const r = recs.find((x) => x.id === selectedId)
    const s = stores.find((x) => x.placeId === selectedId)
    const t = r && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : s ? { lat: s.lat, lng: s.lng } : null
    if (!t) return
    return flyTo(map, t, { zoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId])

  return (
    <>
      {showRoute && <RouteLayer days={days} />}
      {recs.map((r) => {
        const featured = r.tier === 'featured'
        const isSel = r.id === selectedId
        const color = catColor(r.category)
        return (
          <Marker
            key={r.id}
            position={{ lat: r.lat as number, lng: r.lng as number }}
            onClick={() => onSelect(r.id)}
            zIndex={isSel ? 999 : featured ? 10 : 5}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: featured ? (isSel ? 16 : 12) : isSel ? 11 : 7,
              fillColor: featured ? color : '#ffffff',
              fillOpacity: 1,
              strokeColor: featured ? '#ffffff' : color,
              strokeWeight: isSel ? 3 : featured ? 2.5 : 2,
            }}
            label={featured ? { text: recEmoji(r), fontSize: isSel ? '15px' : '13px' } : undefined}
          />
        )
      })}
      {stores.map((s) => {
        const isSel = s.placeId === selectedId
        return (
          <Marker
            key={`shop-${s.placeId}`}
            position={{ lat: s.lat, lng: s.lng }}
            onClick={() => onSelect(s.placeId)}
            zIndex={isSel ? 999 : 20}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: isSel ? 15 : 11,
              fillColor: SHOP_COLOR,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2.5,
            }}
            label={{ text: '🛍', fontSize: isSel ? '14px' : '12px' }}
          />
        )
      })}
    </>
  )
}

/** 行程脈絡層：每天的景點藍色數字 marker（住宿為「宿」方形）＋直線連接。 */
function RouteLayer({ days }: { days: ItineraryDay[] }) {
  const map = useMap()
  const dayList = useMemo(() => days.map((d) => dayRoutePoints(d)).filter((pts) => pts.length > 0), [days])

  const pathKey = dayList.map((pts) => pts.map((p) => `${p.lat},${p.lng}`).join('>')).join('|')
  useEffect(() => {
    if (!map) return
    const lines = dayList
      .filter((pts) => pts.length >= 2)
      .map((pts) => {
        const pl = new google.maps.Polyline({
          path: pts.map((p) => ({ lat: p.lat, lng: p.lng })),
          strokeColor: ROUTE_COLOR,
          strokeOpacity: 0.55,
          strokeWeight: 2.5,
        })
        pl.setMap(map)
        return pl
      })
    return () => lines.forEach((l) => l.setMap(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pathKey])

  return (
    <>
      {dayList.flatMap((pts, di) =>
        pts.map((p, i) => (
          <Marker
            key={`route-${di}-${i}`}
            position={{ lat: p.lat, lng: p.lng }}
            clickable={false}
            zIndex={1}
            icon={{
              path: p.acc ? 'M -8 -8 H 8 V 8 H -8 Z' : google.maps.SymbolPath.CIRCLE,
              scale: p.acc ? 1 : 8,
              fillColor: ROUTE_COLOR,
              fillOpacity: 0.9,
              strokeColor: '#ffffff',
              strokeWeight: 1.5,
              labelOrigin: p.acc ? new google.maps.Point(0, 0) : undefined,
            }}
            label={{ text: p.label, color: '#ffffff', fontSize: '10px', fontWeight: '700' }}
          />
        )),
      )}
    </>
  )
}

/** 底部彈卡：選中地點的摘要＋動作（加入願望／排進某天／進詳情）。 */
function PlaceCard({
  rec, days, added, busy, onAddWish, onAddDay, onDetail, onClose,
}: {
  rec: Recommendation
  days: ItineraryDay[]
  added: boolean
  busy: boolean
  onAddWish: () => void
  onAddDay: (dayIndex: number, startTime: string) => void
  onDetail: () => void
  onClose: () => void
}) {
  const [hours, setHours] = useState<Hours | null>(null)
  const [picking, setPicking] = useState(false)
  const img = photoUrl(rec.photoRef)
  const color = catColor(rec.category)

  useEffect(() => {
    setHours(null)
    setPicking(false)
    if (!rec.googlePlaceId) return
    let cancel = false
    fetch(`/api/place/hours?placeId=${encodeURIComponent(rec.googlePlaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (!cancel && h) setHours(h) })
      .catch(() => {})
    return () => { cancel = true }
  }, [rec.id, rec.googlePlaceId])

  const now = new Date()
  const openNow = isOpenAt(hours, now.getDay(), now.getHours() * 60 + now.getMinutes())

  const slots = useMemo(() => suggestSlots({ lat: rec.lat, lng: rec.lng }, days), [rec.id, rec.lat, rec.lng, days])
  const top = slots[0] as Slot | undefined
  const dayDate = (di: number) => days.find((d) => d.dayIndex === di)?.date ?? ''
  const slotWarn = (s: Slot) => isOpenAt(hours, weekdayOf(dayDate(s.dayIndex)), toMin(s.startTime)) === false

  return (
    <div className="absolute left-2 right-2 bottom-2 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center"
        aria-label="關閉"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <button onClick={onDetail} className="w-full text-left flex gap-3 p-3">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={rec.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-2xl">{recEmoji(rec)}</div>}
        <div className="flex-1 min-w-0 pr-6">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{rec.name}</h3>
          {rec.ratingSnapshot != null && (
            <p className="text-xs text-amber-600 mt-0.5">★ {rec.ratingSnapshot}{rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}</p>
          )}
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>{rec.category}</span>
            {openNow === true && <span className="text-[10px] text-green-600 font-medium">● 營業中</span>}
            {openNow === false && <span className="text-[10px] text-gray-400 font-medium">● 休息中</span>}
            {top?.distanceKm != null && (
              <span className="text-[10px] text-gray-400">離第 {top.dayIndex + 1} 天約 {top.distanceKm.toFixed(1)}km</span>
            )}
          </div>
          {rec.sourceBadges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rec.sourceBadges.slice(0, 3).map((b) => (
                <span key={b} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">{b}</span>
              ))}
            </div>
          )}
        </div>
      </button>

      <div className="px-3 pb-3">
        {picking ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">排進哪一天？</p>
            {top && (
              <button
                onClick={() => { onAddDay(top.dayIndex, top.startTime); setPicking(false) }}
                disabled={busy}
                className="w-full text-left rounded-xl px-3 py-2 disabled:opacity-50"
                style={{ background: `${color}14` }}
              >
                <p className="text-sm font-medium" style={{ color }}>
                  建議：第 {top.dayIndex + 1} 天　{top.startTime}{top.distanceKm != null ? `・約 ${top.distanceKm.toFixed(1)}km` : ''}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
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
              className={`flex-1 h-9 rounded-lg text-sm font-medium border ${added ? 'border-gray-100 text-gray-400' : 'border-gray-200 text-gray-700 active:bg-gray-50'}`}
            >
              {busy ? '…' : added ? '✓ 已加入' : '♡ 加入願望'}
            </button>
            <button
              onClick={() => setPicking(true)}
              disabled={busy}
              className="flex-1 h-9 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: color }}
            >
              ＋ 排進某天
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 採購店彈卡：列該店要買的東西（可勾選已買）＋整家排進某天生成購物卡。 */
function ShoppingMapCard({
  store, days, onToggle, onSchedule, onClose,
}: {
  store: ScheduleStore & { items: ShoppingItem[] }
  days: ItineraryDay[]
  onToggle: (id: string, isDone: boolean) => void
  onSchedule: (store: ScheduleStore, dayIndex: number, startTime: string) => void
  onClose: () => void
}) {
  const [picking, setPicking] = useState(false)
  const slots = useMemo(() => suggestSlots({ lat: store.lat, lng: store.lng }, days), [store.lat, store.lng, days])
  return (
    <div className="absolute left-2 right-2 bottom-2 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
      <button onClick={onClose} className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center" aria-label="關閉">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <div className="p-3">
        <p className="font-semibold text-gray-900 text-sm pr-6 flex items-center gap-1.5">🛍 {store.placeName}</p>
        <div className="mt-2 flex flex-col gap-1">
          {store.items.map((it) => (
            <button key={it.id} onClick={() => onToggle(it.id, !it.isDone)} className="flex items-center gap-2 text-left py-0.5">
              {it.isDone
                ? <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                : <span className="block w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0" />}
              <span className={`text-sm ${it.isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{it.name}{it.quantity ? ` × ${it.quantity}` : ''}</span>
            </button>
          ))}
        </div>
        {picking ? (
          <div className="mt-2.5 space-y-1.5">
            <p className="text-xs text-gray-500">排進哪一天？（生成購物卡）</p>
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <button key={s.dayIndex} onClick={() => { onSchedule(store, s.dayIndex, s.startTime); setPicking(false) }} className="text-xs border border-amber-200 text-amber-700 bg-white rounded-full px-2.5 py-1 active:bg-amber-50">
                  第 {s.dayIndex + 1} 天 {s.startTime}{s.distanceKm != null ? `（${s.distanceKm.toFixed(0)}km）` : ''}
                </button>
              ))}
            </div>
            <button onClick={() => setPicking(false)} className="text-xs text-gray-400">取消</button>
          </div>
        ) : (
          <button onClick={() => setPicking(true)} className="mt-2.5 w-full h-9 rounded-lg text-sm font-medium text-white" style={{ background: SHOP_COLOR }}>
            ＋ 排進某天
          </button>
        )}
      </div>
    </div>
  )
}
