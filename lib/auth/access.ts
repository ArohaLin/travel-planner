import type { SupabaseClient } from '@supabase/supabase-js'
import type { GlobalRole, MemberRole } from '@/lib/types/collaboration'

/**
 * 多人模式一層權限的集中判斷（server 端，傳入 service role client）。
 *
 * 模型：全域角色決定「能做什麼」，行程成員只決定「看得到什麼」：
 *   admin   → 所有行程可見、可改、可管理（不必是成員）
 *   regular → 被加入的行程可見＋可改
 *   guest   → 被加入的行程可見、唯讀
 *
 * effectiveRole 是換算後的「有效行程角色」，直接餵給既有的 UI 權限函式
 * （canEdit/canChat/canInvite…），前端元件不需要知道一層/兩層的差異：
 *   建立者（member.role=owner）或 admin → 'owner'（可選人、可刪行程）
 *   regular 成員 → 'editor'；guest 成員 → 'viewer'
 */
export interface ItineraryAccess {
  /** 看得到這個行程（成員或管理者） */
  visible: boolean
  /** 換算後的有效行程角色；不可見時為 null */
  effectiveRole: MemberRole | null
  /** 可修改行程內容（含 AI 調整） */
  canEdit: boolean
  globalRole: GlobalRole
  isAdmin: boolean
}

export async function getItineraryAccess(
  db: SupabaseClient,
  itineraryId: string,
  userId: string,
): Promise<ItineraryAccess> {
  const [{ data: profile }, { data: member }] = await Promise.all([
    db.from('profiles').select('global_role').eq('id', userId).single(),
    db
      .from('itinerary_members')
      .select('role')
      .eq('itinerary_id', itineraryId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const globalRole = (profile?.global_role ?? 'regular') as GlobalRole
  const isAdmin = globalRole === 'admin'
  const visible = isAdmin || !!member

  let effectiveRole: MemberRole | null = null
  if (visible) {
    if (globalRole === 'guest') effectiveRole = 'viewer'
    else if (isAdmin || member?.role === 'owner') effectiveRole = 'owner'
    else effectiveRole = 'editor'
  }

  return {
    visible,
    effectiveRole,
    canEdit: effectiveRole === 'owner' || effectiveRole === 'editor',
    globalRole,
    isAdmin,
  }
}
