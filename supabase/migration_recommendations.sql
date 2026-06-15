-- ============================================================================
-- 精選推薦 + 願望清單（2026-06-15）
--
-- 設計：靜態策展模型（一次建立、不固定維護）。
-- - recommendations：人工/AI 策展的精選地點。長期只存「我方策展欄位 + google_place_id」；
--   易變事實（評分、營業時間、照片）顯示時用 google_place_id 即時向 Google 補，避免過時、
--   也符合 Google Places 條款（長期保存以 place_id 為主）。rating/photo 快照僅供建置排序與
--   列表預覽，顯示真相以即時為準。
-- - wishlist_items：每個行程的願望清單（口袋名單），可「加入某一天」變成活動。
--
-- 在 Supabase Dashboard SQL Editor 手動執行。
-- 依賴 migration_multiuser.sql 的 is_admin() / can_edit_itinerary()。
-- ============================================================================

-- ── 精選推薦 ────────────────────────────────────────────────────────────────
create table if not exists public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  region          text not null,                 -- 例：台東、嘉義（策展與篩選用）
  category        text not null check (category in ('景點','美食','住宿','親子')),
  sub_category    text,
  name            text not null,
  google_place_id text not null,                 -- 跨來源穩定識別；即時補件用
  lat             double precision,
  lng             double precision,
  address         text,
  editorial_reason text not null,                -- 我方精選短評（非 Google 內容）
  tags            text[] default '{}',           -- best_for：親子友善/海景/雨天備案…
  source_badges   text[] default '{}',           -- 觀光署/必比登/媒體x3…（我方衍生佐證）
  credibility     numeric default 0,             -- 綜合可信度分數（排序用）
  rating_snapshot  numeric,                       -- 建置時快照（排序/列表預覽；顯示以即時為準）
  reviews_snapshot integer,
  photo_ref       text,                          -- 建置時代表照 ref（經 /api/photo 出圖）
  status          text not null default 'published' check (status in ('published','hidden')),
  built_at        timestamptz default now(),
  unique (region, google_place_id)
);
create index if not exists recommendations_region_cat_idx
  on public.recommendations(region, category, status);

-- ── 願望清單（每行程一份）─────────────────────────────────────────────────────
create table if not exists public.wishlist_items (
  id                uuid primary key default gen_random_uuid(),
  itinerary_id      uuid not null references public.itineraries(id) on delete cascade,
  added_by          uuid references public.profiles(id),
  source            text not null default 'recommendation'
                      check (source in ('recommendation','search','paste_link')),
  recommendation_id uuid references public.recommendations(id) on delete set null,
  google_place_id   text,
  name              text not null,
  category          text,
  lat               double precision,
  lng               double precision,
  photo_ref         text,
  note              text,
  status            text not null default 'open' check (status in ('open','added')),
  created_at        timestamptz default now()
);
create index if not exists wishlist_itinerary_idx
  on public.wishlist_items(itinerary_id, status);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- 註：實際 API 走 service role + getItineraryAccess 判斷；RLS 為後備防線。
alter table public.recommendations enable row level security;
alter table public.wishlist_items  enable row level security;

-- 精選推薦：登入者皆可讀（精選目錄）；寫入僅 service role（建置腳本，繞過 RLS）
drop policy if exists "recommendations: 登入可讀" on public.recommendations;
create policy "recommendations: 登入可讀"
  on public.recommendations for select
  using (auth.role() = 'authenticated');

-- 願望清單：行程可見成員可讀；可編輯成員（或管理者）可寫
drop policy if exists "wishlist: 成員可讀" on public.wishlist_items;
create policy "wishlist: 成員可讀"
  on public.wishlist_items for select
  using (
    exists (
      select 1 from public.itinerary_members m
      where m.itinerary_id = wishlist_items.itinerary_id
        and m.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "wishlist: 可編輯成員可寫" on public.wishlist_items;
create policy "wishlist: 可編輯成員可寫"
  on public.wishlist_items for all
  using (public.can_edit_itinerary(itinerary_id) or public.is_admin())
  with check (public.can_edit_itinerary(itinerary_id) or public.is_admin());
