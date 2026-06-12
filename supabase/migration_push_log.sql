-- 推播稽核（除錯用）：每次嘗試發送記一筆，方便回答「到底有沒有送出」
create table if not exists push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  context text,
  status_code int,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists push_log_created_idx on push_log (created_at desc);
