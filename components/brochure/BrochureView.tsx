import type { Itinerary, Activity, ItineraryDay } from '@/lib/types/itinerary'
import type { BrochureCache } from '@/lib/types/brochure'
import { formatDate } from '@/lib/utils/date'

/**
 * 宣傳冊雜誌版面（純呈現、唯讀）。差異化設計：
 * - 行程特色頁＝大圖精選（少量、大卡、視覺強）
 * - 每日章節＝行程簡表 + 當日地圖 + 時間軸（小縮圖＋文字，資訊密）
 * 另含：總覽全程簡表、距離參考（實際開車）、雙指縮放、圖片 lazy。
 * ⚠️ 不顯示任何金額 / 內部 notes / 預約連結 / 成員個資。
 */

interface BrochureViewProps {
  itinerary: Itinerary
  cache: BrochureCache | null
  token: string
}

const GRADIENTS = [
  'from-violet-200 to-indigo-300',
  'from-rose-200 to-fuchsia-300',
  'from-sky-200 to-indigo-300',
  'from-amber-200 to-rose-300',
  'from-emerald-200 to-teal-300',
  'from-cyan-200 to-blue-300',
]
function gradFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}
function emojiFor(a: Activity): string {
  switch (a.type) {
    case 'food': return '🍜'
    case 'nature': return '🌿'
    case 'shopping': return '🛍'
    case 'experience': return '🎫'
    case 'rest': return '☕'
    default: return '✦'
  }
}

