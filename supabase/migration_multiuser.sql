-- ─────────────────────────────────────────────────────────────────────────────
-- 多人模式改版：一層權限 + 管理者全可見
--
-- 模型：全域角色決定「能做什麼」，行程成員只決定「看得到什麼」
--   admin   → 所有行程可見、可改、可管理
--   regular → 被加入的行程可見＋可改
--   guest   → 被加入的行程可見、唯讀
-- itinerary_members.role 僅保留 owner 當「建立者」標記（editor/viewer 不再決定能力）
-- 冪等：可重複執行
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.get_global_role()
RETURNS TEXT AS $$
  SELECT global_role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(public.get_global_role() = 'admin', FALSE)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 一層權限的「可編輯」：管理者，或（是成員且非遊客）
CREATE OR REPLACE FUNCTION public.can_edit_itinerary(p_itinerary_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_admin() OR (
    public.get_member_role(p_itinerary_id) IS NOT NULL
    AND COALESCE(public.get_global_role(), 'regular') <> 'guest'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. ITINERARIES
DROP POLICY IF EXISTS "itineraries: 成員可讀取" ON public.itineraries;
CREATE POLICY "itineraries: 成員或管理者可讀取" ON public.itineraries
  FOR SELECT USING (
    public.get_member_role(id) IS NOT NULL OR public.is_admin()
  );

DROP POLICY IF EXISTS "itineraries: editor/owner 可更新" ON public.itineraries;
CREATE POLICY "itineraries: 非遊客成員或管理者可更新" ON public.itineraries
  FOR UPDATE USING (public.can_edit_itinerary(id));

DROP POLICY IF EXISTS "itineraries: owner 可刪除" ON public.itineraries;
CREATE POLICY "itineraries: 建立者或管理者可刪除" ON public.itineraries
  FOR DELETE USING (
    public.get_member_role(id) = 'owner' OR public.is_admin()
  );

-- 3. ITINERARY MEMBERS（選人：建立者或管理者）
DROP POLICY IF EXISTS "members: 同行程成員可讀取" ON public.itinerary_members;
CREATE POLICY "members: 成員或管理者可讀取" ON public.itinerary_members
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL OR public.is_admin()
  );

DROP POLICY IF EXISTS "members: owner 可新增" ON public.itinerary_members;
CREATE POLICY "members: 建立者或管理者可新增" ON public.itinerary_members
  FOR INSERT WITH CHECK (
    public.get_member_role(itinerary_id) = 'owner'
    OR public.is_admin()
    OR auth.uid() = user_id  -- 邀請 token 加入（service role 流程）
  );

DROP POLICY IF EXISTS "members: owner 可刪除" ON public.itinerary_members;
CREATE POLICY "members: 建立者或管理者可刪除" ON public.itinerary_members
  FOR DELETE USING (
    public.get_member_role(itinerary_id) = 'owner'
    OR public.is_admin()
    OR auth.uid() = user_id  -- 允許自己離開
  );

-- 4. ITINERARY CHANGES
DROP POLICY IF EXISTS "changes: 成員可讀取" ON public.itinerary_changes;
CREATE POLICY "changes: 成員或管理者可讀取" ON public.itinerary_changes
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL OR public.is_admin()
  );

DROP POLICY IF EXISTS "changes: editor/owner 可新增" ON public.itinerary_changes;
CREATE POLICY "changes: 可編輯者可新增" ON public.itinerary_changes
  FOR INSERT WITH CHECK (
    public.can_edit_itinerary(itinerary_id) AND auth.uid() = user_id
  );

-- 5. CHAT THREADS
DROP POLICY IF EXISTS "threads: 成員可讀取" ON public.chat_threads;
CREATE POLICY "threads: 成員或管理者可讀取" ON public.chat_threads
  FOR SELECT USING (
    public.get_member_role(itinerary_id) IS NOT NULL OR public.is_admin()
  );

DROP POLICY IF EXISTS "threads: 系統可建立" ON public.chat_threads;
CREATE POLICY "threads: 可編輯者可建立" ON public.chat_threads
  FOR INSERT WITH CHECK (public.can_edit_itinerary(itinerary_id));

-- 6. CHAT MESSAGES
DROP POLICY IF EXISTS "messages: 成員可讀取" ON public.chat_messages;
CREATE POLICY "messages: 成員或管理者可讀取" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id
        AND (public.get_member_role(ct.itinerary_id) IS NOT NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "messages: editor/owner 可新增" ON public.chat_messages;
CREATE POLICY "messages: 可編輯者可新增" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id AND public.can_edit_itinerary(ct.itinerary_id)
    )
  );

DROP POLICY IF EXISTS "messages: 更新 patch_status" ON public.chat_messages;
CREATE POLICY "messages: 可編輯者可更新" ON public.chat_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id AND public.can_edit_itinerary(ct.itinerary_id)
    )
  );

-- 7. 管理者可看到所有 profiles（行程內選人清單）
DROP POLICY IF EXISTS "profiles: 管理者可讀取全部" ON public.profiles;
CREATE POLICY "profiles: 管理者可讀取全部" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- 驗證
SELECT policyname, tablename FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
