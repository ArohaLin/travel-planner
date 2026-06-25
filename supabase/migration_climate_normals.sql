-- 歷年同期氣候統計快取（跨所有行程/使用者共用）
-- key = 經緯度格點(四捨五入到 0.1°≈11km) + 月 + 日；同月日同地點算一次永久重用。
create table if not exists public.climate_normals (
  lat numeric(5,1) not null,
  lng numeric(6,1) not null,
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  data jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (lat, lng, month, day)
);

-- 只有 server（service role）讀寫；anon/auth 無 policy = 全擋（service role 繞過 RLS）。
alter table public.climate_normals enable row level security;
