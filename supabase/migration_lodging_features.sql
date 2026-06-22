-- ============================================================================
-- 住宿研究：加「特色」欄位（2026-06-22）
-- features JSONB：{
--   summary,                       -- 官方一句簡介（Google Places editorialSummary）
--   category,                      -- 類型（民宿/飯店/青旅…，由 Places types 推導）
--   amenities: { has[], lacks[] }, -- Google 設施面板（明確有/沒有）
--   facts: [{ text, paid, paidNote, seasonal, sources[] }],  -- 部落客遊記抽的客觀事實
--   roomTypes: []                  -- 房型
-- }
-- 用 SUPABASE_DB_URL 直連或 Dashboard SQL Editor 執行。
-- ============================================================================
alter table public.lodging_research
  add column if not exists features jsonb default '{}'::jsonb;
