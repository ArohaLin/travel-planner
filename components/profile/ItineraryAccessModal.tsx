'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { AdminUser } from '@/lib/types/collaboration'

interface ItinerarySummary {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
}

interface ItineraryWithRole extends ItinerarySummary {
  currentRole: 'owner' | 'editor' | 'viewer' | null
}

interface Props {
  user: AdminUser
  allItineraries: ItinerarySummary[]
  onClose: () => void
}

export function ItineraryAccessModal({ user, allItineraries, onClose }: Props) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [itineraries, setItineraries] = useState<ItineraryWithRole[]>([])
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'owner' | 'editor' | 'viewer' | null>>({})

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/itineraries`)
      .then((r) => r.json())
      .then((data: ItineraryWithRole[]) => {
        setItineraries(data)
        const roles: Record<string, 'owner' | 'editor' | 'viewer' | null> = {}
        data.forEach((it) => { roles[it.id] = it.currentRole })
        setPendingRoles(roles)
      })
      .finally(() => setLoading(false))
  }, [user.id])

  async function handleSave() {
    setSaving(true)
    const assignments = Object.entries(pendingRoles).map(([itineraryId, role]) => ({ itineraryId, role }))

    const res = await fetch(`/api/admin/users/${user.id}/itineraries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    })

    setSaving(false)
    if (res.ok) {
      showToast('行程存取已更新', 'success')
      onClose()
    } else {
      const d = await res.json()
      showToast(d.error ?? '更新失敗', 'error')
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-50 bg-white rounded-3xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-lg text-gray-900">行程存取設定</h2>
          <p className="text-sm text-gray-500 mt-0.5">{user.display_name}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
          ) : itineraries.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">尚無行程</div>
          ) : (
            itineraries.map((it) => (
              <div key={it.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{it.title}</p>
                  <p className="text-xs text-gray-500">{it.destination} · {it.start_date}</p>
                </div>
                <select
                  value={pendingRoles[it.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value as 'owner' | 'editor' | 'viewer' | ''
                    setPendingRoles((prev) => ({ ...prev, [it.id]: v === '' ? null : v }))
                  }}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">無存取</option>
                  <option value="viewer">唯讀</option>
                  <option value="editor">編輯</option>
                  <option value="owner">擁有者</option>
                </select>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <Button onClick={handleSave} loading={saving} className="flex-1">
            儲存
          </Button>
        </div>
      </div>
    </>
  )
}
