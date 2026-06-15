'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { GLOBAL_ROLE_LABELS, GLOBAL_ROLE_COLORS } from '@/lib/utils/permissions'
import type { GlobalRole, AdminUser } from '@/lib/types/collaboration'
import { UserFormModal } from '@/components/profile/UserFormModal'
import { ItineraryAccessModal } from '@/components/profile/ItineraryAccessModal'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface ItinerarySummary {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
}

interface Props {
  currentUser: AdminUser
  allUsers: AdminUser[]
  allItineraries: ItinerarySummary[]
}

export function ProfileClient({ currentUser, allUsers: initialUsers, allItineraries }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [users, setUsers] = useState(initialUsers)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isAdmin = currentUser.global_role === 'admin'
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (!confirm(`確定要刪除帳號「${userName}」？此操作無法復原。`)) return

    setDeletingId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        showToast('帳號已刪除', 'success')
      } else {
        const d = await res.json()
        showToast(d.error ?? '刪除失敗', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  function handleUserSaved(updatedUser: AdminUser, isNew: boolean) {
    if (isNew) {
      setUsers((prev) => [...prev, updatedUser])
    } else {
      setUsers((prev) => prev.map((u) => u.id === updatedUser.id ? updatedUser : u))
    }
    setShowAddModal(false)
    setEditingUser(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="tap-target p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-semibold text-gray-900">會員資料</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 個人資料卡 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <Avatar name={currentUser.display_name} src={currentUser.avatar_url} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{currentUser.display_name}</h2>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full', GLOBAL_ROLE_COLORS[currentUser.global_role])}>
                  {GLOBAL_ROLE_LABELS[currentUser.global_role]}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1 truncate">{currentUser.email}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              {loggingOut ? '登出中...' : '登出'}
            </button>
          </div>
        </div>

        {/* 管理員：開發報告入口 */}
        {isAdmin && (
          <Link
            href="/admin/reports"
            className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 active:bg-gray-50 transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-lg flex-shrink-0">📄</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">開發報告</p>
              <p className="text-xs text-gray-500">推薦評選等開發過程報告（僅管理員）</p>
            </div>
            <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        )}

        {/* 管理員：帳號管理區 */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">帳號管理</h3>
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                + 新增帳號
              </Button>
            </div>

            <div className="divide-y divide-gray-50">
              {users.map((u) => (
                <div key={u.id} className="px-5 py-4 flex items-center gap-3">
                  <Avatar name={u.display_name} src={u.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate text-sm">{u.display_name}</span>
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', GLOBAL_ROLE_COLORS[u.global_role as GlobalRole])}>
                        {GLOBAL_ROLE_LABELS[u.global_role as GlobalRole]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingUser(u)}
                      className="tap-target text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-50"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => setAccessUser(u)}
                      className="tap-target text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
                    >
                      行程
                    </button>
                    {u.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.display_name)}
                        disabled={deletingId === u.id}
                        className="tap-target text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {users.length === 0 && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  尚無其他帳號
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 新增帳號 Modal */}
      {showAddModal && (
        <UserFormModal
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSaved={(user) => handleUserSaved(user, true)}
        />
      )}

      {/* 編輯帳號 Modal */}
      {editingUser && (
        <UserFormModal
          mode="edit"
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(user) => handleUserSaved(user, false)}
        />
      )}

      {/* 行程存取 Modal */}
      {accessUser && (
        <ItineraryAccessModal
          user={accessUser}
          allItineraries={allItineraries}
          onClose={() => setAccessUser(null)}
        />
      )}
    </div>
  )
}
