'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { MyLocationButton } from '@/components/map/MyLocationButton'
import type { ItineraryDay, GeoLocation } from '@/lib/types/itinerary'
import type { Recommendation } from '@/lib/types/recommendation'
import { foodIcon } from '@/lib/explore/foodIcons'
import { suggestSlots, type Slot } from '@/lib/explore/placement'
import { isOpenAt, weekdayOf, toMin, type Hours } from '@/lib/explore/hours'

const FOOD_COLOR = '#D85A30' // 美食主色（橘紅）
const ROUTE_COLOR = '#2563eb' // 行程脈絡（藍）
const TAIWAN_CENTER = { lat: 23.6978, lng: 120.9605 }

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

interface RoutePoint {
  lat: number
  lng: number
  label: string
  acc: boolean
}

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

interface FoodMapProps {
  /** 美食推薦（已 filter category==='美食'，featured + longlist） */
  recs: Recommendation[]
  days: ItineraryDay[]
  inWishlist: Set<string>
  /** 已在行程的名稱（判斷已加入） */
  inItineraryNames: Set<string>
  busyId: string | null
  onAddToWishlist: (r: Recommendation) => void
  /** 排進某天（先確保入願望清單再排入） */
  onAddToDay: (r: Recommendation, dayIndex: number, startTime: string) => void
  /** 點彈卡主體 → 開完整詳情 */
  onOpenDetail: (r: Recommendation) => void
}

export function FoodMap({
  recs, days, inWishlist, inItineraryNames, busyId, onAddToWishlist, onAddToDay, onOpenDetail,
}: FoodMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showRoute, setShowRoute] = useState(true)

  const mappable = useMemo(() => recs.filter((r) => r.lat != null && r.lng != null), [recs])
  const selected = mappable.find((r) => r.id === selectedId) ?? null
  const hiddenCount = recs.length - mappable.length

  const center = mappable.length
    ? { lat: mappable[0].lat as number, lng: mappable[0].lng as number }
    : TAIWAN_CENTER

  return (
    <div className="relative w-full h-full bg-gray-100">
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
        <FoodMapContent
          recs={mappable}
          days={days}
          showRoute={showRoute}
          selectedId={selectedId}
          onSelect={(r) => setSelectedId(r.id)}
        />
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

      {/* 圖例 */}
      <div className="absolute top-3 right-3 z-10 bg-white/95 rounded-xl shadow-md px-3 py-2 text-[11px] text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: FOOD_COLOR }} />精選美食</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-white" style={{ border: `2px solid ${FOOD_COLOR}` }} />漏網之魚</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: ROUTE_COLOR }} />行程景點</div>
      </div>

      {/* 無座標提示 */}
      {hiddenCount > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-white/90 rounded-full px-3 py-1 text-[11px] text-gray-400 shadow">
          {hiddenCount} 家無座標未顯示
        </div>
      )}

      {/* 底部彈卡 */}
      {selected && (
        <FoodCard
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
  )
}

function FoodMapContent({
  recs, days, showRoute, selectedId, onSelect,
}: {
  recs: Recommendation[]
  days: ItineraryDay[]
  showRoute: boolean
  selectedId: string | null
  onSelect: (r: Recommendation) => void
}) {
  const map = useMap()

  // fitBounds 到所有美食點
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

  return (
    <>
      {showRoute && <RouteLayer days={days} />}
      {recs.map((r) => {
        const featured = r.tier === 'featured'
        const isSel = r.id === selectedId
        return (
          <Marker
            key={r.id}
            position={{ lat: r.lat as number, lng: r.lng as number }}
            onClick={() => onSelect(r)}
            zIndex={isSel ? 999 : featured ? 10 : 5}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: featured ? (isSel ? 16 : 12) : isSel ? 11 : 7,
              fillColor: featured ? FOOD_COLOR : '#ffffff',
              fillOpacity: 1,
              strokeColor: featured ? '#ffffff' : FOOD_COLOR,
              strokeWeight: isSel ? 3 : featured ? 2.5 : 2,
            }}
            label={
              featured
                ? { text: foodIcon(r.subCategory, r.name), fontSize: isSel ? '15px' : '13px' }
                : undefined
            }
          />
        )
      })}
    </>
  )
}

/** 行程脈絡層：每天的景點藍色數字 marker（住宿為「宿」方形）＋直線連接。 */
function RouteLayer({ days }: { days: ItineraryDay[] }) {
  const map = useMap()
  const dayList = useMemo(
    () => days.map((d) => dayRoutePoints(d)).filter((pts) => pts.length > 0),
    [days],
  )

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

/** 底部彈卡：選中美食的摘要＋動作（加入願望／排進某天／進詳情）。 */
function FoodCard({
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

      {/* 主體（點擊進詳情） */}
      <button onClick={onDetail} className="w-full text-left flex gap-3 p-3">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={rec.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
          : <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-2xl">{foodIcon(rec.subCategory, rec.name)}</div>}
        <div className="flex-1 min-w-0 pr-6">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{rec.name}</h3>
          {rec.ratingSnapshot != null && (
            <p className="text-xs text-amber-600 mt-0.5">★ {rec.ratingSnapshot}{rec.reviewsSnapshot != null && <span className="text-gray-400">（{rec.reviewsSnapshot}）</span>}</p>
          )}
          <div className="flex flex-wrap items-center gap-1 mt-1">
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

      {/* 動作列 / 選天時段 */}
      <div className="px-3 pb-3">
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
              className={`flex-1 h-9 rounded-lg text-sm font-medium border ${added ? 'border-gray-100 text-gray-400' : 'border-gray-200 text-gray-700 active:bg-gray-50'}`}
            >
              {busy ? '…' : added ? '✓ 已加入' : '♡ 加入願望'}
            </button>
            <button
              onClick={() => setPicking(true)}
              disabled={busy}
              className="flex-1 h-9 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: FOOD_COLOR }}
            >
              ＋ 排進某天
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
