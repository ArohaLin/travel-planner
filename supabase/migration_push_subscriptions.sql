-- Web Push 訂閱（AI 完成通知）
-- 每個使用者可有多筆（多裝置）；endpoint 唯一，重複訂閱以 upsert 處理。
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- 使用者只能管理自己的訂閱（伺服器端寫入用 service role，會繞過 RLS）
drop policy if exists "own subscriptions" on push_subscriptions;
create policy "own subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
