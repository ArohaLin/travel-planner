import { z } from 'zod'

// ─── Enumerations ───────────────────────────────────────────────────────────

export const ActivityTypeValues = [
  'sightseeing', 'food', 'shopping', 'transport',
  'experience', 'nature', 'rest', 'other',
] as const
export type ActivityType = typeof ActivityTypeValues[number]

export const TransportModeValues = [
  'flight', 'train', 'bus', 'ferry', 'car', 'other',
] as const
export type TransportMode = typeof TransportModeValues[number]

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const GeoLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
})

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  isEstimate: z.boolean(),
})

export const ActivitySchema = z.object({
  id: z.string().min(1),
  type: z.enum(ActivityTypeValues),
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, '時間格式必須為 HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')).transform(v => v || undefined),
  duration: z.number().positive().optional(),
  location: GeoLocationSchema.optional(),
  cost: MoneySchema.optional(),
  bookingRequired: z.boolean(),
  /** 預約狀態：無需預訂 / 需要預訂 / 已經預訂（缺省＝依 bookingRequired 推導）*/
  reservationStatus: z.enum(['none', 'needed', 'reserved']).optional(),
  bookingUrl: z.string().optional().transform(v => {
    if (!v) return undefined
    try { new URL(v); return v } catch { return undefined }
  }),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  // ─── 詳情欄位（選填，用於卡片點擊後的詳情視窗）───
  /** 景點介紹 / 為何這樣安排 */
  intro: z.string().optional(),
  /** 交通方式與時間說明 */
  transport: z.string().optional(),
  /** 推薦活動 / 飲食 / 當地名產 */
  recommendation: z.string().optional(),
  /** 細節推薦或注意事項 */
  tips: z.string().optional(),
  // ─── 卡片精簡格式用的結構化欄位（選填，依類型組裝外層卡片顯示）───
  /** 地點簡稱，如「太魯閣」「台東市」（景點/餐飲/其它用） */
  placeLabel: z.string().optional(),
  /** 交通起點簡稱（type=transport 用） */
  fromLabel: z.string().optional(),
  /** 交通終點簡稱（type=transport 用） */
  toLabel: z.string().optional(),
  /** 交通方式，如「自駕」「步行」「船」（type=transport 用） */
  transportMode: z.string().optional(),
  /** 餐別，如「早餐」「午餐」「晚餐」「下午茶」（type=food 用） */
  mealType: z.string().optional(),
  /** 飲食項目，如「臭豆腐、米苔目」（type=food 用） */
  foodItems: z.string().optional(),
  /** 特別需強調注意的簡短註解，顯示在卡片下一行（全部類型） */
  highlight: z.string().optional(),
  /** Google Places 代表照片 reference（背景抓取後快取；詳情視窗與宣傳冊共用） */
  photoRef: z.string().optional(),
  /** 使用者自行上傳的卡片照片（Supabase Storage 公開 URL）；顯示時優先於 photoRef */
  userPhotoUrl: z.string().optional(),
})

export const AccommodationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: GeoLocationSchema,
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  /** 預約狀態：無需預訂 / 需要預訂 / 已經預訂（缺省＝none；住宿通常需要預訂，由使用者設定）*/
  reservationStatus: z.enum(['none', 'needed', 'reserved']).optional(),
  cost: MoneySchema.optional(),
  bookingUrl: z.string().optional().transform(v => {
    if (!v) return undefined
    try { new URL(v); return v } catch { return undefined }
  }),
  notes: z.string().optional(),
  /** Google Places 代表照片 reference（背景抓取後快取；宣傳冊用） */
  photoRef: z.string().optional(),
  // ─── 比照活動卡的詳情欄位（選填）───
  /** 使用者自行上傳的卡片照片（Supabase Storage 公開 URL）；顯示時優先於 photoRef */
  userPhotoUrl: z.string().optional(),
  /** 住宿說明 / 介紹 */
  intro: z.string().optional(),
  /** 重要事項（入住須知、注意事項）*/
  tips: z.string().optional(),
  /** 聯絡資訊（電話 / Email / 訂房人）*/
  contact: z.string().optional(),
  // ─── 訂房資訊 ───
  /** 訂房平台，如 Agoda / Booking.com / 官網 */
  bookingPlatform: z.string().optional(),
  /** 訂單編號 */
  orderNumber: z.string().optional(),
  /** 已付訂金 */
  depositPaid: MoneySchema.optional(),
  /** 最晚免費取消（自由文字，如「2026-06-20 23:59 前」）*/
  freeCancelBy: z.string().optional(),
})

