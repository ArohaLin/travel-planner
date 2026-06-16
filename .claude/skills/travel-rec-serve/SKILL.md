---
name: travel-rec-serve
description: travel-planner 旅遊 App 的「精選推薦清單 + 地點搜尋 + 願望清單」功能面——如何提供／調整推薦清單瀏覽、漏網之魚（longlist）展開、即時地點搜尋（策展＋Google Places），以及把結果加入行程願望清單。當使用者要求調整精選推薦/搜尋/願望清單的 UI 或 API、或要了解這些功能怎麼串接時使用。建置「某區域資料」本身請改用 travel-rec-build。
---

# 旅遊推薦・清單與搜尋服務 Skill

`recommendations` 資料如何被使用者瀏覽、搜尋、加入願望清單。
資料怎麼來（建置某區域）見 **travel-rec-build**；本 skill 專注**服務／前端功能面**。

> 路徑：`/Users/aroha/travel-planner`。語言：繁體中文。
> 定位：幫使用者**方便挑出專屬行程**，非 AI 自動排程。瀏覽推薦/搜尋命中策展 = 0 AI token。

## 核心模型：靜態存策展、即時補事實
DB 長期只存 `google_place_id` ＋策展欄位（名稱/分類/短評/標籤/徽章/座標/快照分）。
**評分、照片、營業時間在顯示時用 place_id 即時向 Google 補**（不過時、零維護、合條款）。
`rating_snapshot/photo_ref` 只是建置快照，供排序與列表預覽；顯示真相以即時為準。

## 三個分頁（`components/explore/ExploreSheet.tsx`）
ExploreSheet tab：`'recommend' | 'search' | 'wishlist'`，即 **精選推薦 / 🔍 搜尋 / 願望清單**。

### 地區選擇器（recommend / search 共用）
- 標籤列下方一排 chip：`全部` ＋每個已發布地區（`RegionChip` 元件）。**只有地區數 > 1 時才出現**（單一地區時自動隱藏、無視覺變化）。
- 狀態：`regions`（全部地區）、`selectedRegion`（使用者選擇，`null`＝跟著目的地預設）、`activeRegion`（伺服器實際生效地區，用來高亮 chip ＋ 給搜尋帶 region）。
- `loadRecs` 隨 `selectedRegion` 改變重抓；願望清單獨立 effect（不隨地區重抓）。
- **新增其他區域資料後，selector 自動出現，無需改前端。**

### 1) 精選推薦（recommend）
- 來源 API：`GET /api/recommendations?q=<目的地文字>&region=<all|地區名|空>`（`app/api/recommendations/route.ts`）。
  - 任何登入者可讀；service role 讀 `recommendations`，依 `credibility` 排序。
  - 永遠回 `regions`（所有已發布地區，給 selector）。
  - `region` 生效解析：明確指定 > 目的地文字 `q.includes(region)` 比對 > 比對不到回 `all`；回傳 `region` 為實際生效地區。
- 上半：`featured`（精選）卡片，按分類分組。
- 下半：**漏網之魚（longlist）區塊**（`LonglistSection`）——`tier='longlist'` 的候選。
  - **預設展開**（`useState(true)`）；卡片 `LongCard` 顯示縮圖＋名稱＋星等＋`editorialReason` 簡介＋♡ 加入鈕。

### 2) 搜尋（search）
- API：`GET /api/places/search?q=&near=<目的地>&region=<all|地區名|空>`（`app/api/places/search/route.ts`）。
  - **同時回兩段**：`curated`（策展清單名稱模糊命中，置頂、≤8 筆）＋`places`（Google **Text Search** 即時結果，去除與策展重複的 place_id，≤12 筆）。
  - **地區範圍**：`region`（非 all）優先限定策展＋偏向 Google 查詢；否則用 `near` 目的地比對。搜尋帶的是 `activeRegion`（跟 selector 連動）。
  - `q` < 2 字回空。Google 查詢失敗只回策展。
- UI：輸入框防抖 **400ms、最少 2 字**；`SearchCard`（Google 結果）＋策展卡並陳。

### 3) 願望清單（wishlist）
- 每行程一份（`wishlist_items` 表）。API `app/api/itinerary/[id]/wishlist/route.ts`。
- 任一來源（精選 / 漏網之魚 / 搜尋的 Google 結果）都能 ♡ 加入：
  - 策展來源帶 `recommendation_id`；Google 來源（`addPlace`）帶 `google_place_id/name/category/lat/lng/photo_ref`，`source='search'`。
- 願望清單可再「加入某一天」變成行程活動（拖進每天）。

## 照片
卡片縮圖／詳情大圖與宣傳冊**共用** `GET /api/photo?ref=<photoRef>`（以 photoRef 為快取鍵，CDN `s-maxage` immutable，整站每張只向 Google 取一次）。Google 金鑰不出現在前端。

## 相關檔案速查
| 功能 | 檔案 |
|---|---|
| 三分頁 UI / 地區選擇器 RegionChip / LongCard / SearchCard / addPlace | `components/explore/ExploreSheet.tsx` |
| 精選清單 API | `app/api/recommendations/route.ts` |
| 搜尋 API（策展＋Google） | `app/api/places/search/route.ts` |
| 願望清單 API | `app/api/itinerary/[id]/wishlist/route.ts` |
| 型別（含 `tier`） | `lib/types/recommendation.ts` |
| Server Places 工具 / getServerMapsKey | `lib/maps/places.ts` |
| 照片 proxy | `app/api/photo/route.ts` |
| DB schema | `supabase/migration_recommendations.sql` + `supabase/migration_longlist.sql` |

## 常見調整怎麼做
- **改清單排序/筆數上限**：搜尋 `.slice(8)` / `.slice(12)` 於 search route；精選排序在 recommendations route 的 `.order('credibility')`。
- **加新分類**：同步 `migration_recommendations.sql` 的 `category` CHECK、型別、ExploreSheet 分組。
- **漏網之魚預設收合/展開**：`ExploreSheet.tsx` 的 `LonglistSection` `useState(...)`。
- **顯示更多即時欄位（營業時間等）**：用 place_id 打 Place Details，勿存進 DB（保持即時補事實原則）。

## 驗證（本機）
`npm run dev` → 登入 → 開某行程「精選推薦」抽屜：
1. 精選分類正常、漏網之魚預設展開且有簡介。
2. 搜尋輸入 2 字以上，策展命中置頂、Google 結果補底、可加入願望清單。
3. `tsc --noEmit` + `npm run build` 全綠再部署。

## 維護（功能調整時必更新本 skill）
這些功能改動時**務必同步更新本 skill**：
- 分頁集合（目前 recommend/search/wishlist）、清單/搜尋筆數上限、防抖參數。
- 任一 API 路徑/回傳結構（recommendations、places/search、wishlist）變動。
- `recommendations`/`wishlist_items` schema 或 `tier`/`category` 取值變動（同步 travel-rec-build）。
- 照片 proxy 端點或快取策略變動。
