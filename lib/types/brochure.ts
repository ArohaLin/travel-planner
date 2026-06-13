/**
 * 宣傳冊快取（brochure_cache）型別
 *
 * 產生宣傳冊時抓一次並存入 itineraries.brochure_cache，公開頁只讀此快取，
 * 不再即時呼叫 Google API。照片用 photoRef 經自家 proxy 出圖；地圖用座標點
 * 經自家 proxy 產生靜態地圖。金鑰永遠不出現在公開 HTML。
 */

/** 靜態地圖上的一個標記點（依行程順序） */
export interface BrochurePoint {
  /** 標記文字（數字序號或日次），靜態地圖標籤僅取首字元 */
  label: string
  lat: number
  lng: number
}

/** 單一地點（景點 / 住宿）的快取資料 */
export interface BrochurePlace {
  /** Google Places 照片 reference；null = 查無照片，前端改用漸層色塊 */
  photoRef: string | null
}

export interface BrochureCache {
  /** 產生時間（ISO） */
  generatedAt: string
  /** 封面 hero 照片 */
  coverPhotoRef: string | null
  /**
   * 各地點照片，key = `${dayIndex}:${activityId}`；住宿用 `${dayIndex}:acc`。
   */
  photos: Record<string, BrochurePlace>
  /** 每天的靜態地圖點位（依行程順序），key = dayIndex */
  dayPoints: Record<number, BrochurePoint[]>
  /** 旅程總覽地圖點位（每天取一點，標日次） */
  overviewPoints: BrochurePoint[]
}

/** 公開分享狀態（GET /api/itinerary/[id]/share 回傳） */
export interface ShareStatus {
  enabled: boolean
  token: string | null
  url: string | null
  generatedAt: string | null
  photoCount: number
}
