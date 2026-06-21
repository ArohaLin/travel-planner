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

**發生時間**：2026-06-20 / 2026-06-21（修兩次才根治）

**症狀**：Day 2 地圖顯示一段台東市區 → 綠島的異常路線。

**根本原因（三層，逐次發現）**：

1. **前次修復手法有副作用（第一次問題）**：
   - 清除座標時將 `location` 設為 `{}` 空物件而非 `null`。
   - `usableCoords({})` 判斷 `{} && undefined !== 0 → true`，把空物件當有效座標回傳。
   - `signatureFor` 呼叫 `undefined.toFixed(5)` → TypeError → 頁面崩潰（見 2-A）。

2. **geocode 過濾條件 `rest && !placeLabel` 不夠嚴格（第二次問題）**：
   - 清掉 `{}` 後，`MapView.tsx` 仍嘗試 geocode 該活動（因為它有 `placeLabel="海明威民宿"`）。
   - 過濾規則只加在 `activityPhotos.ts`，另外兩條管線（MapView、RoutePrefetcher）未同步。
   - MapView geocode 完後寫回 DB，讓錯誤座標持久化，路線再度跑到綠島。

3. **`rest` 活動有 `placeLabel` 時照樣 geocode 到錯誤地點（真正根本原因）**：
   - 「海明威民宿 Check-in」有 `placeLabel="海明威民宿"`，搜尋後回傳台東縣綠島的同名民宿。
   - `rest` 是動作（Check-in、盥洗），不是目的地，**即使有 placeLabel 也不應 geocode**。

**修復方法**：

| 動作 | 檔案 |
|---|---|
| `usableCoords`/`usable` 加 `typeof lat === 'number' && isFinite(lat)` | `MapView.tsx`、`RoutePrefetcher.tsx` |
| `signatureFor` 過濾非有限數字的點 | `route.ts` |
| **四條管線統一改為 `rest` 全部跳過（不限 placeLabel）** | `MapView.tsx`、`RoutePrefetcher.tsx`、`route.ts`、`activityPhotos.ts` |
| DB 修正：清 `location: 綠島座標` → `null`，刪 `travelLegs/travelSig` | Node.js 一次性腳本 |

**預防原則**：

- **`rest` 類型永遠跳過 geocode**，不看 `placeLabel`。`rest` 是動作（入住、盥洗、休息），destination 已由住宿或前後景點的座標代表。
- **「過濾某類活動」的規則必須四處同步**（`activityPhotos.ts` / `MapView.tsx` enqueue / `RoutePrefetcher.tsx` enqueue / `route.ts buildDayPoints`）。修其中一處，一定 grep 其餘三處。
- 清除座標永遠用 `null`，不用 `{}`（空物件通過 truthy 檢查）。
- API 邊界考慮加 Zod `safeParse`：行程 JSON parse 失敗就 `console.error`，讓壞資料在進前端前留下警告。

### 1-B 「修正路程時間」反覆完成卻無效（過期 travelLegs 造成的假警示）

**發生時間**：2026-06-21

**症狀**：使用者按「一鍵修正路程時間」多次，每次都收到「✅ 已自動修正路程時間」通知，但進 App 後移動時間沒變、警示橫幅（等待修正）仍在。

**根本原因**：
- 某活動（台東行 Day 6 的「飯店 Check-in」，type=other）是在 `travelLegs` 算完**之後**才被補上座標。
- 該天 `travelSig` 因此沒有包含這個點 → travelLegs 過期：路線「多良車站 → 飯店 → 夜市」少了中間的飯店，導致那段 224km / 184 分鐘的跨區長途車程被錯算到「嘉義夜市」那一段（夜市其實離飯店只有 2.7km）。
- 夜市段前面只留 20 分 → `scanBufferWarnings` 標成 🔴「留 20 分 < 實際 184 分」的永久紅色警示。
- **「修正路程時間」只用 AI 調活動時間，從不重算 travelLegs** → 這種「過期路段」造成的假警示，AI 再怎麼調時間都消不掉（沒有任何一天能把 3 小時車程塞進 20 分空檔）。每次都「成功」回傳方案，但警示永遠在 → 使用者感覺「修了很多次都沒用」。

