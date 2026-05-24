import type { MemberRole, GlobalRole } from '@/lib/types/collaboration'

// ─── Per-Itinerary 角色 ───────────────────────────────────────────────────────

export function canEdit(role: MemberRole): boolean {
  return role === 'owner' || role === 'editor'
}

export function canInvite(role: MemberRole): boolean {
  return role === 'owner'
}

export function canDelete(role: MemberRole): boolean {
  return role === 'owner'
}

export function canChat(role: MemberRole): boolean {
  return role === 'owner' || role === 'editor'
}

export function canRollback(role: MemberRole): boolean {
  return role === 'owner'
}

// ─── 全域角色 ─────────────────────────────────────────────────────────────────

export function isAdmin(globalRole: GlobalRole): boolean {
  return globalRole === 'admin'
}

export function isGuest(globalRole: GlobalRole): boolean {
  return globalRole === 'guest'
}

export function canEditGlobally(globalRole: GlobalRole): boolean {
  return globalRole === 'admin' || globalRole === 'regular'
}

/**
 * 合併判斷：全域 guest 永遠唯讀，admin 永遠可編輯，
 * regular 看 itinerary_members 的角色
 */
export function canEditItinerary(
  globalRole: GlobalRole,
  memberRole: MemberRole | null,
): boolean {
  if (globalRole === 'guest') return false
  if (globalRole === 'admin') return true
  return memberRole === 'owner' || memberRole === 'editor'
}

export function canChatItinerary(
  globalRole: GlobalRole,
  memberRole: MemberRole | null,
): boolean {
  if (globalRole === 'guest') return false
  if (globalRole === 'admin') return true
  return memberRole === 'owner' || memberRole === 'editor'
}

export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  admin: '管理員',
  regular: '一般',
  guest: '訪客',
}

export const GLOBAL_ROLE_COLORS: Record<GlobalRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-100 text-blue-700',
  guest: 'bg-gray-100 text-gray-600',
}
