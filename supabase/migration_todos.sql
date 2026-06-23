-- 待辦事項（todo）：每行程一份。
-- kind='manual'：使用者手動新增的待辦（title + is_done）。
-- kind='auto'  ：自動提醒（由行程即時算出，不存內容）的「已處理」覆蓋記號，以 auto_key 為鍵；
--                is_done=true 表示使用者已「完成/略過」該自動提醒，前端據此隱藏並不計入徽章。
-- 依賴 migration_multiuser.sql 的 is_admin() / can_edit_itinerary()。

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  kind text not null default 'manual' check (kind in ('manual', 'auto')),
  auto_key text,                 -- kind='auto' 時：自動提醒的穩定鍵（如 reserve-act:<id>）
  title text,                    -- kind='manual' 時：待辦內容
  is_done boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 每個自動提醒每行程只有一筆覆蓋記號
create unique index if not exists todo_items_auto_uniq
  on public.todo_items (itinerary_id, auto_key) where kind = 'auto';
create index if not exists todo_items_itinerary_idx on public.todo_items (itinerary_id);

alter table public.todo_items enable row level security;

drop policy if exists "todo: 成員可讀" on public.todo_items;
create policy "todo: 成員可讀"
  on public.todo_items for select
  using (
    exists (
      select 1 from public.itinerary_members m
      where m.itinerary_id = todo_items.itinerary_id
        and m.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "todo: 可編輯成員可寫" on public.todo_items;
create policy "todo: 可編輯成員可寫"
  on public.todo_items for all
  using (public.can_edit_itinerary(itinerary_id) or public.is_admin())
  with check (public.can_edit_itinerary(itinerary_id) or public.is_admin());

-- 加入 Realtime publication（協作者即時同步）；已加入則略過
do $$ begin
  alter publication supabase_realtime add table public.todo_items;
exception when duplicate_object then null; end $$;
