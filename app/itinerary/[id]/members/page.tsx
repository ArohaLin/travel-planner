'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { ItineraryMember } from '@/lib/types/collaboration'

const ROLE_LABELS: Record<string, string> = {
  owner: '擁有者',
  editor: '編輯者',
  viewer: '觀看者',
}

const ROLE_VARIANTS: Record<string, 'purple' | 'green' | 'default'> = {
  owner: 'purple',
  editor: 'green',
  viewer: 'default',
}

export default function MembersPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [members, setMembers] = useState<ItineraryMember[]>([])
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [loading, setLoading] = useState(false)
  const [generatingInvite, setGeneratingInvite] = useState(false)

  useEffect(() => {
    async function loadMembers() {
      setLoading(true)
      const res = await fetch(`/api/itinerary/${params.id}/members`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data)
        // Determine current user's role by comparing
        const selfRes = await fetch(`/api/itinerary/${params.id}`)
        if (selfRes.ok) {
          const selfData = await selfRes.json()
          setCurrentRole(selfData.role)
        }
      }
      setLoading(false)
    }
    loadMembers()
  }, [params.id])

  async function generateInvite() {
    setGeneratingInvite(true)
    const res = await fetch(`/api/itinerary/${params.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: inviteRole }),
    })
    if (res.ok) {
      const data = await res.json()
      setInviteUrl(data.inviteUrl)
    } else {
      showToast('產生邀請連結失敗', 'error')
    }
    setGeneratingInvite(false)
  }

  async function copyInvite() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    showToast('已複製邀請連結！', 'success')
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/itinerary/${params.id}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      showToast('成員已移除', 'success')
    } else {
      const data = await res.json()
      showToast(data.error ?? '移除失敗', 'error')
    }
  }

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
        {/* Invite section (owner only) */}
        {currentRole === 'owner' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="font-medium text-gray-900 mb-3">邀請成員</h2>
            <div className="flex gap-2 mb-3">
              {(['editor', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium tap-target transition-colors ${
                    inviteRole === r
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={generateInvite}
              loading={generatingInvite}
              variant="secondary"
            >
              產生邀請連結（7天有效）
            </Button>
            {inviteUrl && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-2 truncate">{inviteUrl}</p>
                <Button size="sm" onClick={copyInvite} className="w-full">
                  📋 複製連結
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-medium text-gray-900 mb-3">目前成員 ({members.length})</h2>
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {members.map((member) => {
                const profile = member.profile
                return (
                  <div key={member.id} className="flex items-center gap-3">
                    <Avatar
                      name={profile?.display_name ?? '?'}
                      src={profile?.avatar_url}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {profile?.display_name ?? '成員'}
                      </p>
                      <Badge variant={ROLE_VARIANTS[member.role] ?? 'default'}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    </div>
                    {currentRole === 'owner' && member.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(member.user_id)}
                        className="tap-target text-red-400 hover:text-red-600 p-1 text-sm"
                      >
                        移除
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
