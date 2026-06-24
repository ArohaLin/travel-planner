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

-- 啟用 RLS（修正 Supabase 安全警示 rls_disabled_in_public）。
-- push_log 只由 server（service role）寫入、前端不讀取 → 啟用後預設拒絕所有 anon/authenticated 存取，
-- service role 仍可寫（繞過 RLS）。另加「僅管理員可讀」policy，備將來除錯查看用。
alter table public.push_log enable row level security;

drop policy if exists "push_log: 管理員可讀" on public.push_log;
create policy "push_log: 管理員可讀"
  on public.push_log for select
  using (public.is_admin());
