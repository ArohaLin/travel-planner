/**
 * 採購清單型別。
 * 綁定維度：地點（stores：0=隨處 / 1=單店 / 多=好幾間都有）、時間（dayIndexes：空=隨時）。
 */

export interface StoreRef {
  placeId: string
  name: string
  lat: number
  lng: number
}

export interface ShoppingItem {
  id: string
  itineraryId: string
  name: string
  quantity: string | null
  note: string | null
  /** 綁的店家：0=隨處（到處有、看到就買），1=單店，多家=這幾間都有（地圖多點、任一買到即完成） */
  stores: StoreRef[]
  /** 綁哪幾天（dayIndex 陣列，空=隨時） */
  dayIndexes: number[]
  isDone: boolean
  createdBy: string | null
  createdAt: string
}

/** DB（snake_case）→ 前端（camelCase）；相容舊單店欄位 place_id。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapShopping(row: any): ShoppingItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stores: StoreRef[] = Array.isArray(row.stores) && row.stores.length
    ? row.stores
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => ({ placeId: String(s.placeId ?? ''), name: String(s.name ?? '店家'), lat: Number(s.lat), lng: Number(s.lng) }))
        .filter((s: StoreRef) => s.placeId && isFinite(s.lat) && isFinite(s.lng))
    : row.place_id
      ? [{ placeId: row.place_id, name: row.place_name ?? '店家', lat: row.lat, lng: row.lng }]
      : []
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    name: row.name,
    quantity: row.quantity ?? null,
    note: row.note ?? null,
    stores,
    dayIndexes: row.day_indexes ?? [],
    isDone: !!row.is_done,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}
