import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '旅程規劃',
  description: 'AI 協助的多人協作旅遊行程規劃工具',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '旅程規劃',
  },
  icons: {
    // 瀏覽器分頁圖示
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // iPhone/iPad 加到桌面的圖示（最重要）
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        {/* 冷啟動等待畫面：在伺服器回應抵達前（無任何畫面的空白期）立刻顯示，
            DOMContentLoaded 後淡出。只在每次全新啟動（sessionStorage 清空）時出現，
            App 內頁面切換不觸發（sessionStorage 有記錄）。建立在 React tree 之外，不干擾 SSR 水化。 */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  try {
    if (sessionStorage.getItem('_al')) return;
    sessionStorage.setItem('_al', '1');
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#f9fafb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    d.innerHTML = '<div style="font-size:3rem;line-height:1;user-select:none">✈️<\\/div><div style="font-size:1.25rem;font-weight:600;color:#1f2937;font-family:system-ui,-apple-system,sans-serif;letter-spacing:-0.02em">旅程規劃<\\/div><div style="margin-top:12px"><svg style="width:2rem;height:2rem;color:#7c3aed;animation:__sp 1s linear infinite" viewBox="0 0 24 24" fill="none"><circle style="opacity:.2" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:.9" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/><\\/svg><\\/div>';
    var s = document.createElement('style');
    s.textContent = '@keyframes __sp{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
    document.documentElement.appendChild(d);
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(function(){
        d.style.transition = 'opacity .3s ease';
        d.style.opacity = '0';
        setTimeout(function(){ d.remove(); s.remove(); }, 300);
      }, 150);
    });
  } catch(e) {}
})()` }} />
        {children}
      </body>
    </html>
  )
}
