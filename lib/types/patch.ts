import { z } from 'zod'
import {
  ActivitySchema,
  AccommodationSchema,
  CityTransportSchema,
  TripMetadataSchema,
  ItineraryDaySchema,
} from './itinerary'

// ─── Patch Operations ────────────────────────────────────────────────────────

export const PatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_metadata'),
    payload: TripMetadataSchema.partial(),
  }),
  z.object({
    op: z.literal('update_day'),
    dayIndex: z.number().int().nonnegative(),
    // activities is optional — when provided, replaces the full activities array (whole-day restructure)
    payload: ItineraryDaySchema.omit({ activities: true }).partial().and(
      z.object({ activities: z.array(ActivitySchema).optional() })
    ),
  }),
  z.object({
    op: z.literal('set_day_accommodation'),
    dayIndex: z.number().int().nonnegative(),
    payload: AccommodationSchema.nullable(),
  }),
  z.object({
    op: z.literal('add_activity'),
    dayIndex: z.number().int().nonnegative(),
    payload: ActivitySchema,
  }),
  z.object({
    op: z.literal('update_activity'),
    dayIndex: z.number().int().nonnegative(),
    activityId: z.string(),
    payload: ActivitySchema.partial(),
    /** 修改前的活動快照（用於歷程顯示，不影響 patch 邏輯）*/
    _before: ActivitySchema.partial().optional(),
    /** 活動標題（時間自動調整 op 用，供歷程頁顯示用）*/
    _activityTitle: z.string().optional(),
  }),
  z.object({
    op: z.literal('remove_activity'),
    dayIndex: z.number().int().nonnegative(),
    activityId: z.string(),
    /** 刪除前的活動完整快照（用於歷程顯示）*/
    _before: ActivitySchema.optional(),
  }),
  z.object({
    op: z.literal('reorder_activities'),
    dayIndex: z.number().int().nonnegative(),
    orderedIds: z.array(z.string()),
  }),
  z.object({
    op: z.literal('add_city_transport'),
    payload: CityTransportSchema,
  }),
  z.object({
    op: z.literal('update_city_transport'),
    transportId: z.string(),
    payload: CityTransportSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_city_transport'),
    transportId: z.string(),
  }),
])

export const ItineraryPatchSchema = z.object({
  patchId: z.string().min(1),
  description: z.string().min(1),
  ops: z.array(PatchOpSchema).min(1),
  proposedBy: z.enum(['ai', 'user']).default('ai'),
})

export type PatchOp = z.infer<typeof PatchOpSchema>
export type ItineraryPatch = z.infer<typeof ItineraryPatchSchema>
export type AIPlanComparisonItem = z.infer<typeof AIPlanComparisonItemSchema>

// ─── AI Plan（3 方案選擇）────────────────────────────────────────────────────

export const AIPlanComparisonItemSchema = z.object({
  item: z.string(),    // e.g. "第1天下午"
  before: z.string(),  // e.g. "空閒"
  after: z.string(),   // e.g. "上野公園散步 09:00–10:30"
})

export const AIPlanSchema = z.object({
  planIndex: z.number().int().min(1).max(3),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  comparison: z.array(AIPlanComparisonItemSchema).optional(),
  patch: ItineraryPatchSchema,
})

export type AIPlan = z.infer<typeof AIPlanSchema>

export const AIPlansArraySchema = z.array(AIPlanSchema).min(1).max(3)
