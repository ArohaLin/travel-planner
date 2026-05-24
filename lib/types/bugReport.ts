export type BugStatus   = 'open' | 'in_progress' | 'resolved' | 'closed'
export type BugPriority = 'low' | 'medium' | 'high' | 'critical'
export type BugCategory = 'ui' | 'functionality' | 'performance' | 'data' | 'suggestion' | 'other'

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  open:        '🔴 未處理',
  in_progress: '🟡 處理中',
  resolved:    '🟢 已解決',
  closed:      '⚫ 已關閉',
}

export const BUG_PRIORITY_LABELS: Record<BugPriority, string> = {
  low:      '低',
  medium:   '中',
  high:     '高',
  critical: '緊急',
}

export const BUG_CATEGORY_LABELS: Record<BugCategory, string> = {
  ui:            '🖼️ 介面問題',
  functionality: '⚙️ 功能異常',
  performance:   '⚡ 效能問題',
  data:          '💾 資料問題',
  suggestion:    '💡 功能建議',
  other:         '📌 其他',
}

export interface BugReport {
  id: string
  bug_number: number
  title: string
  description: string
  expected: string | null
  page_name: string
  page_url: string | null
  category: BugCategory
  priority: BugPriority
  status: BugStatus
  reporter_id: string | null
  assignee_id: string | null
  resolution: string | null
  resolved_at: string | null
  browser_info: string | null
  created_at: string
  updated_at: string
  // Joined fields
  reporter?: { display_name: string; avatar_url: string | null } | null
  assignee?: { display_name: string; avatar_url: string | null } | null
}

export interface CreateBugReportPayload {
  title: string
  description: string
  expected?: string
  page_name: string
  page_url?: string
  category: BugCategory
  priority: BugPriority
  browser_info?: string
}

export interface UpdateBugReportPayload {
  status?: BugStatus
  resolution?: string
  assignee_id?: string | null
  priority?: BugPriority
}
