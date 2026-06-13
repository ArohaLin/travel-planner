'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import type { GlobalRole } from '@/lib/types/collaboration'

/**
 * 成員管理（多人模式一層權限版）：
 * - 建立者/管理者：列出「所有帳號」，勾選開關決定誰看得到此行程
 * - 一般成員：只看目前成員列表
 * - 能力由全域角色決定（使用者=可改、遊客=唯讀），此頁只管「可見性」
 */

interface MemberRow {
  id: string
  user_id: string
  role: string
  profiles: { id: string; display_name: string | null; avatar_url: string | null; global_role: GlobalRole } | null
}

interface UserRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  global_role: GlobalRole
}

const GLOBAL_LABELS: Record<GlobalRole, string> = {
  admin: '管理者',
  regular: '使用者',
  guest: '遊客',
}

const GLOBAL_BADGE: Record<GlobalRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-50 text-blue-600',
  guest: 'bg-gray-100 text-gray-500',
}

export default function MembersPage({ params }: { params: { id: string } }) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [allUsers, setAllUsers] = useState<UserRow[]>([])
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/itinerary/${params.id}/members`)
    if (res.ok) {
      const data = await res.json()
      setCanManage(data.canManage)
      setMembers(data.members ?? [])
      setAllUsers(data.allUsers ?? [])
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  const memberIds = new Set(members.map((m) => m.user_id))
  const creatorId = members.find((m) => m.role === 'owner')?.user_id

  async function toggleUser(userId: string, visible: boolean) {
    setBusyUserId(userId)
    const res = await fetch(`/api/itinerary/${params.id}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, visible }),
    })
    if (res.ok) {
      await load()
      showToast(visible ? '已加入此行程' : '已移除可見權限', 'success')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '操作失敗', 'error')
    }
    setBusyUserId(null)
  }

  // 排序：建立者 → 管理者 → 已勾選 → 其他
  const sortedUsers = [...allUsers].sort((a, b) => {
    const rank = (u: UserRow) =>
      u.id === creatorId ? 0 : u.global_role === 'admin' ? 1 : memberIds.has(u.id) ? 2 : 3
    return rank(a) - rank(b)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="bg-white sticky top-0 z-10 px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center gap-3">
          <Link href={`/itinerary/${params.id}`} className="tap-target -ml-1 text-gray-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="font-semibold text-gray-900">成員管理</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : canManage ? (
          /* 建立者/管理者：所有帳號勾選清單 */
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="font-medium text-gray-900 mb-1">誰可以看到這個行程</h2>
            <p className="text-xs text-gray-400 mb-4">
              勾選的帳號會在自己的行程列表看到此行程。能否修改由帳號角色決定（使用者可修改、遊客只能看）。
            </p>
            <div className="flex flex-col gap-3">
              {sortedUsers.map((u) => {
                const isCreator = u.id === creatorId
                const isAdmin = u.global_role === 'admin'
                const checked = memberIds.has(u.id)
                const locked = isCreator || isAdmin
                return (
                  <div key={u.id} className="flex items-center gap-3 min-h-[44px]">
                    <Avatar name={u.display_name ?? '?'} src={u.avatar_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{u.display_name ?? '使用者'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${GLOBAL_BADGE[u.global_role]}`}>
                          {GLOBAL_LABELS[u.global_role]}
                        </span>
                        {isCreator && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            建立者
                          </span>
                        )}
                        {isAdmin && !isCreator && (
                          <span className="text-[10px] text-gray-400">永遠可見</span>
                        )}
                      </div>
                    </div>
                    {locked ? (
                      <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    ) : (
                      <button
                        onClick={() => toggleUser(u.id, !checked)}
                        disabled={busyUserId === u.id}
                        title={checked ? '取消可見' : '設為可見'}
                        className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${
                          checked ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                            checked ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* 一般成員：只看目前成員 */
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="font-medium text-gray-900 mb-3">目前成員（{members.length}）</h2>
            <div className="flex flex-col gap-3">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.profiles?.display_name ?? '?'} src={m.profiles?.avatar_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{m.profiles?.display_name ?? '成員'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.profiles && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${GLOBAL_BADGE[m.profiles.global_role]}`}>
                          {GLOBAL_LABELS[m.profiles.global_role]}
                        </span>
                      )}
                      {m.role === 'owner' && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                          建立者
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
