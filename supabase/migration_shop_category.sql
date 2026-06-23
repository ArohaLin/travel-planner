-- ============================================================================
-- 店家評價：lodging_research 加 category 欄（2026-06-23）
--
-- 把「住宿深入研究」表通用化為「商家深入研究」：同一張表、同一套 UI（探索分頁），
-- 用 category 區分。住宿評價分頁讀 category='住宿'；店家評價分頁讀其它類別（如「台東衝浪」）。
-- 現有 18 筆住宿自動歸為 '住宿'。
--
-- 衝浪店等地圖商家無法取得「近一年上百則」評論（Google 反爬蟲擋 headless），
-- 故 last_year_* 留空、UI 自動隱藏「近一年」區塊；評論重點改放 pros/cons（quote=Google 代表評論）。
--
-- 用 SUPABASE_DB_URL 直連或 Dashboard SQL Editor 執行。
-- ============================================================================
alter table public.lodging_research
  add column if not exists category text not null default '住宿';

create index if not exists lodging_research_category_idx
  on public.lodging_research(category, rating desc);
