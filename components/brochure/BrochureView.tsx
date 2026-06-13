import type { Itinerary, Activity, ItineraryDay } from '@/lib/types/itinerary'
import type { BrochureCache } from '@/lib/types/brochure'
import { formatDate } from '@/lib/utils/date'

/**
 * 宣傳冊雜誌版面（純呈現、唯讀、無任何編輯）。參考旅行社 DM 排版：
 * 封面 → 旅程總覽（含 AI 文案）→ 行程特色/亮點 → 距離參考 → 逐日章節 → 結尾。
 * ⚠️ 依需求不顯示任何金額；亦不顯示內部 notes / 預約連結 / 成員個資。
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

export function BrochureView({ itinerary, cache, token }: BrochureViewProps) {
  const { metadata, days } = itinerary
  const ver = cache?.generatedAt ? encodeURIComponent(cache.generatedAt) : '0'
  const copy = cache?.copy

  const photoUrl = (k: string) => `/api/share/${token}/photo?k=${encodeURIComponent(k)}&v=${ver}`
  const mapUrl = (day: string) => `/api/share/${token}/map?day=${day}&v=${ver}`
  const hasPhoto = (k: string) => !!cache?.photos?.[k]?.photoRef
  const hasDayMap = (dayIndex: number) => (cache?.dayPoints?.[dayIndex]?.length ?? 0) > 0
  const hasOverview = (cache?.overviewPoints?.length ?? 0) > 0
  const nights = Math.max(0, days.length - 1)

  const features = curateFeatures(itinerary, hasPhoto)
  const hasFeatures = features.scenic.length + features.food.length + features.stay.length > 0

  return (
    <article className="bg-white text-gray-800">
      {/* ── 封面 ───────────────────────────────────────────── */}
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

      {/* ── 旅程總覽 ───────────────────────────────────────── */}
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
                <span className="text-purple-400 flex-shrink-0">✦</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {hasOverview && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-6 aspect-[3/2] bg-indigo-50">
            <img src={mapUrl('overview')} alt="旅程路線總覽" className="w-full h-full object-cover block" />
          </div>
        )}

        <ol className="flex flex-col gap-2.5">
          {days.map((day) => (
            <li key={day.dayIndex} className="flex gap-3 items-baseline">
              <span className="font-serif text-purple-400 text-sm font-medium w-12 flex-shrink-0">Day {day.dayIndex + 1}</span>
              <span className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{day.city}</span>
                {day.theme ? <span className="text-gray-500"> · {day.theme}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 行程特色 / 亮點 ─────────────────────────────────── */}
      {hasFeatures && (
        <section className="border-t border-gray-100 bg-gray-50/50">
          <div className="max-w-2xl mx-auto px-6 py-10">
            <SectionTitle>行程特色</SectionTitle>
            {features.scenic.length > 0 && (
              <FeatureGroup label="精選景點" items={features.scenic} photoUrl={photoUrl} hasPhoto={hasPhoto} />
            )}
            {features.food.length > 0 && (
              <FeatureGroup label="特色美食" items={features.food} photoUrl={photoUrl} hasPhoto={hasPhoto} />
            )}
            {features.stay.length > 0 && (
              <FeatureGroup label="推薦住宿" items={features.stay} photoUrl={photoUrl} hasPhoto={hasPhoto} />
            )}
          </div>
        </section>
      )}

      {/* ── 景點距離參考 ───────────────────────────────────── */}
      {cache?.totalKm ? (
        <section className="border-t border-gray-100">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <SectionTitle>距離參考</SectionTitle>
            <p className="text-sm text-gray-500 mb-4">
              全程移動約 <span className="font-semibold text-gray-800">{cache.totalKm}</span> 公里（各點直線距離概估）
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

      {/* ── 逐日章節 ───────────────────────────────────────── */}
      {days.map((day) => (
        <DaySection key={day.dayIndex} day={day} photoUrl={photoUrl} mapUrl={mapUrl} hasPhoto={hasPhoto} hasDayMap={hasDayMap} />
      ))}

      {/* ── 結尾 ───────────────────────────────────────────── */}
      <footer className="max-w-2xl mx-auto px-6 py-12 text-center">
        <div className="w-12 h-0.5 bg-purple-200 mx-auto mb-5" />
        <p className="font-serif text-xl text-gray-800 mb-1">旅途愉快 ✦</p>
        <p className="text-xs text-gray-400">{metadata.destination} · {days.length} 天的旅程</p>
      </footer>
    </article>
  )
}

// ── 共用小標題 ────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-serif text-2xl text-gray-900 mb-1">{children}</h2>
      <div className="w-12 h-0.5 bg-purple-300 mb-6" />
    </>
  )
}

// ── 特色/亮點：精選項目 ───────────────────────────────────
interface FeatureItem { k: string; title: string; desc: string }

function curateFeatures(itin: Itinerary, hasPhoto: (k: string) => boolean) {
  const scenic: FeatureItem[] = []
  const food: FeatureItem[] = []
  const stay: FeatureItem[] = []
  for (const d of itin.days) {
    for (const a of d.activities) {
      const k = `${d.dayIndex}:${a.id}`
      if (a.type === 'food') {
        if (a.foodItems || a.intro || a.recommendation || hasPhoto(k)) {
          food.push({ k, title: a.title, desc: a.foodItems || a.recommendation || a.intro || '' })
        }
      } else if (a.type === 'sightseeing' || a.type === 'nature' || a.type === 'experience') {
        if (a.intro || a.recommendation || hasPhoto(k)) {
          scenic.push({ k, title: a.title, desc: a.intro || a.recommendation || '' })
        }
      }
    }
    if (d.accommodation) {
      stay.push({ k: `${d.dayIndex}:acc`, title: d.accommodation.name, desc: d.accommodation.location?.address || '' })
    }
  }
  // 有照片的優先、限制數量
  const pick = (arr: FeatureItem[], n: number) =>
    [...arr].sort((a, b) => (hasPhoto(b.k) ? 1 : 0) - (hasPhoto(a.k) ? 1 : 0)).slice(0, n)
  return { scenic: pick(scenic, 6), food: pick(food, 4), stay: pick(stay, 3) }
}

function FeatureGroup({
  label, items, photoUrl, hasPhoto,
}: {
  label: string
  items: FeatureItem[]
  photoUrl: (k: string) => string
  hasPhoto: (k: string) => boolean
}) {
  return (
    <div className="mb-8 last:mb-0">
      <p className="text-xs tracking-widest uppercase text-purple-400 font-medium mb-3">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
        {items.map((it) => (
          <div key={it.k}>
            <div className="rounded-xl overflow-hidden shadow-sm mb-2 aspect-[16/10] bg-gray-100">
              {hasPhoto(it.k) ? (
                <img src={photoUrl(it.k)} alt={it.title} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${gradFor(it.title)} flex items-center justify-center`}>
                  <span className="text-3xl opacity-40">✦</span>
                </div>
              )}
            </div>
            <p className="font-medium text-gray-900 text-sm leading-snug">{it.title}</p>
            {it.desc && <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">{it.desc}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 單日章節 ──────────────────────────────────────────────
function DaySection({
  day, photoUrl, mapUrl, hasPhoto, hasDayMap,
}: {
  day: ItineraryDay
  photoUrl: (k: string) => string
  mapUrl: (day: string) => string
  hasPhoto: (k: string) => boolean
  hasDayMap: (dayIndex: number) => boolean
}) {
  // 宣傳冊的逐日只放「景點」，交通不入（過於操作性）
  const spots = [...day.activities]
    .filter((a) => a.type !== 'transport')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const meals = mealSummary(day)

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

        {/* 早午晚宿摘要列 */}
        <div className="grid grid-cols-4 gap-2 mb-6 rounded-2xl bg-gray-50 p-3">
          {meals.map((m) => (
            <div key={m.label} className="text-center min-w-0">
              <div className="text-lg leading-none mb-1">{m.icon}</div>
              <div className="text-[10px] text-gray-400 mb-0.5">{m.label}</div>
              <div className="text-[11px] text-gray-700 leading-tight truncate" title={m.name}>{m.name}</div>
            </div>
          ))}
        </div>

        {/* 當天路線圖 */}
        {hasDayMap(day.dayIndex) && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-8 aspect-[16/9] bg-indigo-50">
            <img src={mapUrl(String(day.dayIndex))} alt={`Day ${day.dayIndex + 1} 路線`} className="w-full h-full object-cover block" />
          </div>
        )}

        {/* 景點（2 欄 grid，桌機 2 欄、手機 1 欄） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-7">
          {spots.map((a) => (
            <SpotBlock key={a.id} activity={a} photoKey={`${day.dayIndex}:${a.id}`} photoUrl={photoUrl} hasPhoto={hasPhoto} />
          ))}
        </div>

        {/* 住宿 */}
        {day.accommodation && (
          <AccommodationBlock accommodation={day.accommodation} photoKey={`${day.dayIndex}:acc`} photoUrl={photoUrl} hasPhoto={hasPhoto} />
        )}
      </div>
    </section>
  )
}

/** 早午晚宿摘要 */
function mealSummary(day: ItineraryDay) {
  const food = (kw: string) =>
    day.activities.find((a) => a.type === 'food' && (a.mealType?.includes(kw) ?? false))
  const name = (a?: Activity) => (a ? a.foodItems || a.placeLabel || a.title : '—')
  return [
    { icon: '🍳', label: '早', name: name(food('早')) },
    { icon: '🍱', label: '午', name: name(food('午')) },
    { icon: '🍽', label: '晚', name: name(food('晚')) },
    { icon: '🏨', label: '宿', name: day.accommodation?.name ?? '—' },
  ]
}

// ── 景點區塊 ──────────────────────────────────────────────
function SpotBlock({
  activity, photoKey, photoUrl, hasPhoto,
}: {
  activity: Activity
  photoKey: string
  photoUrl: (k: string) => string
  hasPhoto: (k: string) => boolean
}) {
  const a = activity
  const body = a.intro?.trim() || a.description?.trim()
  return (
    <div>
      <div className="rounded-2xl overflow-hidden shadow-sm mb-3 aspect-[16/10] bg-gray-100">
        {hasPhoto(photoKey) ? (
          <img src={photoUrl(photoKey)} alt={a.title} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradFor(a.title)} flex items-center justify-center`}>
            <span className="text-4xl opacity-40">{emojiFor(a)}</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs font-medium text-purple-500 tabular-nums flex-shrink-0">{a.startTime}</span>
        <h3 className="font-medium text-gray-900 leading-snug">{a.title}</h3>
      </div>
      {a.highlight && <p className="text-xs text-amber-600 mb-1">✦ {a.highlight}</p>}
      {body && <p className="text-sm text-gray-600 leading-relaxed">{body}</p>}
      {a.foodItems && <p className="text-sm text-gray-500 mt-1.5">🍽 {a.foodItems}</p>}
      {a.recommendation && (
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          <span className="text-purple-400">推薦 ·</span> {a.recommendation}
        </p>
      )}
    </div>
  )
}

// ── 住宿區塊 ──────────────────────────────────────────────
function AccommodationBlock({
  accommodation, photoKey, photoUrl, hasPhoto,
}: {
  accommodation: NonNullable<ItineraryDay['accommodation']>
  photoKey: string
  photoUrl: (k: string) => string
  hasPhoto: (k: string) => boolean
}) {
  const acc = accommodation
  return (
    <div className="mt-8 rounded-2xl border border-gray-100 overflow-hidden bg-gray-50/60">
      <div className="aspect-[16/9] bg-gray-100">
        {hasPhoto(photoKey) ? (
          <img src={photoUrl(photoKey)} alt={acc.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradFor(acc.name)} flex items-center justify-center`}>
            <span className="text-4xl opacity-40">🏨</span>
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-xs tracking-widest uppercase text-gray-400 mb-0.5">今晚住宿</p>
        <p className="font-medium text-gray-900">{acc.name}</p>
        {acc.location?.address && <p className="text-xs text-gray-400 mt-0.5">{acc.location.address}</p>}
      </div>
    </div>
  )
}
