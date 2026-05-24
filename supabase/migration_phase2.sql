-- ============================================================
-- Phase 2 Migration: 全域角色系統
-- 請在 Supabase Dashboard > SQL Editor 中執行此檔案
-- ============================================================

-- 1. 在 profiles 加入 global_role 欄位
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS global_role TEXT NOT NULL DEFAULT 'regular'
  CHECK (global_role IN ('admin', 'regular', 'guest'));

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS profiles_global_role_idx ON public.profiles(global_role);

-- 3. 把現有第一個使用者設為 admin（請根據實際情況修改）
-- 你可以改成指定 email：
-- UPDATE profiles SET global_role = 'admin'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
UPDATE public.profiles
  SET global_role = 'admin'
  WHERE id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1);

-- 4. 建立取得當前使用者全域角色的 helper 函數
CREATE OR REPLACE FUNCTION public.get_global_role()
RETURNS TEXT AS $$
  SELECT global_role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. 驗證：檢查欄位已加入
SELECT id, display_name, global_role FROM public.profiles LIMIT 5;
