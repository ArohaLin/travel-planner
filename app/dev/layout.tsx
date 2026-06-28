import { notFound } from 'next/navigation'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '6px 12px', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
        <strong>🛠 DEV ONLY</strong>
        <a href="/dev/ui" style={{ color: '#93c5fd' }}>UI Preview</a>
        <a href="/dev/login" style={{ color: '#86efac' }}>Auto Login</a>
        <a href="/dashboard" style={{ color: '#fcd34d' }}>Dashboard</a>
      </div>
      {children}
    </div>
  )
}
