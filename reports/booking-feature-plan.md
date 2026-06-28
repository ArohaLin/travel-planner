---
title: 預訂管理功能 ＋ UX 全螢幕改版 — 設計與測試計畫
date: 2026-06-28
category: 規劃
summary: 預訂管理頁（單一真相、可連結行程同步）、底部操作列改版（6 顆＋常駐）、所有大型底部彈窗全螢幕、缺 X 補齊；含 S0 dev 驗證工具（/dev/ui 元件預覽＋/dev/login 自助登入）、分片實作與每片測試計畫。使用者 2026-06-28 已拍板 5 項決策。
---

# 預訂管理功能 ＋ UX 全螢幕改版

> 狀態：**規劃中（待使用者最終確認後開工）**
> 動工準則：每片獨立 commit／部署／驗證；UI 改動先用 S0 的 `/dev` 工具自我截圖驗證，再請使用者實機。動座標/欄位前必 grep（midLat 教訓）。

## 0. 背景與目標
新增「預訂管理」：集中管理所有需預訂的東西，**含不在行程表內**的票券/訂位。可與行程項目**同步**（一邊改、另一邊跟著變）。可全部顯示、依日期、疊加類型篩選。

## 1. 核心原則（單一真相，不複製 — P2 教訓）
剛在 P2 拔掉「同一資訊存兩份再同步＝會分歧」。本功能**不得重蹈**：
- **行程內的預訂**（住宿＋需預訂活動）：真相＝行程卡本身。預訂頁**即時讀**、編輯走現有 patch（含住宿多晚同步）。**不另存副本**。
- **行程外的獨立預訂**：存新 `bookings` 表（仿待辦/採購：RLS＋Realtime＋API）。
- **連結＝合併**：獨立預訂連到某卡 → 資料併入該卡（卡片需有對應欄位）＋刪 standalone 列 → 之後單一真相；取消連結＝從卡片抽回成 standalone。永遠**只有一個來源**，所以「一邊改、另一邊跟著變」是天然結果，不會分歧。

---

## 2. A — UX 全域調整

### A1. 底部操作列改版（6 顆、常駐）
現在（`ItineraryClient.tsx:1473`）：`探索 / 願望清單 / 新增`，且只在「list 檢視＋可編輯」顯示。
改為 **6 顆**：`探索 / 願望 / 待辦 / 採購 / 預約 / 新增`
- `待辦`、`採購` 從 header **移到底部**（header 不再放這兩顆）；新增 `預約` 入口。
- 標籤縮 **2 字**（願望清單→願望）。6 顆於 iPhone 16 Pro（約 393px）每顆約 65px，**寬度用 S0 `/dev/ui` 截圖驗證**，過擠則改 icon 為主/微調。
- 徽章：`待辦`＝未完成待辦數（沿用 `todoBadge`）、`採購`＝未買數（`shoppingBadge`）、`預約`＝需預訂未完成數（新 `bookingBadge`）。紅色圓徽。
- **可見範圍改常駐**：list／地圖檢視、各角色（含訪客唯讀）都看得到管理類入口（探索/願望/待辦/採購/預約）；`新增` 仍只在 `userCanEdit && list` 顯示。

### A2. 所有大型底部彈窗 → 全螢幕
統一 `height: 100dvh`＋safe-area 內距（取代現有 96dvh/86dvh/82vh/各種 max-h 不一）。
**全螢幕（13 個）**：BugReportSheet、ShoppingSheet、ExploreSheet、RecDetailModal、AINotesSheet、ChatSheet、WeatherDetailSheet、TodoSheet、ActivityDetailModal、ActivityEditModal、AccommodationDetailModal、AccommodationEditModal、（新）BookingSheet。

### A3. 小型輸入 modal — 保精簡、只補 X
全螢幕會空蕩，維持原尺寸但**補 X 關閉鈕**：AddNoteModal、ThemeEditModal、DepartureEditModal（目前缺 X）。

---

## 3. B — 預訂管理功能

### B1. 資料模型
**新表 `bookings`（僅 standalone）**：
```
id uuid pk / itinerary_id fk(on delete cascade)
title text / type text(lodging|transport|activity|ticket|restaurant|other)
status text(needed|reserved|cancelled)
date date / end_date date / time text
cost jsonb / deposit_paid jsonb
booking_platform / order_number / booking_url / free_cancel_by / contact / notes text
created_by / created_at / updated_at
```
RLS（行程成員可讀、可編輯者可寫；service role 經 getItineraryAccess）＋加入 `supabase_realtime` publication。**連結的預訂不存這裡**（它們＝行程卡）。

**Activity schema 擴充**（住宿已有、活動補上，讓「連結到活動」不掉資料、編輯表單統一）：`bookingPlatform`、`orderNumber`、`depositPaid`(Money)、`freeCancelBy`、`contact`（皆 optional）。`forPrompt()` 一併過濾長文字欄位（沿用現規則）。

### B2. 彙整檢視（union，單一真相）
顯示＝ 各天住宿（reservationStatus≠none，**多晚同 id 合併一筆、標日期範圍**）＋ 需預訂活動（effectiveReservation≠none）＋ standalone bookings。每筆標來源（同步卡／獨立）。