**修復方法**：
- 清除該天的 `travelSig`/`travelLegs`/`routePolyline`（DB 直改）→ 下次開行程頁時 `RoutePrefetcher` 用「飯店已有座標」重算，224km 會正確落在涵蓋它的「長途大征途」交通卡（200 分自駕）上 → 警示消失。

**預防原則 / 待改進**：
- **根因同 1-A**：點位在 travelLegs 算完後才補座標 → 路段過期。`RoutePrefetcher` 理論上會因 sig 改變而重算，但若使用者流程是「開 App→看警示→按修正→沒開地圖/沒重載頁」，重算可能沒被觸發。
- 建議：①「修正路程時間」執行前，先確認/觸發 travelLegs 重算（而非直接叫 AI 調時間）。② `scanBufferWarnings` 或修正流程對「單段路程時間 ≫ 合理上限（例如日內某段 > 60 分、卻只配幾分鐘空檔）」應視為「路線過期/跨區」徵兆，提示重算而非叫 AI 硬調。③ 補座標後主動讓對應天的 travelSig 失效（強制重算）。

---

### 1-C 跨海行程地圖省略港口，路線像直接飛過海

**發生時間**：2026-06-22

**症狀**：Day 3、Day 5（台東↔綠島搭船）地圖路線從本島景點直接連到離島景點，中間的港口（富岡漁港、南寮漁港）不見了，路線圖不正確。

**根本原因**：
- 港口/搭船步驟都是「交通卡」且 `location` 為 null。
- `buildDayPoints` 為了避免亂飄座標（見 1-A）刻意排除所有交通卡 → 港口不會變成地圖點位。
- 結果路線在「本島景點↔離島景點」之間直接連線（跨海段 Directions 回 ZERO_RESULTS → 畫成直線），看不到港口。

**修復方法（完整版）**：
- `route.ts` 新增 `portInfo(activity)` + `KNOWN_PORTS` 內建台灣主要渡輪港固定座標（富岡/南寮(綠島)/開元/白沙尾/東港/馬公/烏石）。**為何用固定座標不 geocode**：港名常同名歧義（南寮漁港：綠島 vs 新竹），用 day.city 當偏好會誤抓別縣市（同 1-A 類問題）→ 渡輪港是少數已知地點，直接內建最穩。
- `buildDayPoints` 改為「依序走訪」：景點連續編號 ①②③、港口型交通卡插入為 `kind:'port'`（⚓、海藍色 marker、不佔編號）、其餘交通卡/rest 照舊跳過。
- `ItineraryMap` 跨海段（無開車 leg 且端點有港口）改畫**虛線**（船程，與陸路實線區隔）。
- 不需動 geocode 管線（港口用內建座標）；現有行程開地圖時 travelSig 因新增港口點而改變 → RoutePrefetcher 自動重算。

**預防原則 / 與舊問題的關係**：
- 沒有重蹈 1-A/4-A：港口**不走 geocode**（內建座標），無同名誤抓風險。
- 沒有影響 3-A（刪除）：港口仍是 transport 型，block 模型不變。
- 沒有產生 1-B 假警示：到港口的 leg allotted≈0 會跳過、到岸後的 leg 因前一張是「船」交通卡（isNonDriving）跳過。
- 新增港口若不在 `KNOWN_PORTS`：`portInfo` 回 null（維持現狀，不亂猜），需要時補進表即可。

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

## 3. 編輯流程（刪除 / 新增 / 排序）

### 3-A 刪除景點後留下「孤兒交通卡」、移動列沒更新到下一站

**發生時間**：2026-06-21

