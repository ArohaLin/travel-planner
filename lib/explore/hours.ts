/**
 * 營業時間判斷（探索面板共用）。
 * 資料源：GET /api/place/hours?placeId= → { businessStatus, periods, weekdayText }。
 * 純前端判斷，給「此時段是否營業」「現在開不開」用。
 */

export interface Hours {
  businessStatus: string | null
  periods:
    | { open?: { day: number; time: string }; close?: { day: number; time: string } }[]
    | null
  /** 每日營業時間人類可讀文字（如 "星期一: 10:00 – 22:00"）；詳情視窗顯示用 */
  weekdayText?: string[] | null
}

const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2))

/**
 * 指定星期幾（0=週日）＋分鐘數（自午夜起）是否在營業時段內。
 * 回傳 true=營業 / false=未營業 / null=無資料。
 */
export function isOpenAt(h: Hours | null, weekday: number, minutes: number): boolean | null {
  if (!h || !h.periods) return null
  if (h.businessStatus && h.businessStatus !== 'OPERATIONAL') return false
  // 單一 period 且 open 0000 無 close = 24 小時營業
  if (h.periods.length === 1 && h.periods[0].open?.time === '0000' && !h.periods[0].close) return true
  const cand = weekday * 1440 + minutes
  for (const p of h.periods) {
    if (!p.open || !p.close) continue
    const o = p.open.day * 1440 + hhmm(p.open.time)
    let c = p.close.day * 1440 + hhmm(p.close.time)
    if (c <= o) c += 7 * 1440 // 跨夜/跨週
    if ((cand >= o && cand < c) || (cand + 7 * 1440 >= o && cand + 7 * 1440 < c)) return true
  }
  return false
}

/** 行程日期字串（YYYY-MM-DD）→ 星期幾（0=週日）。 */
export const weekdayOf = (date: string) => new Date(date + 'T00:00:00').getDay()

/** 時段字串（HH:MM）→ 自午夜起的分鐘數。 */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
