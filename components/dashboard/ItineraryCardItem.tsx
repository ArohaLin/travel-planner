'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateRange } from '@/lib/utils/date'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已發布',
  archived: '已封存',
}

const ROLE_LABELS: Record<string, string> = {
  owner: '擁有者',
  editor: '編輯者',
  viewer: '觀看者',
}

interface Trip {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
  status: string
  role: string
}

/**
 * 我的行程卡片（含管理選單）：
 * - 編輯名稱：owner / editor
 * - 刪除行程：僅 owner（需二次確認；API 端亦有權限檢查）
 */
export function ItineraryCardItem({ trip }: { trip: Trip }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(trip.title)
  const [busy, setBusy] = useState(false)

  const canManage = trip.role === 'owner' || trip.role === 'editor'
  const canDelete = trip.role === 'owner'

  async function handleRename() {
    const next = title.trim()
    if (!next || next === trip.title) {
      setRenaming(false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/itinerary/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { title: next } }),
      })
      if (res.ok) {
        showToast('名稱已更新', 'success')
        setRenaming(false)
        router.refresh()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? '更新失敗', 'error')
      }
    } catch {
      showToast('網路錯誤，請再試一次', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      const res = await fetch(`/api/itinerary/${trip.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('行程已刪除', 'success')
        setConfirmDelete(false)
        router.refresh()
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error ?? '刪除失敗', 'error')
      }
    } catch {
      showToast('網路錯誤，請再試一次', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <Link href={`/itinerary/${trip.id}`}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 active:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="font-semibold text-gray-900 leading-snug flex-1">{trip.title}</h2>
            <div className="flex items-center gap-1 flex-shrink-0">
              {trip.role !== 'owner' && (
                <Badge variant="default">{ROLE_LABELS[trip.role]}</Badge>
              )}
              {trip.status === 'draft' && (
                <Badge variant="yellow">{STATUS_LABELS[trip.status]}</Badge>
              )}
              {canManage && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setMenuOpen((v) => !v)
                  }}
                  title="管理行程"
                  className="w-8 h-8 -mr-1 -mt-1 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">📍 {trip.destination}</p>
          <p className="text-sm text-gray-400">{formatDateRange(trip.start_date, trip.end_date)}</p>
        </div>
      </Link>

      {/* 管理選單 */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-10 z-30 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]">
            <button
              onClick={() => { setMenuOpen(false); setTitle(trip.title); setRenaming(true) }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]"
            >
              ✏️ 編輯名稱
            </button>
            {canDelete && (
              <button
                onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 min-h-[44px]"
              >
                🗑️ 刪除行程
              </button>
            )}
          </div>
        </>
      )}

      {/* 編輯名稱 */}
      {renaming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6" onClick={() => !busy && setRenaming(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-3">編輯行程名稱</h3>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-300"
              style={{ fontSize: 16 }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRenaming(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm min-h-[44px]"
              >
                取消
              </button>
              <button
                onClick={handleRename}
                disabled={busy || !title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium min-h-[44px] disabled:opacity-50"
              >
                {busy ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6" onClick={() => !busy && setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">刪除行程</h3>
            <p className="text-sm text-gray-500 mb-4">
              確定要刪除「{trip.title}」嗎？所有行程內容與聊天記錄將一併刪除，此操作無法復原。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm min-h-[44px]"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium min-h-[44px] disabled:opacity-50"
              >
                {busy ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
