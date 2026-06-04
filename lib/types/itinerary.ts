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
})

export const AccommodationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: GeoLocationSchema,
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  cost: MoneySchema.optional(),
  bookingUrl: z.string().optional().transform(v => {
    if (!v) return undefined
    try { new URL(v); return v } catch { return undefined }
  }),
  notes: z.string().optional(),
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

export const ItineraryDaySchema = z.object({
  dayIndex: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().min(1),
  theme: z.string().optional(),
  activities: z.array(ActivitySchema),
  accommodation: LenientAccommodationSchema,
  notes: z.string().optional(),
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
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>
export type TripMetadata = z.infer<typeof TripMetadataSchema>
export type Itinerary = z.infer<typeof ItinerarySchema>
