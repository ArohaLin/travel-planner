import type { ItineraryDay } from '@/lib/types/itinerary'
import { buildDaySummary } from '@/lib/itinerary/summaryRows'
import { deriveDayCity } from '@/lib/itinerary/deriveCity'

interface SummaryViewProps {
  day: ItineraryDay
  /** 該天日期顯示用，如「8/18（二）」 */
  dateLabel: string
  /** 出發地（前一晚住宿或出發城市） */
  departure?: { name: string } | null
  /** 旅程終點（最後一天的返回地） */
  arrival?: { name: string } | null
}

/**
 * 手帳貼紙風唯讀簡表（樣版 A）：
 * 頁首插圖 → 三餐快覽 → 住宿 → 簡表（時間區段｜時長｜景點｜內容｜備註）。
 * 排除移動列、含出發+結束、隨行程自動變、適合截圖分享。
 */
export function SummaryView({ day, dateLabel, departure, arrival }: SummaryViewProps) {
  const { meals, accommodation, rows } = buildDaySummary(day, departure, arrival)

  return (
    <div className="px-4 pt-3 pb-6">
      <div className="rounded-[18px] bg-[#E9E2D0] p-3.5">
        <div className="relative overflow-hidden rounded-[14px] bg-[#FBF7EC] px-3.5 pt-4 pb-5 text-[#5A4A3A]">
          {/* 紙膠帶裝飾 */}
          <div
            className="absolute -right-5 top-3 h-[22px] w-[90px] rotate-[8deg] bg-[#A8D5BA] opacity-70"
            aria-hidden
          />

          {/* 頁首：標題 + AI 插圖小 motif */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[19px] font-semibold leading-tight">
                第 {day.dayIndex + 1} 天 · {deriveDayCity(day)}
              </div>
              <div className="mt-0.5 text-xs text-[#A38B6E]">
                {dateLabel}
                {day.theme ? ` · ${day.theme}` : ''}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/summary-illust.png"
              alt=""
              className="h-[64px] w-auto flex-shrink-0 object-contain mix-blend-multiply"
            />
          </div>

          {/* 三餐快覽 */}
          <div className="mb-3 flex gap-1.5">
            <MealCard emoji="🥐" label="早餐" name={meals.breakfast} />
            <MealCard emoji="🍽️" label="午餐" name={meals.lunch} />
            <MealCard emoji="🍜" label="晚餐" name={meals.dinner} />
          </div>

          {/* 住宿 */}
          {accommodation && (
            <div className="mb-3.5 flex items-center gap-2 rounded-[10px] bg-[#EFEAFB] px-3 py-2">
              <span className="text-lg leading-none">🏨</span>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold">住宿 · {accommodation.name}</span>
                <span className="ml-1.5 text-[11px] text-[#9A8FB5]">入住 {accommodation.checkIn}</span>
              </div>
            </div>
          )}

          {/* 簡表 */}
          <table className="w-full table-fixed border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10.5px] text-[#B89A72]">
                <td className="w-[46px] px-0.5 pb-1">時間</td>
                <td className="w-[34px] px-0.5 pb-1">時長</td>
                <td className="w-[74px] px-0.5 pb-1">景點</td>
                <td className="px-0.5 pb-1">內容</td>
                <td className="w-[46px] px-0.5 pb-1 text-center">備註</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (r.kind === 'depart' || r.kind === 'end') {
                  const tone = r.kind === 'depart' ? 'text-[#8A9B6A]' : 'text-[#C58B6A]'
                  return (
                    <tr key={i} className="bg-[#F3EFE2]">
                      <td colSpan={5} className={`rounded-md px-1.5 py-1.5 font-semibold ${tone}`}>
                        {r.icon} {r.time && <span className="tabular-nums">{r.time} </span>}
                        {r.content} · {r.place}
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={i} className={i % 2 ? 'bg-[#FBF9F1]' : ''}>
                    <td className="px-0.5 py-1.5 align-top tabular-nums text-[#7A6A52]">
                      {r.time.includes('–') ? (
                        <>
                          {r.time.split('–')[0].trim()}<br />–{r.time.split('–')[1].trim()}
                        </>
                      ) : r.time}
                    </td>
                    <td className="px-0.5 py-1.5 align-top leading-tight text-[#A38B6E]">{r.duration}</td>
                    <td className="px-0.5 py-1.5 align-top leading-snug">
                      <span className="text-[13px]">{r.icon}</span> {r.place}
                    </td>
                    <td className="px-0.5 py-1.5 align-top leading-snug text-[#6B5B47]">
                      <span className="line-clamp-2">{r.content}</span>
                    </td>
                    <td className="px-0.5 py-1.5 text-center align-top">
                      {r.needBooking ? (
                        <span className="inline-block rounded-[5px] bg-[#FBE0B0] px-1 py-[1px] text-[9.5px] leading-tight text-[#9A6B1F]">
                          需預約
                        </span>
                      ) : r.note ? (
                        <span className="inline-block rounded-[5px] bg-[#F3EFE2] px-1 py-[1px] text-[9.5px] leading-tight text-[#8A7558]">
                          {r.note}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="mt-3 text-center text-[10px] text-[#C9B89A]">
            ✿ 唯讀簡表 · 隨行程自動更新 ✿
          </div>
        </div>
      </div>
    </div>
  )
}

function MealCard({ emoji, label, name }: { emoji: string; label: string; name: string | null }) {
  return (
    <div className="flex-1 rounded-[10px] border border-dashed border-[#E3C9A0] bg-white px-1 py-1.5 text-center">
      <div className="text-[11px] text-[#C9A876]">
        {emoji} {label}
      </div>
      <div className="mt-0.5 truncate text-[12px] font-semibold">{name ?? '—'}</div>
    </div>
  )
}
