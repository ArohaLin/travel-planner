'use client'

import type { Activity, GeoLocation } from '@/lib/types/itinerary'
import { clsx } from 'clsx'
import { RESERVATION, effectiveReservation } from '@/lib/itinerary/reservation'
import { toneFor } from '@/lib/itinerary/cardTone'

/** Google Maps 導航連結：有座標用座標（較精準），否則用地址文字 */
export function mapsNavUrl(loc: GeoLocation): string {
  const hasCoords = loc.lat !== 0 || loc.lng !== 0
  const dest = hasCoords ? `${loc.lat},${loc.lng}` : (loc.address ?? '')
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
}

/**
 * 依活動類型組裝卡片主標題的精簡格式：
 * - 景點：景點名稱（地點）
 * - 交通：A → B（交通方式）
 * - 餐飲：餐別：店名（地點）（飲食項目）
 * - 其它：名稱（地點）
 */
export function formatCardMain(activity: Activity): string {
  const t = activity.type
  const paren = (s?: string) => (s && s.trim() ? `（${s.trim()}）` : '')
  if (t === 'transport') {
    const from = activity.fromLabel?.trim()
    const to = activity.toLabel?.trim()
    if (from && to) return `${from} → ${to}${paren(activity.transportMode)}`
    return `${activity.title}${paren(activity.transportMode)}`
  }
  if (t === 'food') {
    const meal = activity.mealType?.trim()
    const prefix = meal ? `${meal}：` : ''
    return `${prefix}${activity.title}${paren(activity.placeLabel)}${paren(activity.foodItems)}`
  }
  return `${activity.title}${paren(activity.placeLabel)}`
}

/**
 * 景點列內容（簡潔風時間軸）：主標題 ＋ 類型彩色膠囊／預約狀態 ＋ 地址 ＋ 特別註解 ＋ 右側照片縮圖。
 * 停留時長改放左側時間欄；不含編輯/刪除/備註鈕——這些移到「點卡片→詳情視窗」內，讓列表保持乾淨。
 */
export function ActivityContent({ activity }: { activity: Activity }) {
  const tone = toneFor(activity.type)
  const resv = effectiveReservation(activity)

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 leading-snug text-[15px]">{formatCardMain(activity)}</h3>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', tone.pill)}>{tone.label}</span>
          {resv !== 'none' && (
            <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', RESERVATION[resv].badge)}>
              {RESERVATION[resv].icon} {RESERVATION[resv].label}
            </span>
          )}
        </div>
        {activity.type !== 'transport' && activity.location?.address && (
          <a
            href={mapsNavUrl(activity.location)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block text-[11px] text-blue-500 underline decoration-blue-200 underline-offset-2 mt-1 leading-relaxed active:text-blue-700"
          >
            📍 {activity.location.address}
          </a>
        )}
        {activity.highlight && activity.highlight.trim() && (
          <p className="text-[11px] text-amber-600 mt-1 leading-relaxed">（{activity.highlight.trim()}）</p>
        )}
      </div>
      {activity.photoRef && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photo?ref=${encodeURIComponent(activity.photoRef)}`}
          alt=""
          loading="lazy"
          className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100"
        />
      )}
    </div>
  )
}
