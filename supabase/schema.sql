-- ============================================================
-- 旅程規劃 App — Supabase Database Schema
-- 在 Supabase SQL Editor 中執行此檔案
-- ============================================================

-- ─── PROFILES ──────────────────────────────────────────────
-- 擴充 auth.users，儲存顯示名稱與頭像

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  global_role  TEXT NOT NULL DEFAULT 'regular' CHECK (global_role IN ('admin', 'regular', 'guest')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 2 migration: add global_role if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS global_role TEXT NOT NULL DEFAULT 'regular'
  CHECK (global_role IN ('admin', 'regular', 'guest'));

CREATE INDEX IF NOT EXISTS profiles_global_role_idx ON public.profiles(global_role);

-- 新使用者自動建立 profile（觸發器）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── ITINERARIES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.itineraries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  destination  TEXT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'TWD',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  data         JSONB NOT NULL DEFAULT '{}',
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS itineraries_owner_idx ON public.itineraries(owner_id);
CREATE INDEX IF NOT EXISTS itineraries_data_gin ON public.itineraries USING GIN (data);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS itineraries_updated_at ON public.itineraries;
CREATE TRIGGER itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── ITINERARY MEMBERS ─────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.itinerary_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          public.member_role NOT NULL DEFAULT 'viewer',
  invited_by    UUID REFERENCES public.profiles(id),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(itinerary_id, user_id)
);

CREATE INDEX IF NOT EXISTS members_itinerary_idx ON public.itinerary_members(itinerary_id);
CREATE INDEX IF NOT EXISTS members_user_idx ON public.itinerary_members(user_id);

-- ─── ITINERARY CHANGES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.itinerary_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id    UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id),
  change_type     TEXT NOT NULL CHECK (change_type IN ('ai_patch', 'manual_edit', 'rollback')),
  patch           JSONB NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS changes_itinerary_idx ON public.itinerary_changes(itinerary_id);

-- ─── CHAT THREADS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS threads_itinerary_idx ON public.chat_threads(itinerary_id);

-- ─── CHAT MESSAGES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.profiles(id),
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  patch         JSONB,
  -- none=無方案；pending_selection=AI 已產生方案待使用者選擇；applied=已套用；cancelled=已取消；rejected=保留
  patch_status  TEXT NOT NULL DEFAULT 'none' CHECK (patch_status IN ('none', 'pending_selection', 'applied', 'cancelled', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON public.chat_messages(thread_id);

-- ─── ROW LEVEL SECURITY (RLS) ──────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: 取得目前使用者在某行程的 role
CREATE OR REPLACE FUNCTION public.get_member_role(p_itinerary_id UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.itinerary_members
  WHERE itinerary_id = p_itinerary_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "profiles: 本人可讀取" ON public.profiles
  FOR SELECT USING (auth.uid() = profiles.id);

CREATE POLICY "profiles: 成員可互相看到對方名稱" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_members im1
      JOIN public.itinerary_members im2
        ON im1.itinerary_id = im2.itinerary_id
      WHERE im1.user_id = auth.uid() AND im2.user_id = profiles.id
    )
  );

CREATE POLICY "profiles: 本人可建立" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = profiles.id);

CREATE POLICY "profiles: 本人可更新" ON public.profiles
  FOR UPDATE USING (auth.uid() = profiles.id);

-- ITINERARIES
CREATE POLICY "itineraries: 成員可讀取" ON public.itineraries
  FOR SELECT USING (
    public.get_member_role(id) IS NOT NULL
  );

CREATE POLICY "itineraries: 登入者可建立" ON public.itineraries
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "itineraries: editor/owner 可更新" ON public.itineraries
  FOR UPDATE USING (
    public.get_member_role(id) IN ('owner', 'editor')
  );

CREATE POLICY "itineraries: owner 可刪除" ON public.itineraries
  FOR DELETE USING (
    public.get_member_role(id) = 'owner'
  );

-- ITINERARY MEMBERS
CREATE POLICY "members: 同行程成員可讀取" ON public.itinerary_members
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL
  );

CREATE POLICY "members: owner 可新增" ON public.itinerary_members
  FOR INSERT WITH CHECK (
    -- 允許 owner 邀請其他人，或允許第一個 owner 自行加入
    public.get_member_role(itinerary_id) = 'owner'
    OR (
      -- 允許被邀請者透過 token 加入（service role 處理）
      auth.uid() = user_id
    )
  );

CREATE POLICY "members: owner 可刪除" ON public.itinerary_members
  FOR DELETE USING (
    public.get_member_role(itinerary_id) = 'owner'
    OR auth.uid() = user_id  -- 允許自己離開
  );

-- ITINERARY CHANGES
CREATE POLICY "changes: 成員可讀取" ON public.itinerary_changes
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL
  );

CREATE POLICY "changes: editor/owner 可新增" ON public.itinerary_changes
  FOR INSERT WITH CHECK (
    public.get_member_role(itinerary_id) IN ('owner', 'editor')
    AND auth.uid() = user_id
  );

-- CHAT THREADS
CREATE POLICY "threads: 成員可讀取" ON public.chat_threads
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL
  );

CREATE POLICY "threads: 系統可建立" ON public.chat_threads
  FOR INSERT WITH CHECK (
    public.get_member_role(itinerary_id) IS NOT NULL
  );

-- CHAT MESSAGES
CREATE POLICY "messages: 成員可讀取" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id
        AND public.get_member_role(ct.itinerary_id) IS NOT NULL
    )
  );

CREATE POLICY "messages: editor/owner 可新增" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id
        AND public.get_member_role(ct.itinerary_id) IN ('owner', 'editor')
    )
  );

CREATE POLICY "messages: 更新 patch_status" ON public.chat_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id
        AND public.get_member_role(ct.itinerary_id) IN ('owner', 'editor')
    )
  );

-- ─── REALTIME ──────────────────────────────────────────────
-- 在 Supabase Dashboard > Realtime 中啟用以下 tables 的 Realtime：
-- - public.itineraries
-- - public.chat_messages
-- - public.itinerary_members
--
-- 或執行以下指令：

ALTER TABLE public.itineraries REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.itinerary_members REPLICA IDENTITY FULL;

-- 加入 Supabase Realtime publication
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime CASCADE;
  CREATE PUBLICATION supabase_realtime FOR TABLE
    public.itineraries,
    public.chat_messages,
    public.itinerary_members;
COMMIT;

-- ============================================================
-- 完成！
-- 接下來步驟：
-- 1. 在 Supabase Dashboard > Authentication > Providers
--    確認 Email 登入已啟用
-- 2. 設定 .env.local 環境變數
-- 3. npm install && npm run dev
-- ============================================================
