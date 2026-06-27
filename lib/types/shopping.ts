/**
 * 採購清單型別。
 * 兩個綁定維度：地點（綁店家 place_* / null=隨處）、時間（day_indexes / 空=隨時）。
 */

export interface ShoppingItem {
  id: string
  itineraryId: string
  name: string
  quantity: string | null
  note: string | null
  /** 綁店家：Google place id（null=隨處，到處有賣） */
  placeId: string | null
  placeName: string | null
  lat: number | null
  lng: number | null
  /** 綁哪幾天（dayIndex 陣列，空=隨時） */
  dayIndexes: number[]
  isDone: boolean
  createdBy: string | null
  createdAt: string
}

/** DB（snake_case）→ 前端（camelCase） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapShopping(row: any): ShoppingItem {
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    name: row.name,
    quantity: row.quantity ?? null,
    note: row.note ?? null,
    placeId: row.place_id ?? null,
    placeName: row.place_name ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    dayIndexes: row.day_indexes ?? [],
    isDone: !!row.is_done,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}