**症狀**：使用者刪掉 Day 3 的「朝日溫泉」景點，但移動列沒有自動更新成「前往住宿」的路程資訊，仍顯示舊的「騎車前往溫泉」。

**根本原因**：
- 刪除流程（`ItineraryClient.confirmDelete`）只送 `remove_activity`（刪該景點）＋時間順移，**沒有一併刪掉「帶你去那個景點的前置交通卡」**。
- 「朝日溫泉」前面那張 `transport`「騎車前往溫泉」變成孤兒，卡在「夜間潮間帶 → 住宿」之間。
- DayView 顯示移動列時，看到「當天最後一項是交通卡」就用那張卡當「到住宿的移動列」→ 顯示成「騎車前往溫泉」（指向已刪除的溫泉），而非「前往住宿」。
- 補充：到住宿的真實路段其實已算好（`travelLegs` 有 `accommodation`，`travelSig` 也已不含朝日溫泉）；純粹是孤兒交通卡擋住顯示。

**修復方法**：
- 立即修（資料）：DB 移除孤兒交通卡 → DayView 自動改用 `travelLegs` 的 accommodation 段顯示「前往住宿」。
- 根治（程式碼，2026-06-21）：`lib/itinerary/reschedule.ts` 新增 `deletePlace(activities, id)`——用 block 模型刪除，刪景點連同其前置交通卡，再 `recomputeTimes` 重排後面時間、修正剩餘交通卡標籤。`ItineraryClient.confirmDelete` 改為呼叫它、組單一 `update_day` patch（取代原本 `remove_activity` + `computeDeleteShiftOps`）。景點消失→travelSig 變→RoutePrefetcher 自動重算 travelLegs，移動資訊隨之更新。已加 tsx 單元測試（刪中段/最後景點含前置交通、刪純交通卡、刪首個景點、找不到 id）。

**預防原則 / 後續**：
- 刪景點＝刪整個 block（景點＋前置交通卡），不要只刪單一活動。block 模型（`buildBlocks` 的 leading）是唯一真相。
- 同理跨天移動/拖拉已用 `moveBlockToDay`（也走 block）。未來任何「移除/搬移景點」的新流程都應走 block，不要手刻單點刪除。

---

## (預留) AI 調整後行程資料異常

*(未來 AI patch 導致的資料問題在此記錄)*

---

## 4. 座標 / 地理編碼問題

### 4-A geocode 查詢返回離島錯誤座標

**發生時間**：2026-06-20 / 2026-06-21（與 1-A 同源，修兩次）

**症狀**：台東縣本島的景點，geocode 後取得綠島座標。

**根本原因**：
- `rest` 活動（Check-in、盥洗）被送去 geocode，查詢字串是動作描述而非真正地點。
- 即使有 `placeLabel`（如「海明威民宿」），Google Places 台東縣搜尋範圍含離島，可能回傳綠島的同名民宿。

**修復方法（最終版）**：`type=rest` 的活動，**無論有無 `placeLabel`**，四條管線一律跳過 geocode。

**預防原則**：
- `rest` 是動作，不是目的地，永遠不需要獨立座標。`placeLabel` 不改變這一點。
- 有 `placeLabel` ≠ 可以 geocode；能 geocode 的條件是「這個活動本身就是要去的地點」。

---

## 附錄：四條 geocode 管線一覽

每次改過濾規則，以下四處要同步：

| 管線 | 檔案位置 | 說明 |
|---|---|---|
| 後端補照片/座標 | `lib/maps/activityPhotos.ts` | 生成/patch 後背景執行 |
| 前端地圖 geocode | `components/map/MapView.tsx`（`enqueue` 迴圈） | 打開地圖時執行，結果寫回 DB |
| 背景路線預算 | `components/map/RoutePrefetcher.tsx`（`enqueue` 迴圈） | 頁面載入後執行，結果存 travelLegs |
| 路線點位組裝 | `lib/maps/route.ts`（`buildDayPoints`） | 地圖 marker 與路線計算用 |
