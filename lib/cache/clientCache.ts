/**
 * 極輕量的「分頁／視窗存活期」客戶端快取（module-level Map）。
 *
 * 用途：探索 / 願望清單 / 住宿評價等元件每次掛載都重抓、零快取，切走再切回又轉圈。
 * 改成 stale-while-revalidate：掛載時先用快取資料「立即顯示」（不轉圈），
 * 同時在背景重抓最新覆蓋。資料存在 module scope，元件卸載也存活（同一分頁 session 內）。
 *
 * 為何不直接用伺服器快取：lodging 等曾因 server 快取回傳舊資料而被迫 force-dynamic，
 * 這裡的快取每次掛載都會背景 revalidate，外部變更最多延遲一個 paint 就更新，故安全。
 * 重新整理整頁（F5）會清空（module 重新載入），等同強制最新。
 */
const store = new Map<string, unknown>()

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value)
}
