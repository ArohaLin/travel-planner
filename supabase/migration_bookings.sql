-- 獨立預約（standalone bookings）：不與行程卡連結的預訂記錄。
-- 已連結的預訂資料存在行程卡（Activity/Accommodation）欄位，不在此表。
-- 依賴 migration_multiuser.sql 的 is_admin() / can_edit_itinerary()。

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  itinerary_id   uuid not null references public.itineraries(id) on delete cascade,

  -- 基本資料
  title          text not null,
  type           text not null default 'other'
                   check (type in ('lodging','transport','activity','ticket','restaurant','other')),
  status         text not null default 'needed'
                   check (status in ('needed','reserved','cancelled')),

  -- 日期 / 時間
  date           date,
  end_date       date,        -- 住宿多晚結束日、多日活動
  time           text,        -- 開始時間，HH:MM 格式

  -- 金額
  cost           jsonb,       -- { amount, currency, isEstimate }
  deposit_paid   jsonb,       -- { amount, currency, isEstimate }

  -- 訂房資訊
  booking_platform  text,
  order_number      text,
  booking_url       text,
  free_cancel_by    text,     -- 最晚免費取消（文字）
  contact           text,
  notes             text,

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bookings_itinerary_idx on public.bookings (itinerary_id, date);

alter table public.bookings enable row level security;

drop policy if exists "bookings: 成員可讀" on public.bookings;
create policy "bookings: 成員可讀"
  on public.bookings for select
  using (
    exists (
      select 1 from public.itinerary_members m
      where m.itinerary_id = bookings.itinerary_id
        and m.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "bookings: 可編輯成員可寫" on public.bookings;
create policy "bookings: 可編輯成員可寫"
  on public.bookings for all
  using (public.can_edit_itinerary(itinerary_id) or public.is_admin())
  with check (public.can_edit_itinerary(itinerary_id) or public.is_admin());

-- 加入 Realtime publication（協作者即時同步）
do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; end $$;
