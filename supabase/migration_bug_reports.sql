-- ============================================================
-- Bug Reports Table
-- ============================================================

CREATE TABLE IF NOT EXISTS bug_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_number      SERIAL UNIQUE,          -- 顯示用：BUG-001, BUG-002...
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,          -- 問題描述
  expected        TEXT,                   -- 希望改善成怎樣
  page_name       TEXT NOT NULL DEFAULT '',  -- 回報時的畫面名稱
  page_url        TEXT,                   -- 回報時的完整 URL
  category        TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('ui', 'functionality', 'performance', 'data', 'suggestion', 'other')),
  priority        TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reporter_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution      TEXT,                   -- 管理員處理說明
  resolved_at     TIMESTAMPTZ,
  browser_info    TEXT,                   -- 自動捕捉的裝置/瀏覽器資訊
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_bug_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION update_bug_reports_updated_at();

-- RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- 已登入使用者可新增（reporter_id 必須是自己）
CREATE POLICY "已登入使用者可新增 bug report" ON bug_reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND reporter_id = auth.uid()
  );

-- 回報者看自己的；管理員看全部
CREATE POLICY "reporter 或 admin 可查看 bug report" ON bug_reports
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.get_global_role() = 'admin'
  );

-- 只有管理員可更新
CREATE POLICY "只有 admin 可更新 bug report" ON bug_reports
  FOR UPDATE USING (
    public.get_global_role() = 'admin'
  );
