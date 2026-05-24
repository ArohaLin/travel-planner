export type MemberRole = 'owner' | 'editor' | 'viewer'
export type GlobalRole = 'admin' | 'regular' | 'guest'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  global_role: GlobalRole
  created_at: string
}

export interface ItineraryMember {
  id: string
  itinerary_id: string
  user_id: string
  role: MemberRole
  invited_by: string | null
  joined_at: string
  profile?: Profile
}

export interface ItineraryChange {
  id: string
  itinerary_id: string
  user_id: string
  change_type: 'ai_patch' | 'manual_edit' | 'rollback'
  patch: unknown
  description: string | null
  created_at: string
  profile?: Profile
}

export interface ChatMessage {
  id: string
  thread_id: string
  user_id: string | null
  role: 'user' | 'assistant'
  content: string
  patch: unknown | null
  patch_status: 'none' | 'applied' | 'rejected' | 'pending_selection' | 'cancelled'
  created_at: string
  profile?: Profile
}

export interface PresenceUser {
  userId: string
  displayName: string
  avatarUrl: string | null
  viewingDayIndex: number
}

export interface ItineraryRow {
  id: string
  owner_id: string
  title: string
  destination: string
  start_date: string
  end_date: string
  currency: string
  status: 'draft' | 'published' | 'archived'
  data: unknown
  version: number
  created_at: string
  updated_at: string
}

// 管理員查看的使用者資料（含 email）
export interface AdminUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  global_role: GlobalRole
  created_at: string
}
