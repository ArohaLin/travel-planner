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

/** AI 生成的宣傳文案（封面副標、亮點標語、特色摘要） */
export interface BrochureCopy {
  /** 封面英文副標，如 "Taitung, Taiwan" */
  subtitle: string
  /** 一句中文亮點標語 */
  tagline: string
  /** 行程特色簡介段落（2–3 句） */
  intro: string
  /** 賣點亮點一句話清單（3–5 條） */
  highlights: string[]
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
  /** AI 生成文案（可能缺，舊快取或生成失敗時） */
  copy?: BrochureCopy
  /** 每天直線距離（公里，概估），key = dayIndex */
  dayKm?: Record<number, number>
  /** 全程直線距離合計（公里，概估） */
  totalKm?: number
  /**
   * 產生這份宣傳冊時，行程的 version。
   * 之後行程 version 變大 → 代表行程已變動、宣傳冊內容可能過時（stale）。
   */
  sourceVersion?: number
}

/** 公開分享狀態（GET /api/itinerary/[id]/share 回傳） */
export interface ShareStatus {
  enabled: boolean
  token: string | null
  url: string | null
  generatedAt: string | null
  photoCount: number
  /** 行程在宣傳冊產生後又有變動 → 宣傳冊可能不是最新（提示更新用） */
  stale: boolean
}
