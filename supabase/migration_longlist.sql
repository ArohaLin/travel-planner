-- ============================================================================
-- 精選推薦加 tier 欄位（2026-06-16）
--
-- 新增 tier 欄位，區分「人工精選」與「名額外漏網之魚」：
--   featured = 原有 45 筆人工策展精選
--   longlist = 貝氏評分夠高但精選名額排不下的候選，依評分排序供使用者參考
--
-- 在 Supabase Dashboard SQL Editor 手動執行（或用 SUPABASE_DB_URL 直連）。
-- ============================================================================

alter table public.recommendations
  add column if not exists tier text not null default 'featured'
  check (tier in ('featured', 'longlist'));

-- 確保現有 45 筆都是 featured（default 已覆蓋，這行只是明確確認）
update public.recommendations set tier = 'featured' where tier is null or tier = '';

-- longlist 與 featured 都要建 index（依 region+category+tier+status 篩選）
create index if not exists recommendations_region_cat_tier_idx
  on public.recommendations(region, category, tier, status);