### B3. 篩選（兩列、可疊加）
- **第一列 日期**：`[全部]` ＋ 每天 `[8/15 週五][8/16 週六]…`（日期＋星期）。
- **第二列 類型**：`[全部]` ＋ `住宿 / 交通 / 活動 / 票券 / 餐廳 / 其他`。
- 兩列水平捲動、各自選一、**上下同時疊加**（日期 AND 類型）。
- 狀態（需預訂/已預訂）篩選：點頂部彙總卡切換（加分項，非必須）。
- 排序：預設「需處理優先」（needed＋免費取消將近排前），可切「依日期」。

### B4. 彙總列
需預訂 N／已預訂 M／總金額／待付餘額（訂金 vs 總額）。

### B5. 截止提醒
`freeCancelBy` 將近 → 紅/黃標；與既有「出發前倒數」待辦打通（同一份資料）。

### B6. 付款追蹤
已付訂金 vs 總額 → 尾款待付。

### B7. 快速動作（精簡）
**開訂房連結**、**複製訂單號**。（加入日曆 .ics、撥電話 — 使用者指示先不做。）

### B8. 連結／取消連結
獨立預訂卡：「🔗 連結到行程項目」→ 選活動/住宿 → 併入該卡＋刪 standalone 列。已連結卡標「🔗 同步自 D3–4」。取消連結＝抽回 standalone。

### B9. 入口
底部列「預約」鈕＋紅徽章 → 開全螢幕 `BookingSheet`。

---

## 4. S0 — dev 驗證工具（dev-only，永久重複用）
讓 Claude 能自我截圖驗證 authed/UI（平時看不到登入後畫面）。**`NODE_ENV==='development'` 硬擋、middleware 僅 dev 放行 `/dev`，production 完全失效**。
- **`/dev/ui`**：假資料元件預覽頁，渲染所有 sheet／底部列／BookingSheet＋開關鈕 → preview 工具截圖、縮 iPhone 寬、切深色，驗版面/全螢幕/X/RWD（不碰真資料）。
- **`/dev/login`**：用 `.env.local` 既有 service role key 為指定帳號簽發 session（免密碼）→ Claude 自助登入看真實行程頁。建一次、長期可重複。

---

## 5. 切片順序
| 切片 | 內容 | 主要驗證 |
|---|---|---|
| **S0** | dev 工具 `/dev/ui`＋`/dev/login`（dev-only、雙重硬擋） | 自我截圖；確認 production 路由 404 |
| **S1** | UX 全域：底部列 6 顆＋常駐、13 個彈窗全螢幕、3 個補 X | `/dev/ui` 截圖逐一驗；build |
| **S2** | bookings 資料層：migration（含 RLS＋realtime）＋型別＋API＋useBookings hook＋Activity 欄位擴充 | 單元測；真實 DB 腳本；build |
| **S3** | BookingSheet：彙整 union＋兩列篩選＋彙總＋standalone CRUD＋付款/截止顯示 | 彙整/dedup/篩選/彙總單元測；`/dev/ui` 截圖；build |
| **S4** | 連結／取消連結（standalone ↔ 卡片，合併/抽回） | 合併邏輯單元測；真實流程腳本；build |
| **S5** | 截止提醒接待辦倒數＋快速動作（開連結/複製訂單號） | 截止判定單元測；build |
| 第二批 | 附件上傳、匯出分享（**延後**） | — |

---

## 6. 測試計畫（每片都做）
| 層 | 方法 |
|---|---|
| 純邏輯單元測（tsx 斷言腳本）| union 彙整、多晚 dedup、兩列篩選疊加、彙總/待付計算、截止緊迫判定、連結合併 → 全綠 |
| 編譯 | `npm run build` / tsc |
| 真實資料驗 | 腳本打台東行程 DB，印出彙整後預訂清單核對 |
| **UI 自我驗（S0 啟用後）** | `/dev/ui` preview 截圖：全螢幕滿版、X 可見可關、6 顆底部列不擠、兩列篩選、深色、iPhone 寬 RWD |
| 部署後煙霧測 | `/login` 200＋最新部署 Ready；**確認 `/dev/*` 在 production 404** |
| 使用者實機 | 最終真實資料互動：連結/新增/徽章數/同步 |

---

## 7. 已確認決策（2026-06-28 使用者拍板）
1. **待辦也一起移到底部** → 底部列＝探索/願望/待辦/採購/預約/新增（6 顆）。
2. **底部管理列常駐**（各檢視/角色可見；新增仍限可編輯）。
3. **全螢幕範圍照建議**：大型 sheet 全屏、小型輸入 modal 保精簡只補 X。
4. **Activity 補訂房欄位**（平台/訂單號/訂金/免費取消/聯絡）。
5. **切片順序 S0→S5＋第二批**，每片驗證+部署。
6. 篩選改**兩列**（日期＋類型、可疊加）；日期含星期。
7. 快速動作**拿掉** .ics 與撥電話。
8. **S0 dev 工具**納入（/dev/ui＋/dev/login）。

## 8. 風險/注意
- 底部 6 顆寬度 → S0 截圖驗，過擠再調。
- `/dev/*` 安全：雙重硬擋（NODE_ENV＋middleware），務必驗證 production 404。
- 全螢幕改 13 檔屬機械式但量大 → 逐一 `/dev/ui` 截圖確認沒做半套。
- 連結合併要保證單一真相、不殘留雙份（沿用 P2 精神）。
