/* 旅程規劃 Service Worker：只負責 Web Push（不攔截 fetch，避免快取干擾 Next.js） */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// 收到推播：App 在前景時不彈通知（畫面本來就會更新），背景才顯示
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '旅程規劃', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '旅程規劃'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/dashboard' },
  }

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const hasFocused = clientList.some((c) => c.visibilityState === 'visible')
      if (!hasFocused) {
        await self.registration.showNotification(title, options)
      }
    })(),
  )
})

// 點通知：已有視窗就聚焦並導向，否則開新視窗
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try { await client.navigate(url) } catch { /* ignore */ }
          }
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
