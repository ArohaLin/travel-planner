-- 採購清單（shopping_items）：每行程一份，協作者共用（Realtime 同步）。
-- 三種綁定組合：
--   綁店家 → place_id/place_name/lat/lng 有值（情況1，可上地圖、可排進行程）
--   綁某幾天 → day_indexes 非空（情況3）
--   皆空 → 隨處・隨時（情況2，最常用）
-- 結構與權限比照 todo_items（成員可讀、可編輯成員可寫、管理員通道、加入 realtime）。

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  name text not null,                       -- 買什麼
  quantity text,                            -- 數量（文字，彈性：「2 包」「3 瓶」）
  note text,                                -- 備註（如指定品牌）
  place_id text,                            -- 綁店家：Google place id（null=隨處）
  place_name text,
  lat double precision,
  lng double precision,
  day_indexes int[] not null default '{}',  -- 綁哪幾天（dayIndex，空=隨時）
  is_done boolean not null default false,    -- 已買打勾
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_itinerary_idx on public.shopping_items (itinerary_id);

alter table public.shopping_items enable row level security;

drop policy if exists "shopping: 成員可讀" on public.shopping_items;
create policy "shopping: 成員可讀"
  on public.shopping_items for select
  using (
    exists (
      select 1 from public.itinerary_members m
      where m.itinerary_id = shopping_items.itinerary_id
        and m.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "shopping: 可編輯成員可寫" on public.shopping_items;
create policy "shopping: 可編輯成員可寫"
  on public.shopping_items for all
  using (public.can_edit_itinerary(itinerary_id) or public.is_admin())
  with check (public.can_edit_itinerary(itinerary_id) or public.is_admin());

-- 加入 Realtime publication（協作者即時同步）
do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null; end $$;
