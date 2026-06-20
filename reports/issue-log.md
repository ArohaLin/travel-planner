---
title: 問題處理紀錄
date: 2026-06-21
category: 開發紀錄
summary: 各類 bug 的根本原因、修復方法與預防建議，供未來排查時參考
---

# 問題處理紀錄

> **使用方式**：發生問題時，先翻分類確認是否發生過類似問題；修好之後新增一筆。
> 同一分類反覆出現代表根本原因未完全根除，需要更深入的架構解法。

---

## 1. 地圖路線錯誤

### 1-A 路線跑到綠島（台東縣離島）

**發生時間**：2026-06-20 / 2026-06-21（第一次修後再犯）

**症狀**：Day 2 地圖顯示一段台東市區 → 綠島的異常路線。

**根本原因（兩層）**：

1. **geocode 的活動類型過濾不一致**：
   - 「民宿 Check-in 與盥洗休息」屬 `type=rest`、無 `placeLabel`，是動作描述而非地點。
   - 以「民宿 Check-in 台東」送 Google geocode → Google 回傳台東縣某筆住宿，座標剛好在綠島。
   - 此過濾規則**只加在 `activityPhotos.ts`**，其他兩條管線沒跟上：
     - `MapView.tsx` 前端 geocode 迴圈（每次打開地圖都跑）
     - `RoutePrefetcher.tsx` 背景 geocode 迴圈
   - MapView geocode 完後呼叫 `/api/itinerary/[id]/geo` **寫回 DB**，讓錯誤座標持久化。

2. **前次修復手法有副作用**：
   - 清除座標時將 `location` 設為 `{}` 空物件而非 `null`。
   - `usableCoords({})` 判斷 `{} && undefined !== 0 → true`，把空物件當有效座標回傳。
   - `signatureFor` 呼叫 `undefined.toFixed(5)` → TypeError → 頁面崩潰。

**修復方法**：

| 動作 | 檔案 |
|---|---|
| 三條管線統一加 `rest && !placeLabel` 跳過 | `MapView.tsx`、`RoutePrefetcher.tsx`、`route.ts buildDayPoints` |
| `usableCoords`/`usable` 加 `typeof lat === 'number' && isFinite(lat)` | `MapView.tsx`、`RoutePrefetcher.tsx` |
| `signatureFor` 過濾非有限數字的點 | `route.ts` |
| DB 修正：清 `location: {}` → `null`，刪 `travelLegs/travelSig` | `scripts/fix-day6-geo.mjs`（同類腳本） |

**預防原則**：

- **「過濾某類活動」的規則必須三處同步**：`activityPhotos.ts`、`MapView.tsx` 的 enqueue、`RoutePrefetcher.tsx` 的 enqueue、`route.ts` 的 `buildDayPoints`。改其中一處必須 grep 其他三處。
- 清除座標用 `null`，絕對不用 `{}`。
- 提供統一的 `clearLocation(a)` / `setLocation(a, lat, lng)` helper，所有腳本強制透過它操作（避免手刻 raw JSON 出錯）。
- API 邊界加 Zod `safeParse`：`/api/itinerary/[id]` GET 時 parse 行程 JSON，失敗就 `console.error`，讓壞資料在進前端之前就留下警告。

---

## 2. 地圖頁面崩潰（Client-side Exception）

### 2-A `undefined.toFixed is not a function`

**發生時間**：2026-06-20

**症狀**：切到 Day 2 地圖，頁面顯示「Application error: a client-side exception has occurred」。

**根本原因**：見上方 1-A 的「前次修復手法有副作用」段落。

**修復方法**：
- `usableCoords` 加 `typeof` + `isFinite` 驗證（確保 lat/lng 是有限數字）
- `signatureFor` 用 `.filter` 排除非有限數字的點，不再對可能是 `undefined/NaN/Infinity` 的值呼叫 `.toFixed()`

**預防原則**：
- 凡是要呼叫 `.toFixed()` 的數字，先驗 `typeof x === 'number' && isFinite(x)`。
- 座標相關函式要對各種非預期輸入做防禦：

  | 輸入 | 正確行為 |
  |---|---|
  | `null` / `undefined` | 視為無座標，跳過 |
  | `{}` 空物件 | typeof 檢查攔截 |
  | `{lat: NaN, lng: NaN}` | `isFinite` 攔截 |
  | `{lat: Infinity}` | `isFinite` 攔截 |
  | `{lat: 0, lng: 0}` | 視為無座標（0,0 是空島） |
  | `{lat: "23.1"}` | typeof 攔截（字串） |

---

## 3. AI 調整後行程資料異常

*(本分類預留，未來 AI patch 導致的資料問題在此記錄)*

---

## 4. 座標 / 地理編碼問題

### 4-A geocode 查詢返回離島錯誤座標

**發生時間**：2026-06-20（與 1-A 同源）

**症狀**：台東縣本島的景點，geocode 後取得綠島座標。

**根本原因**：
- 查詢字串為動作描述而非地點名稱（例：「民宿 Check-in 台東」）
- Google Places/Geocoding API 台東縣搜尋範圍包含離島，隨機回傳任一筆

**修復方法**：`type=rest && !placeLabel` 的活動，三條管線一律跳過 geocode（不嘗試查詢）。

**預防原則**：
- `placeLabel` 是「可以用來 geocode 的具體地點名」，沒有就不能送 geocode。
- AI 生成活動時，若 `type=rest` 一律不給 `placeLabel`（已符合現況）；若之後有其他「動作描述類」type，同理。

---

## 附錄：三條 geocode 管線一覽

每次改過濾規則，以下三處要同步：

| 管線 | 檔案位置 | 說明 |
|---|---|---|
| 後端補照片/座標 | `lib/maps/activityPhotos.ts` | 生成/patch 後背景執行 |
| 前端地圖 geocode | `components/map/MapView.tsx`（`enqueue` 迴圈） | 打開地圖時執行，結果寫回 DB |
| 背景路線預算 | `components/map/RoutePrefetcher.tsx`（`enqueue` 迴圈） | 頁面載入後執行，結果存 travelLegs |
| 路線點位組裝 | `lib/maps/route.ts`（`buildDayPoints`） | 地圖 marker 與路線計算用 |
