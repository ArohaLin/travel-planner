'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { ItineraryDay, GeoLocation } from '@/lib/types/itinerary'
import type { Recommendation, RecommendationCategory } from '@/lib/types/recommendation'
import { foodIcon } from '@/lib/explore/foodIcons'
import { suggestSlots, type Slot } from '@/lib/explore/placement'
import { isOpenAt, weekdayOf, toMin, type Hours } from '@/lib/explore/hours'
import { MyLocationButton } from '@/components/map/MyLocationButton'

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

const FILTERS: Array<'全部' | RecommendationCategory> = ['全部', '景點', '美食', '住宿', '親子']

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
  inWishlist: Set<string>
  inItineraryNames: Set<string>
  busyId: string | null
  onAddToWishlist: (r: Recommendation) => void
  onAddToDay: (r: Recommendation, dayIndex: number, startTime: string) => void
  onOpenDetail: (r: Recommendation) => void
}

export function ExploreMap({
  recs, days, inWishlist, inItineraryNames, busyId, onAddToWishlist, onAddToDay, onOpenDetail,
}: ExploreMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRoute, setShowRoute] = useState(true)
  const [filter, setFilter] = useState<'全部' | RecommendationCategory>('全部')

  const withCoord = useMemo(() => recs.filter((r) => r.lat != null && r.lng != null), [recs])
  const mappable = useMemo(
    () => (filter === '全部' ? withCoord : withCoord.filter((r) => r.category === filter)),
    [withCoord, filter],
  )
  // 列表排序：精選優先，再評分高到低
  const list = useMemo(
    () => [...mappable].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'featured' ? -1 : 1
      return (b.ratingSnapshot ?? 0) - (a.ratingSnapshot ?? 0)
    }),
    [mappable],
  )

  const selected = mappable.find((r) => r.id === selectedId) ?? null
  const center = withCoord.length ? { lat: withCoord[0].lat as number, lng: withCoord[0].lng as number } : TAIWAN_CENTER

  // 切換類型後若選取已不在範圍內，清掉
  useEffect(() => {
    if (selectedId && !mappable.some((r) => r.id === selectedId)) setSelectedId(null)
  }, [mappable, selectedId])

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
          <ExploreMapContent recs={mappable} days={days} showRoute={showRoute} selectedId={selectedId} onSelect={setSelectedId} />
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
      </div>

      {/* 右側列表欄 */}
      <div className="w-[42%] max-w-[200px] flex flex-col border-l border-gray-100 bg-white">
        <div className="flex-shrink-0 px-2 py-2 border-b border-gray-50 flex gap-1 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f
            const color = f === '全部' ? '#6b7280' : catColor(f)
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-shrink-0 px-2 py-1 rounded-full text-[11px] font-medium border"
                style={active ? { background: color, color: '#fff', borderColor: color } : { color: '#6b7280', borderColor: '#e5e7eb' }}
              >
                {f}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto scroll-touch">
          {list.length === 0 ? (
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
      </div>
    </div>
  )
}

function ExploreMapContent({
  recs, days, showRoute, selectedId, onSelect,
}: {
  recs: Recommendation[]
  days: ItineraryDay[]
  showRoute: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const map = useMap()

  // fitBounds 到目前篩選後的點
  const boundsKey = recs.map((r) => `${r.lat},${r.lng}`).join('|')
  useEffect(() => {
    if (!map || recs.length === 0) return
    if (recs.length === 1) {
      map.setCenter({ lat: recs[0].lat as number, lng: recs[0].lng as number })
      map.setZoom(15)
      return
    }
    const b = new google.maps.LatLngBounds()
    recs.forEach((r) => b.extend({ lat: r.lat as number, lng: r.lng as number }))
    if (!b.isEmpty()) map.fitBounds(b, 56)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey])

  // 選中（含右側列表點擊）→ 平移到該點
  useEffect(() => {
    if (!map || !selectedId) return
    const r = recs.find((x) => x.id === selectedId)
    if (r && r.lat != null && r.lng != null) {
      map.panTo({ lat: r.lat, lng: r.lng })
      if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
    }
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
