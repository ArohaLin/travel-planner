'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import type { GlobalRole } from '@/lib/types/collaboration'
import type {
  BugReport, BugStatus, BugPriority, BugCategory,
  CreateBugReportPayload, UpdateBugReportPayload,
} from '@/lib/types/bugReport'
import {
  BUG_STATUS_LABELS, BUG_PRIORITY_LABELS, BUG_CATEGORY_LABELS,
} from '@/lib/types/bugReport'
import { formatRelativeTime } from '@/lib/utils/date'

// ── 常數 ──────────────────────────────────────────────────────────────────

const PAGE_OPTIONS = [
  { value: '', label: '目前頁面（自動偵測）' },
  { value: '儀表板', label: '儀表板' },
  { value: '行程詳情', label: '行程詳情頁' },
  { value: '修改歷程', label: '修改歷程頁' },
  { value: '成員管理', label: '成員管理頁' },
  { value: 'AI 對話', label: 'AI 對話' },
  { value: '個人資料', label: '個人資料頁' },
  { value: '其他', label: '手動輸入...' },
]

const CATEGORIES: { value: BugCategory; label: string }[] = [
  { value: 'ui',            label: '🖼️ 介面問題' },
  { value: 'functionality', label: '⚙️ 功能異常' },
  { value: 'performance',   label: '⚡ 效能問題' },
  { value: 'data',          label: '💾 資料問題' },
  { value: 'suggestion',    label: '💡 功能建議' },
  { value: 'other',         label: '📌 其他' },
]

const PRIORITIES: { value: BugPriority; label: string; color: string }[] = [
  { value: 'low',      label: '低',   color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'medium',   label: '中',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'high',     label: '高',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'critical', label: '緊急', color: 'bg-red-100 text-red-700 border-red-200' },
]

// ── 輔助函數 ───────────────────────────────────────────────────────────────

function formatBugId(n: number) {
  return `BUG-${String(n).padStart(3, '0')}`
}

function getBrowserInfo(): string {
  if (typeof navigator === 'undefined') return ''
  return `${navigator.userAgent} | ${window.innerWidth}×${window.innerHeight}`
}

function guessPageName(pathname: string): string {
  if (pathname === '/dashboard') return '儀表板'
  if (pathname === '/profile') return '個人資料'
  if (pathname.includes('/history')) return '修改歷程'
  if (pathname.includes('/members')) return '成員管理'
  if (pathname.match(/\/itinerary\//)) return '行程詳情'
  return pathname
}

// ── 狀態色 ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BugStatus, string> = {
  open:        'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-gray-100 text-gray-500',
}

const PRIORITY_COLORS: Record<BugPriority, string> = {
  low:      'bg-gray-100 text-gray-500',
  medium:   'bg-blue-100 text-blue-700',
  high:     'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
}

// ── 回報表單 ──────────────────────────────────────────────────────────────

interface ReportFormProps {
  pageName: string
  pageUrl: string
  onSuccess: (bugNumber: number) => void
}

function ReportForm({ pageName, pageUrl, onSuccess }: ReportFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expected, setExpected] = useState('')
  const [category, setCategory] = useState<BugCategory>('functionality')
  const [priority, setPriority] = useState<BugPriority>('medium')
  const [pageNameOverride, setPageNameOverride] = useState('')
  const [isManualPage, setIsManualPage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const finalPageName = isManualPage
    ? pageNameOverride
    : pageNameOverride || pageName

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      setError('請填寫標題與問題描述')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const payload: CreateBugReportPayload = {
        title: title.trim(),
        description: description.trim(),
        expected: expected.trim() || undefined,
        page_name: finalPageName || '未指定',
        page_url: pageUrl,
        category,
        priority,
        browser_info: getBrowserInfo(),
      }
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const { bugNumber } = await res.json()
        onSuccess(bugNumber)
      } else {
        setError('回報失敗，請再試一次')
      }
    } catch {
      setError('網路錯誤，請再試一次')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 操作畫面 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">發生在哪個畫面</label>
        <select
          value={isManualPage ? '其他' : pageNameOverride}
          onChange={(e) => {
            if (e.target.value === '其他') {
              setIsManualPage(true)
              setPageNameOverride('')
            } else {
              setIsManualPage(false)
              setPageNameOverride(e.target.value)
            }
          }}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
        >
          {PAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isManualPage && (
          <input
            type="text"
            value={pageNameOverride}
            onChange={(e) => setPageNameOverride(e.target.value)}
            placeholder="請輸入畫面名稱"
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        )}
        {!isManualPage && !pageNameOverride && pageName && (
          <p className="text-xs text-gray-400 mt-1">自動偵測：{pageName}</p>
        )}
      </div>

      {/* 標題 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">問題標題 *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="簡短描述問題（例：刪除活動後頁面沒有更新）"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </div>

      {/* 類別 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">問題類別</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={clsx(
                'text-xs py-1.5 px-1 rounded-xl border text-center transition-all leading-snug',
                category === c.value
                  ? 'bg-red-500 text-white border-red-500 font-medium'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-red-300',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 優先級 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">嚴重程度</label>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPriority(p.value)}
              className={clsx(
                'flex-1 text-xs py-1.5 rounded-xl border font-medium transition-all',
                priority === p.value
                  ? p.color + ' font-semibold'
                  : 'bg-white border-gray-200 text-gray-400',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 問題描述 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">問題描述 *</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="詳細描述發生了什麼問題，以及如何重現（例：點擊編輯後輸入名稱，按儲存後名稱沒有更新）"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </div>

      {/* 期望改善 */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">期望的正確行為 / 改善建議</label>
        <textarea
          rows={2}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="你希望正確的行為應該是怎樣？（可選填）"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !title.trim() || !description.trim()}
        className="w-full py-3 text-sm font-semibold text-white bg-red-500 rounded-2xl hover:bg-red-600 disabled:opacity-40 active:scale-95 transition-all"
      >
        {submitting ? '提交中...' : '🐛 送出回報'}
      </button>
    </div>
  )
}

