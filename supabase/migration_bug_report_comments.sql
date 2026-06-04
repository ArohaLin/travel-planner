-- ============================================================
-- Bug Report Comments（#16：問題追蹤回饋留言串）
-- ============================================================
-- 每個問題下可有多筆留言，支援使用者回饋與管理員回覆來回多次。

CREATE TABLE IF NOT EXISTS bug_report_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name   TEXT,                    -- 顯示用名稱快照
  body          TEXT NOT NULL,           -- 留言內容
  -- 留言種類：feedback（回報者回饋）/ reply（管理員回覆）/ status（狀態變更註記）
  kind          TEXT NOT NULL DEFAULT 'feedback'
    CHECK (kind IN ('feedback', 'reply', 'status')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_report_comments_bug
  ON bug_report_comments(bug_report_id, created_at);

-- RLS：留言由 API 以 service_role 操作（繞過 RLS），與 bug_reports 一致
ALTER TABLE bug_report_comments ENABLE ROW LEVEL SECURITY;

-- 登入使用者可讀取留言（與可看到問題的人一致）
DROP POLICY IF EXISTS bug_report_comments_select ON bug_report_comments;
CREATE POLICY bug_report_comments_select ON bug_report_comments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 登入使用者可新增自己的留言
DROP POLICY IF EXISTS bug_report_comments_insert ON bug_report_comments;
CREATE POLICY bug_report_comments_insert ON bug_report_comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
