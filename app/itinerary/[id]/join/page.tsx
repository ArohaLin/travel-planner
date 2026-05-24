'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default function JoinPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('邀請連結無效')
      return
    }

    async function acceptInvite() {
      const res = await fetch(`/api/itinerary/${params.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (res.ok) {
        const data = await res.json()
        setRole(data.role)
        setStatus('success')
        setTimeout(() => router.push(`/itinerary/${params.id}`), 1500)
      } else {
        const data = await res.json()
        setErrorMsg(data.error ?? '加入失敗')
        setStatus('error')
      }
    }

    acceptInvite()
  }, [token, params.id, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <div className="text-5xl mb-4">✈️</div>
            <p className="text-gray-600 font-medium">正在加入行程...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">成功加入！</h1>
            <p className="text-gray-500 text-sm">你已以「{role === 'editor' ? '編輯者' : '觀看者'}」身份加入行程</p>
            <p className="text-gray-400 text-xs mt-2">正在跳轉...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">😕</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">加入失敗</h1>
            <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
            <Link href="/dashboard">
              <Button>回到首頁</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