// ── 管理員追蹤列表 ─────────────────────────────────────────────────────────

function TrackerList() {
  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [selected, setSelected] = useState<BugReport | null>(null)
  const [resolution, setResolution] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BugReport | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const url = filterStatus
        ? `/api/bug-reports?status=${filterStatus}&limit=100`
        : '/api/bug-reports?limit=100'
      const res = await fetch(url)
      if (res.ok) {
        const { reports: data } = await res.json()
        setReports(data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { loadReports() }, [loadReports])

  async function deleteReport(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/bug-reports/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        setSelected(null)
        await loadReports()
      }
    } finally {
      setDeleting(false)
    }
  }

  async function updateReport(id: string, payload: UpdateBugReportPayload) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        await loadReports()
        if (selected?.id === id) {
          setSelected(null)
          setResolution('')
        }
      }
    } finally {
      setUpdatingId(null)
    }
  }

  const openCount = reports.filter((r) => r.status === 'open').length
  const inProgressCount = reports.filter((r) => r.status === 'in_progress').length

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex gap-2 text-xs">
        <span className="flex-1 bg-red-50 text-red-700 rounded-xl px-2 py-1.5 text-center font-medium">
          未處理 {openCount}
        </span>
        <span className="flex-1 bg-amber-50 text-amber-700 rounded-xl px-2 py-1.5 text-center font-medium">
          處理中 {inProgressCount}
        </span>
        <span className="flex-1 bg-gray-50 text-gray-500 rounded-xl px-2 py-1.5 text-center font-medium">
          共 {reports.length} 筆
        </span>
      </div>

      {/* Filter — 單行橫向滾動，不換行 */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
        {[
          { value: '', label: '全部' },
          { value: 'open', label: '🔴未處理' },
          { value: 'in_progress', label: '🟡處理中' },
          { value: 'resolved', label: '🟢已解決' },
          { value: 'closed', label: '⚫已關閉' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={clsx(
              'flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-all',
              filterStatus === f.value
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
            )}
          >
            {f.label}
          </button>
        ))}
        <button onClick={loadReports} className="flex-shrink-0 text-xs px-2 py-1 text-gray-400 hover:text-gray-600">
          ↺
        </button>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">載入中...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">沒有符合的問題記錄</div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className={clsx(
                'border rounded-2xl overflow-hidden transition-all',
                selected?.id === r.id ? 'border-gray-400' : 'border-gray-100',
              )}
            >
              {/* Report header */}
              <button
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-gray-50"
                onClick={() => {
                  setSelected(selected?.id === r.id ? null : r)
                  setResolution(r.resolution ?? '')
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">
                      {formatBugId(r.bug_number)}
                    </span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[r.status])}>
                      {BUG_STATUS_LABELS[r.status].split(' ')[1]}
                    </span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full', PRIORITY_COLORS[r.priority])}>
                      {BUG_PRIORITY_LABELS[r.priority]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{r.title}</p>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{r.reporter?.display_name ?? '未知回報者'}</span>
                    <span>·</span>
                    <span>{r.page_name}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(r.created_at)}</span>
                  </div>
                </div>
                <svg
                  className={clsx('w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform', selected?.id === r.id && 'rotate-180')}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Report detail */}
              {selected?.id === r.id && (
                <div className="border-t border-gray-100 px-3 py-3 space-y-3 bg-gray-50">
                  {/* Detail info */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                    <div><span className="text-gray-400">類別：</span>{BUG_CATEGORY_LABELS[r.category]}</div>
                    <div><span className="text-gray-400">畫面：</span>{r.page_name}</div>
                    <div><span className="text-gray-400">回報時間：</span>{new Date(r.created_at).toLocaleString('zh-TW')}</div>
                    {r.resolved_at && (
                      <div><span className="text-gray-400">處理時間：</span>{new Date(r.resolved_at).toLocaleString('zh-TW')}</div>
                    )}
                    {r.assignee && (
                      <div className="col-span-2"><span className="text-gray-400">處理人員：</span>{r.assignee.display_name}</div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">問題描述</p>
                    <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-xl px-3 py-2 border border-gray-100">
                      {r.description}
                    </p>
                  </div>

                  {r.expected && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">期望改善</p>
                      <p className="text-sm text-gray-700 bg-white rounded-xl px-3 py-2 border border-gray-100">
                        {r.expected}
                      </p>
                    </div>
                  )}

                  {/* Status actions */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">更新狀態</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(['open', 'in_progress', 'resolved', 'closed'] as BugStatus[]).map((s) => (
                        <button
                          key={s}
                          disabled={r.status === s || updatingId === r.id}
                          onClick={() => updateReport(r.id, { status: s })}
                          className={clsx(
                            'text-xs px-3 py-1.5 rounded-xl border transition-all font-medium disabled:opacity-40',
                            r.status === s
                              ? STATUS_COLORS[s] + ' border-current'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
                          )}
                        >
                          {BUG_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolution notes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">處理說明</p>
                    <textarea
                      rows={2}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="填寫處理方式或說明（可選）"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
                    />
                    <button
                      onClick={() => updateReport(r.id, { resolution })}
                      disabled={updatingId === r.id}
                      className="mt-1.5 w-full py-2 text-xs font-medium bg-gray-800 text-white rounded-xl hover:bg-gray-900 disabled:opacity-40"
                    >
                      {updatingId === r.id ? '更新中...' : '儲存處理說明'}
                    </button>
                  </div>

                  {r.resolution && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                      <span className="font-semibold">已有處理說明：</span>{r.resolution}
                    </div>
                  )}

                  {/* 刪除按鈕 */}
                  <div className="pt-1 border-t border-gray-100">
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="w-full py-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
                    >
                      🗑 刪除此問題回報
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 刪除確認對話框 */}
      {deleteTarget && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[85vw] max-w-sm bg-white rounded-3xl shadow-2xl p-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">確認刪除？</h3>
            <p className="text-xs text-gray-500 text-center mb-1">
              即將永久刪除
            </p>
            <p className="text-sm font-medium text-gray-800 text-center mb-1 px-2 truncate">
              {formatBugId(deleteTarget.bug_number)}｜{deleteTarget.title}
            </p>
            <p className="text-xs text-red-400 text-center mb-5">此操作無法復原</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 disabled:opacity-40 transition-all"
              >
                取消
              </button>
              <button
                onClick={() => deleteReport(deleteTarget.id)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-2xl hover:bg-red-600 disabled:opacity-40 transition-all"
              >
                {deleting ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 主元件：BugReportSheet ──────────────────────────────────────────────────

interface BugReportSheetProps {
  globalRole: GlobalRole
}

export function BugReportSheet({ globalRole }: BugReportSheetProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'report' | 'tracker'>('report')
  const [successBugNumber, setSuccessBugNumber] = useState<number | null>(null)

  const isAdmin = globalRole === 'admin'
  const autoPageName = guessPageName(pathname ?? '')
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  function handleSuccess(bugNumber: number) {
    setSuccessBugNumber(bugNumber)
  }

  function handleClose() {
    setOpen(false)
    setSuccessBugNumber(null)
  }

  return (
    <>
      {/* Trigger button group */}
      <div className="flex items-center gap-1">
        {/* Bug report button */}
        <button
          onClick={() => { setTab('report'); setOpen(true) }}
          className="tap-target text-gray-400 hover:text-red-500 p-1 transition-colors"
          title="回報問題"
          aria-label="回報問題"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </button>

        {/* Admin tracker button */}
        {isAdmin && (
          <button
            onClick={() => { setTab('tracker'); setOpen(true) }}
            className="tap-target text-gray-400 hover:text-amber-500 p-1 transition-colors"
            title="問題追蹤（管理員）"
            aria-label="問題追蹤"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Sheet */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-[200] backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Bottom sheet */}
          <div
            className="fixed left-0 right-0 bottom-0 z-[210] bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{
              height: 'calc(96dvh - env(safe-area-inset-top))',
              maxHeight: 'calc(96dvh - env(safe-area-inset-top))',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                {isAdmin ? (
                  <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                    <button
                      onClick={() => setTab('report')}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        tab === 'report' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500',
                      )}
                    >
                      🐛 回報問題
                    </button>
                    <button
                      onClick={() => setTab('tracker')}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        tab === 'tracker' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500',
                      )}
                    >
                      📋 問題追蹤
                    </button>
                  </div>
                ) : (
                  <h2 className="font-semibold text-gray-900">🐛 回報問題</h2>
                )}
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}>
              {tab === 'report' ? (
                successBugNumber ? (
                  /* 成功畫面 */
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg">回報成功！</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      你的問題已記錄為{' '}
                      <span className="font-mono font-semibold text-gray-800">
                        {formatBugId(successBugNumber)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-2">管理員會盡快處理，感謝你的回報！</p>
                    <button
                      onClick={handleClose}
                      className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-gray-800 rounded-2xl hover:bg-gray-900"
                    >
                      關閉
                    </button>
                  </div>
                ) : (
                  <ReportForm
                    pageName={autoPageName}
                    pageUrl={pageUrl}
                    onSuccess={handleSuccess}
                  />
                )
              ) : (
                <TrackerList />
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