/** 一列行程簡表的內容（時間＋活動） */
interface SchedRow { time: string; text: string }
function scheduleRows(day: ItineraryDay): SchedRow[] {
  const acts = [...day.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const rows: SchedRow[] = acts.map((a) => {
    let text = a.title
    if (a.type === 'food' && a.mealType && !a.title.includes(a.mealType)) text = `${a.mealType}・${a.title}`
    return { time: a.startTime, text }
  })
  if (day.accommodation) rows.push({ time: '宿', text: day.accommodation.name })
  return rows
}

export function BrochureView({ itinerary, cache, token }: BrochureViewProps) {
  const { metadata, days } = itinerary
  const ver = cache?.generatedAt ? encodeURIComponent(cache.generatedAt) : '0'
  const copy = cache?.copy

  // 照片走「共用 proxy」（以 photoRef 為鍵）→ 與景點卡詳情共用 CDN 快取，同張圖全站只抓一次
  const photoRefOf = (k: string) => cache?.photos?.[k]?.photoRef ?? ''
  const photoUrl = (k: string) => `/api/photo?ref=${encodeURIComponent(photoRefOf(k))}`
  const mapUrl = (day: string) => `/api/share/${token}/map?day=${day}&v=${ver}`
  const hasPhoto = (k: string) => !!cache?.photos?.[k]?.photoRef
  const hasDayMap = (dayIndex: number) => (cache?.dayPoints?.[dayIndex]?.length ?? 0) > 0
  const hasOverview = (cache?.overviewPoints?.length ?? 0) > 0
  const nights = Math.max(0, days.length - 1)

  const features = curateFeatures(itinerary, hasPhoto)
  const hasFeatures = features.scenic.length + features.food.length + features.stay.length > 0

  return (
    <article className="bg-white text-gray-800">
      {/* ── 封面（圖不 lazy，首屏要立即出現）── */}
      <header className="relative min-h-[68vh] flex items-end overflow-hidden">
        {hasPhoto('cover') ? (
          <img src={photoUrl('cover')} alt={metadata.destination} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradFor(metadata.destination)}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
        <div className="relative w-full max-w-2xl mx-auto px-6 pb-12 text-white">
          <p className="text-sm tracking-[0.3em] uppercase opacity-80 mb-3 font-serif italic">
            {copy?.subtitle || 'Travel Journal'}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight mb-3">{metadata.title}</h1>
          {copy?.tagline && <p className="text-base opacity-90 mb-4">{copy.tagline}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-90">
            <span>📍 {metadata.destination}</span>
            <span className="opacity-50">·</span>
            <span>{days.length} 天{nights > 0 ? ` ${nights} 夜` : ''}</span>
            <span className="opacity-50">·</span>
            <span>{metadata.travelers} 人同行</span>
          </div>
          <p className="mt-2 text-sm opacity-80">{formatDate(metadata.startDate)} － {formatDate(metadata.endDate)}</p>
        </div>
      </header>

      {/* ── 旅程總覽 ── */}
      <section className="max-w-2xl mx-auto px-6 py-10">
        <SectionTitle>旅程總覽</SectionTitle>

        {copy?.intro && <p className="text-[15px] text-gray-600 leading-loose mb-6">{copy.intro}</p>}

        {metadata.style && metadata.style.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {metadata.style.map((s) => (
              <span key={s} className="text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-600">{s}</span>
            ))}
          </div>
        )}

        {copy?.highlights && copy.highlights.length > 0 && (
          <ul className="flex flex-col gap-2 mb-6">
            {copy.highlights.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                <span className="text-purple-400 flex-shrink-0">✦</span><span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {hasOverview && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-8 aspect-[3/2] bg-indigo-50">
            <img src={mapUrl('overview')} alt="旅程路線總覽" loading="lazy" decoding="async" className="w-full h-full object-cover block" />
          </div>
        )}

        {/* 全程行程簡表（純文字，時間｜活動） */}
        <p className="text-xs tracking-widest uppercase text-purple-400 font-medium mb-3">行程簡表</p>
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <div key={day.dayIndex}>
              <p className="text-sm font-medium text-gray-900 mb-1.5">
                <span className="font-serif text-purple-400 mr-2">Day {day.dayIndex + 1}</span>
                {day.city}{day.theme ? <span className="text-gray-400 font-normal"> · {day.theme}</span> : null}
              </p>
              <ScheduleRows rows={scheduleRows(day)} />
            </div>
          ))}
        </div>
      </section>

      {/* ── 行程特色（大圖精選）── */}
      {hasFeatures && (
        <section className="border-t border-gray-100 bg-gray-50/50">
          <div className="max-w-2xl mx-auto px-6 py-10">
            <SectionTitle>行程特色</SectionTitle>
            {features.scenic.length > 0 && <FeatureGroup label="精選景點" items={features.scenic} photoUrl={photoUrl} hasPhoto={hasPhoto} />}
            {features.food.length > 0 && <FeatureGroup label="特色美食" items={features.food} photoUrl={photoUrl} hasPhoto={hasPhoto} />}
            {features.stay.length > 0 && <FeatureGroup label="推薦住宿" items={features.stay} photoUrl={photoUrl} hasPhoto={hasPhoto} />}
          </div>
        </section>
      )}

      {/* ── 距離參考（實際開車概估）── */}
      {cache?.totalKm ? (
        <section className="border-t border-gray-100">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <SectionTitle>距離參考</SectionTitle>
            <p className="text-sm text-gray-500 mb-4">
              全程移動約 <span className="font-semibold text-gray-800">{cache.totalKm}</span> 公里（依實際路線概估）
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {days.map((day) =>
                cache.dayKm?.[day.dayIndex] ? (
                  <div key={day.dayIndex} className="flex items-baseline justify-between text-sm border-b border-gray-50 py-1">
                    <span className="text-gray-400">Day {day.dayIndex + 1}</span>
                    <span className="text-gray-700 tabular-nums">{cache.dayKm[day.dayIndex]} km</span>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 逐日章節 ── */}
      {days.map((day) => (
        <DaySection key={day.dayIndex} day={day} photoUrl={photoUrl} mapUrl={mapUrl} hasPhoto={hasPhoto} hasDayMap={hasDayMap} />
      ))}

      <footer className="max-w-2xl mx-auto px-6 py-12 text-center">
        <div className="w-12 h-0.5 bg-purple-200 mx-auto mb-5" />
        <p className="font-serif text-xl text-gray-800 mb-1">旅途愉快 ✦</p>
        <p className="text-xs text-gray-400">{metadata.destination} · {days.length} 天的旅程</p>
      </footer>
    </article>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-serif text-2xl text-gray-900 mb-1">{children}</h2>
      <div className="w-12 h-0.5 bg-purple-300 mb-6" />
    </>
  )
}

/** 純文字行程簡表的列 */
function ScheduleRows({ rows }: { rows: SchedRow[] }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 py-1 text-[13px] leading-relaxed border-b border-gray-100 last:border-0">
          <span className={`flex-shrink-0 w-12 tabular-nums ${r.time === '宿' ? 'text-amber-500' : 'text-purple-500'}`}>
            {r.time === '宿' ? '🏨 宿' : r.time}
          </span>
          <span className="text-gray-700">{r.text}</span>
        </div>
      ))}
    </div>
  )
}

// ── 特色/亮點：大圖精選（去重）──
interface FeatureItem { k: string; title: string; desc: string }
function curateFeatures(itin: Itinerary, hasPhoto: (k: string) => boolean) {
  const scenic: FeatureItem[] = []
  const food: FeatureItem[] = []
  const stay: FeatureItem[] = []
  const seen = new Set<string>() // 依標題去重（跨天同地點只留一次）
  for (const d of itin.days) {
    for (const a of d.activities) {
      const k = `${d.dayIndex}:${a.id}`
      const key = a.title.trim()
      if (a.type === 'food') {
        if (seen.has('f:' + key)) continue
        if (a.foodItems || a.intro || a.recommendation || hasPhoto(k)) {
          seen.add('f:' + key)
          food.push({ k, title: a.title, desc: a.foodItems || a.recommendation || a.intro || '' })
        }
      } else if (a.type === 'sightseeing' || a.type === 'nature' || a.type === 'experience') {
        if (seen.has('s:' + key)) continue
        if (a.intro || a.recommendation || hasPhoto(k)) {
          seen.add('s:' + key)
          scenic.push({ k, title: a.title, desc: a.intro || a.recommendation || '' })
        }
      }
    }
    if (d.accommodation) {
      const key = d.accommodation.name.trim()
      if (!seen.has('h:' + key)) {
        seen.add('h:' + key)
        stay.push({ k: `${d.dayIndex}:acc`, title: d.accommodation.name, desc: d.accommodation.location?.address || '' })
      }
    }
  }
  // 有照片優先、限量（大圖精選 → 少量）
  const pick = (arr: FeatureItem[], n: number) =>
    [...arr].sort((a, b) => (hasPhoto(b.k) ? 1 : 0) - (hasPhoto(a.k) ? 1 : 0)).slice(0, n)
  return { scenic: pick(scenic, 4), food: pick(food, 3), stay: pick(stay, 3) }
}

function FeatureGroup({
  label, items, photoUrl, hasPhoto,
}: { label: string; items: FeatureItem[]; photoUrl: (k: string) => string; hasPhoto: (k: string) => boolean }) {
  return (
    <div className="mb-9 last:mb-0">
      <p className="text-xs tracking-widest uppercase text-purple-400 font-medium mb-4">{label}</p>
      <div className="flex flex-col gap-7">
        {items.map((it) => (
          <div key={it.k}>
            <div className="rounded-2xl overflow-hidden shadow-md mb-3 aspect-[16/9] bg-gray-100">
              {hasPhoto(it.k) ? (
                <img src={photoUrl(it.k)} alt={it.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${gradFor(it.title)} flex items-center justify-center`}>
                  <span className="text-5xl opacity-40">✦</span>
                </div>
              )}
            </div>
            <h3 className="font-serif text-lg text-gray-900 leading-snug mb-1">{it.title}</h3>
            {it.desc && <p className="text-sm text-gray-600 leading-relaxed">{it.desc}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 單日章節：簡表 → 地圖 → 時間軸（小縮圖）──
function DaySection({
  day, photoUrl, mapUrl, hasPhoto, hasDayMap,
}: {
  day: ItineraryDay
  photoUrl: (k: string) => string
  mapUrl: (day: string) => string
  hasPhoto: (k: string) => boolean
  hasDayMap: (dayIndex: number) => boolean
}) {
  // 時間軸只放「景點」（交通與用餐在簡表已呈現）
  const spots = [...day.activities]
    .filter((a) => a.type !== 'transport')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <section className="border-t border-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 章節標題 */}
        <div className="mb-5">
          <div className="flex items-baseline gap-3 mb-1">
            <span className="font-serif text-4xl text-purple-300 leading-none">{String(day.dayIndex + 1).padStart(2, '0')}</span>
            <div>
              <p className="text-xs tracking-widest uppercase text-gray-400">Day {day.dayIndex + 1}</p>
              <p className="text-sm text-gray-500">{formatDate(day.date)}</p>
            </div>
          </div>
          <h2 className="font-serif text-2xl text-gray-900">{day.city}</h2>
          {day.theme && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{day.theme}</p>}
        </div>

        {/* 當日行程簡表 */}
        <div className="mb-6">
          <ScheduleRows rows={scheduleRows(day)} />
        </div>

        {/* 當天路線圖 */}
        {hasDayMap(day.dayIndex) && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-8 aspect-[16/9] bg-indigo-50">
            <img src={mapUrl(String(day.dayIndex))} alt={`Day ${day.dayIndex + 1} 路線`} loading="lazy" decoding="async" className="w-full h-full object-cover block" />
          </div>
        )}

        {/* 時間軸（小縮圖 + 文字）*/}
        <div className="flex flex-col">
          {spots.map((a, i) => (
            <TimelineItem
              key={a.id}
              activity={a}
              photoKey={`${day.dayIndex}:${a.id}`}
              photoUrl={photoUrl}
              hasPhoto={hasPhoto}
              last={i === spots.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function TimelineItem({
  activity, photoKey, photoUrl, hasPhoto, last,
}: {
  activity: Activity
  photoKey: string
  photoUrl: (k: string) => string
  hasPhoto: (k: string) => boolean
  last: boolean
}) {
  const a = activity
  const body = a.intro?.trim() || a.description?.trim()
  return (
    <div className="flex gap-3">
      {/* 左：時間 + 時間軸線 */}
      <div className="flex flex-col items-center flex-shrink-0 w-12">
        <span className="text-xs font-medium text-purple-500 tabular-nums">{a.startTime}</span>
        <span className="w-2 h-2 rounded-full bg-purple-300 mt-1.5" />
        {!last && <span className="w-px flex-1 bg-purple-100 my-1" />}
      </div>
      {/* 右：縮圖 + 內容 */}
      <div className={`flex gap-3 flex-1 min-w-0 ${last ? '' : 'pb-6'}`}>
        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          {hasPhoto(photoKey) ? (
            <img src={photoUrl(photoKey)} alt={a.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradFor(a.title)} flex items-center justify-center`}>
              <span className="text-2xl opacity-40">{emojiFor(a)}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 leading-snug">{a.title}</h3>
          {a.highlight && <p className="text-xs text-amber-600 mt-0.5">✦ {a.highlight}</p>}
          {body && <p className="text-sm text-gray-600 leading-relaxed mt-1">{body}</p>}
          {a.foodItems && <p className="text-sm text-gray-500 mt-1">🍽 {a.foodItems}</p>}
        </div>
      </div>
    </div>
  )
}
