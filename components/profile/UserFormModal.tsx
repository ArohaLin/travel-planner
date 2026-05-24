'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { AdminUser, GlobalRole } from '@/lib/types/collaboration'
import { GLOBAL_ROLE_LABELS } from '@/lib/utils/permissions'

interface Props {
  mode: 'create' | 'edit'
  user?: AdminUser
  onClose: () => void
  onSaved: (user: AdminUser) => void
}

export function UserFormModal({ mode, user, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showResetPw, setShowResetPw] = useState(false)

  const [form, setForm] = useState({
    display_name: user?.display_name ?? '',
    email: user?.email ?? '',
    password: '',
    global_role: (user?.global_role ?? 'regular') as GlobalRole,
    new_password: '',
  })

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'create') {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: form.display_name,
            email: form.email,
            password: form.password,
            global_role: form.global_role,
          }),
        })
        const data = await res.json()
        if (!res.ok) { showToast(data.error ?? '建立失敗', 'error'); return }
        showToast('帳號已建立', 'success')
        onSaved({ id: data.id, email: data.email, display_name: data.display_name, avatar_url: null, global_role: data.global_role, created_at: new Date().toISOString() })
      } else {
        // 更新基本資料
        const updateBody: Record<string, unknown> = {
          display_name: form.display_name,
          global_role: form.global_role,
        }
        // 如果重設密碼
        if (showResetPw && form.new_password) {
          updateBody.password = form.new_password
        }

        const res = await fetch(`/api/admin/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        const data = await res.json()
        if (!res.ok) { showToast(data.error ?? '更新失敗', 'error'); return }
        showToast('已更新', 'success')
        onSaved({ ...user!, display_name: form.display_name, global_role: form.global_role })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 bg-white rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg text-gray-900 mb-4">
          {mode === 'create' ? '新增帳號' : '編輯帳號'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">顯示名稱</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => update('display_name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="王小明"
              required
            />
          </div>

          {mode === 'create' && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="user@example.com"
                required
              />
            </div>
          )}

          {mode === 'create' && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">初始密碼</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="至少6位"
                minLength={6}
                required
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">角色權限</label>
            <select
              value={form.global_role}
              onChange={(e) => update('global_role', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              {(['admin', 'regular', 'guest'] as GlobalRole[]).map((r) => (
                <option key={r} value={r}>{GLOBAL_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {mode === 'edit' && (
            <div>
              <button
                type="button"
                onClick={() => setShowResetPw((v) => !v)}
                className="text-sm text-purple-600 hover:text-purple-800 underline"
              >
                {showResetPw ? '取消重設密碼' : '重設密碼'}
              </button>
              {showResetPw && (
                <input
                  type="password"
                  value={form.new_password}
                  onChange={(e) => update('new_password', e.target.value)}
                  className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="輸入新密碼（至少6位）"
                  minLength={6}
                />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <Button type="submit" loading={loading} className="flex-1">
              {mode === 'create' ? '建立帳號' : '儲存'}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
