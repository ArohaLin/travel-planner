-- ============================================================================
-- 住宿深入研究（lodging-review，2026-06-22）
--
-- 設計：離線研究、線上瀏覽（沿用精選推薦模式）。
-- - 研究端（Mac/PC 技能 scripts/research.mjs）：Places 解析 + Google Travel 爬評論
--   + claude -p 訂閱制判讀（優缺點分群、系統性/個案）→ upsert 本表（service role）。
-- - App（Vercel）：探索分頁「住宿評價」純讀本表，零爬蟲、零 API 費。
-- - 易變事實（評分、照片）以 google_place_id 為穩定鍵，可即時補；rating/photo 為研究時快照。
--
-- 用 SUPABASE_DB_URL 直連或 Dashboard SQL Editor 執行。依賴 migration_multiuser.sql 的 is_admin()。
-- ============================================================================

create table if not exists public.lodging_research (
  id               uuid primary key default gen_random_uuid(),
  google_place_id  text not null unique,          -- 穩定識別鍵
  name             text not null,                  -- 正規店名（Places）
  city             text,                           -- 縣市（列表顯示）
  district         text,                           -- 鄉鎮市區
  address          text,
  rating           numeric,                        -- Places 官方總分（可靠）
  total_reviews    integer,                        -- Places 官方總則數
  star_class       text,                           -- 星級/類型（如「3 星級」；民宿多為 null）
  last_year_avg    numeric,                        -- 近一年平均分
  last_year_count  integer,                        -- 近一年抓到則數
  last_year_dist   jsonb,                          -- 近一年星級分佈 [{star,count,percent}]
  pros             jsonb default '[]',             -- [{point,systematic,mentions,pct,quote}]
  cons             jsonb default '[]',             -- 同上（systematic=是否系統性）
  verdict          text,                           -- 一句總評
  suitable_for     text,                           -- 適合誰
  not_for          text,                           -- 不適合誰
  confidence       text,                           -- 解析信心 high/med（low 不會入庫）
  query_name       text,                           -- 原始查詢字（med 時與 resolved 不同）
  resolved_name    text,                           -- 實際解析到的店名
  photo_ref        text,                           -- 代表照 ref（經 /api/photo 出圖）
  coverage         jsonb,                          -- 覆蓋率資訊（誠實標示）
  model            text default 'claude',          -- 判讀模型
  researched_at    timestamptz default now(),
  researched_by    uuid references public.profiles(id)
);

create index if not exists lodging_research_city_idx on public.lodging_research(city, rating desc);

-- ── RLS：登入者皆可讀；寫入僅 service role（研究腳本繞過 RLS）──────────────────
alter table public.lodging_research enable row level security;

drop policy if exists "lodging_research: 登入可讀" on public.lodging_research;
create policy "lodging_research: 登入可讀"
  on public.lodging_research for select
  using (auth.role() = 'authenticated');

-- 管理者亦可透過 service role 增改刪（API 端控管）；此處不開放一般使用者寫入。