export const CityTransportSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(TransportModeValues),
  fromCity: z.string().min(1),
  toCity: z.string().min(1),
  departureTime: z.preprocess((v) => {
    if (typeof v !== 'string') return v
    // Fix missing Z / missing milliseconds: "2026-06-01T08:00:00" → "2026-06-01T08:00:00.000Z"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return v + '.000Z'
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(v)) return v + 'Z'
    return v
  }, z.string().datetime({ offset: true })),
  arrivalTime: z.preprocess((v) => {
    if (typeof v !== 'string') return v
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return v + '.000Z'
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(v)) return v + 'Z'
    return v
  }, z.string().datetime({ offset: true })),
  carrier: z.string().optional(),
  cost: MoneySchema.optional(),
  notes: z.string().optional(),
})

const LenientAccommodationSchema = z.preprocess((v) => {
  if (!v || typeof v !== 'object') return undefined
  const a = v as Record<string, unknown>
  if (!a.name || !a.id) return undefined
  const timeRe = /^\d{2}:\d{2}$/
  if (!timeRe.test(String(a.checkInTime ?? ''))) a.checkInTime = '15:00'
  if (!timeRe.test(String(a.checkOutTime ?? ''))) a.checkOutTime = '11:00'
  if (!a.location || typeof a.location !== 'object') a.location = { lat: 0, lng: 0 }
  return a
}, AccommodationSchema.optional())

/**
 * 開車路段（由地圖的 Directions 結果存回）：表示「抵達某站」相對前一站的距離與時間。
 * toId = 目的地（activity.id 或 'accommodation'）；資料由地圖開啟時計算並寫回，供行程卡顯示。
 */
export const TravelLegSchema = z.object({
  toId: z.string(),
  meters: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
  /** 地圖上距離標籤的位置（道路中點）；行程卡不需要、可選 */
  midLat: z.number().optional(),
  midLng: z.number().optional(),
  /** 該段道路編碼折線（地圖逐段畫線用）；無 = 該段沒有開車路線，地圖改畫直線 */
  polyline: z.string().optional(),
})

export const ItineraryDaySchema = z.object({
  dayIndex: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().min(1),
  theme: z.string().optional(),
  activities: z.array(ActivitySchema),
  accommodation: LenientAccommodationSchema,
  notes: z.string().optional(),
  /** 出發地卡片「早餐・整理行李」的開始時間（結束＝第一個活動出發時間）；未設時預設出發前 90 分 */
  prepStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  /** 開車路段距離/時間（地圖計算後寫回，供行程卡顯示；可選） */
  travelLegs: z.array(TravelLegSchema).optional(),
  /** 當天整條開車路線的編碼折線（Directions overview_polyline），地圖解碼後直接畫線，免重打 API */
  routePolyline: z.string().optional(),
  /** 路線輸入指紋（景點順序＋座標）；與目前資料比對以判斷是否需要重算 */
  travelSig: z.string().optional(),
})

export const MemberGenderValues = ['male', 'female', 'other'] as const
export type MemberGender = typeof MemberGenderValues[number]

export const MemberProfileSchema = z.object({
  age: z.number().int().positive().optional(),
  gender: z.enum(MemberGenderValues).optional(),
})
export type MemberProfile = z.infer<typeof MemberProfileSchema>

export const TripMetadataSchema = z.object({
  title: z.string().min(1),
  destination: z.string().min(1),
  originCity: z.string().min(1),
  returnCity: z.string().optional(),           // 返回城市（預設同出發城市）
  transitCities: z.array(z.string()).optional(), // 中途城市
  preferredTransport: z.array(z.string()).optional(), // 偏好交通方式
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalDays: z.number().int().positive(),
  travelers: z.number().int().positive(),
  memberProfiles: z.array(MemberProfileSchema).optional(), // 成員年齡性別
  currency: z.string().length(3),
  totalBudget: MoneySchema.optional(),
  style: z.array(z.string()).optional(),
  /** 行程專屬 AI 記憶：記錄與 AI 討論過的喜好、厭惡、特別需求；AI 每次對話前 recap，使用者也可手動編輯 */
  aiMemory: z.string().optional(),
  language: z.literal('zh-TW'),
})

export const ItinerarySchema = z.object({
  metadata: TripMetadataSchema,
  days: z.array(ItineraryDaySchema),
  cityTransports: z.array(CityTransportSchema),
  version: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  lastModifiedAt: z.string().datetime(),
})

// ─── TypeScript Types (derived from Zod schemas) ────────────────────────────

export type GeoLocation = z.infer<typeof GeoLocationSchema>
export type Money = z.infer<typeof MoneySchema>
export type Activity = z.infer<typeof ActivitySchema>
export type Accommodation = z.infer<typeof AccommodationSchema>
export type CityTransport = z.infer<typeof CityTransportSchema>
export type TravelLeg = z.infer<typeof TravelLegSchema>
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>
export type TripMetadata = z.infer<typeof TripMetadataSchema>
export type Itinerary = z.infer<typeof ItinerarySchema>
