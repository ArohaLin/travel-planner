'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function DevLoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? 'aroha0530@hotmail.com'
  const redirect = params.get('redirect') ?? '/dashboard'
  const [status, setStatus] = useState('正在取得登入 token...')

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/dev/token?email=${encodeURIComponent(email)}`)
      if (!res.ok) {
        setStatus(`取得 token 失敗 (${res.status})`)
        return
      }
      const { token } = await res.json()
      setStatus('驗證 token...')

      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' })
      if (error) {
        setStatus(`驗證失敗：${error.message}`)
        return
      }

      setStatus('登入成功，導向中...')
      router.push(redirect)
    })()
  }, [email, redirect, router])

  return (
    <div style={{ padding: 32, fontFamily: 'monospace' }}>
      <p>🔑 Dev Auto Login</p>
      <p style={{ color: '#888', marginTop: 8 }}>{status}</p>
      <p style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>email: {email}</p>
    </div>
  )
}
