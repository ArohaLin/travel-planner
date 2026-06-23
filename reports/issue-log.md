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

## 5. 住宿評價技能（Google Travel 爬取／Places 解析）

> 離線技能 `.claude/skills/lodging-review`＋`lodging-research`（研究住宿評論→判讀→寫進 `lodging_research` 表，App「探索→🏨住宿評價」讀）。技能核心：`lib/resolve.mjs`（解析/信心/設施）、`scripts/query.mjs`（爬取）、`scripts/research.mjs`（入庫）、`lib/parse.mjs`。
> 改技能或遇怪症狀（評論/設施抓 0、解析配錯、入庫報錯）先讀本類：5-A~C 是最關鍵的，其餘已修雷點見 **5-D 速查表**。

### 5-A 評論面板／設施面板偶發抓到 0

**發生時間**：2026-06-22

**症狀**：某些住宿（如尚佐安森）整間抓不好——評論 0 則、設施 0 項、直方圖缺、信心只到 med。

**根本原因**：
- **真根因（連鎖）**：`normalizeName` 把「民宿編號291號」拿掉後**殘留孤立的「合法」**，導致拿「尚佐安森民宿**合法**」這種壞字串去查 Google Travel → 落到沒有評論鈕的頁面 → 評論抓 0、直方圖缺、設施面板也撈不到。
- 次因：設施抓取沒主動展開「設施」區就抓，且小民宿 Google 結構化資料本來稀疏。

**修復方法**：
- `resolve.mjs` `normalizeName`：清掉「合法民宿編號N號」整段與孤立「合法」。修完尚佐安森**同時**復原：評論 0→58、信心 med→high、直方圖 缺→OK、設施 0→6。
- `query.mjs` `openReviews`：多策略開啟＋捲動觸發＋失敗重新導航重試，**以「網路真的攔到評論(seen>0)」當成功判準**（非點擊成功）。
- 設施兩層保底：(B) `scrapeAmenities` 展開＋抓 0 自動重試；(A) `amenitiesFromDetails` 用 Places 設施布林＋**官方簡介挖設施名詞**（電視/冰箱/停車…）。

**預防原則**：
- **遇「整間抓不好」先看 log 的 `Travel查詢:` 那行查詢字乾不乾淨**——壞字串是最常見元凶。
- 失敗（評論/設施/直方圖抓 0）要重試或保底，並在 log 誠實標示，不要靜默回空。

### 5-B 解析配到完全不同的住宿（通用詞綁架）

**發生時間**：2026-06-22

**症狀**：查「貓追雨」配到「密斯朵」、查名稱錯字配到別間。

**根本原因**：Google Travel 店名比對器弱，被「親子民宿/包棟」等通用詞綁架。

**修復方法**：改用 **Google Places 文字搜尋**解析（錯字校正、不被通用詞綁架）＋**信心度**（特殊核心相似度＋城市一致）：`low` 停下列候選請確認、`med` 自動改用最接近名但告知使用者、`high` 靜默續跑。評分/總數一律以 Places 官方為準（直方圖會選到鄰家）。

**預防原則**：解析先行、信心把關；`low` 一定停，別分析錯的那間。

### 5-C 入庫報 PostgREST「Empty or invalid json」

**發生時間**：2026-06-22

**症狀**：含 emoji 的評論引文寫入 `lodging_research` 時被 PostgREST 拒收。

**根本原因**：emoji 被 `.slice()` 從中間切斷 → 孤立代理字元 → UTF-8 編碼壞掉。

**修復方法**：`research.mjs` 用 **code-point 切**（`[...str].slice()`）＋入庫前 regex **清掉孤立代理字元**。

**預防原則**：所有「截斷使用者文字」的地方都要 code-point 安全；入庫前統一淨化。

**殘留已清（2026-06-22）**：密斯朵曾有一筆雜訊設施「秘食-私廚4.7 (314)餐廳」（餐廳名+評分被 `KNOWN` 命中、長度漏網）。修法：`amenityExtractor` 加 `RATINGY` 過濾——含**評分小數**（`4.7`）或**括號數量**（`(314)`）的字串視為店名/評分雜訊、剔除（真實設施不含此型數字，如「24小時」不受影響），並清掉該筆 DB 資料。目前第 5 類無已知殘留。

### 5-D 其他已修雷點（速查）

| 症狀 | 根因 → 解法 | 程式位置 |
|---|---|---|
| 直方圖數字錯（顯示鄰家 4.1/2497） | parse 選到鄰家飯店區塊 → 用 Places 官方 total 當 `totalHint` 鎖定，選不到回 null 不採信 | `query.mjs`(2)、`parse.mjs` |
| Places New API 回 INVALID_ARGUMENT | FieldMask 用了非法欄位 `amenities` → 只用合法欄位（`editorialSummary`/`types`/各 boolean/`parkingOptions`/`accessibilityOptions`） | `resolve.mjs` `placeDetails` |
| 設施重複（Wi-Fi×3、「停車場」與「停車」並列） | 多來源變體 → 面板內正規化去重；跨來源 `mergeAmenities` 用**包含關係**去重＋API 標籤對齊面板用詞（親子友善/寵物友善） | `query.mjs` `amenityExtractor`、`resolve.mjs` `mergeAmenities` |
| 小民宿落「搜尋清單頁」、開不了詳情 | Google 查不到精確名 → 讀清單第一筆全名重查（`effectiveQuery`）直達詳情 | `query.mjs` 落清單備援 |
| `claude -p` 判讀 401 | 沙箱訂閱認證無法傳子程序、且多餘 → 判讀由 Claude 本人做、`--judged` 傳入 | `research.mjs` |
| 批次中文路徑參數失效 | shell 變數未加引號被截斷 → 指令一律用引號包路徑 | 操作習慣 |
| 重爬覆寫好檔→壞跑(0評論)可能被誤入庫 | 檔名相同會覆寫 → 壞跑**不入庫**；只補設施用 PATCH 只改 `features` 欄、不動評論；清掉 0 評論快取 | 操作習慣 |
| 信心度把「中文正名＋英文行銷字」誤判 low 而停止（如「馬可樓民宿 Cenacle B&B」sim 0.23、「…奧麗雅安莊園…Taitung Seaview B&B Chateau D'Olea」sim 0.18） | 整串 Levenshtein 被英文/行銷字拉低，但查詢核心其實是官方名的子字串 → `confidence` 加**包含關係**：qCore 是 rCore 子字串（或反之，≥2字）即視為 high | `resolve.mjs` `confidence` |
| 國際連鎖飯店誤判 low 而停止（查「台東桂田喜來登酒店」→ Places 回英文名「Sheraton Taitung Hotel」，中英 sim=0） | 中英跨語系無法逐字比名 → `confidence` 加 `scriptMismatch`（一邊含 CJK、一邊全英數）：城市不衝突就給 **med**（自動改用解析名＋告知），不誤判 low | `resolve.mjs` `confidence` |
| 解析名是行銷字堆疊超長名時，拿它當 Travel 查詢字→評論面板開不了 | travelQuery 用了超長解析名 → 落到開不了評論的頁面 → 改用使用者原查詢；解析名 normalize 後 >14 字且原查詢較短時改用原查詢。仍偶發時用更短核心名（如「奧麗雅安莊園 台東」）重試即可開 | `query.mjs` travelQuery |
| 批次orchestrator 解析 query.mjs 輸出全 STOPPED（誤判） | query.mjs 精簡輸出是**多行 pretty-print JSON**，不能用「挑單行 `{` 開頭」parser → 直接 `JSON.parse(out.trim())`（stdout 只有那一個物件） | 批次腳本 |
| **店家評論（非住宿）抓 0**：衝浪店等地圖商家不在 Google Travel | ⚠️先別急著下「抓不到」結論——根因是**方法錯，不是死牆**。① **headless 一律被 Google 反爬蟲擋**（回「異常流量」CAPTCHA 頁，body 僅約 270 字）→ 不可破解 CAPTCHA。✅**正解：有頭（`headless:false`）真實 Chrome ＋住宿爬取養過的 `chrome-profile`（有 Google cookies）＝完全避開 CAPTCHA**。② 評論面板入口要走對：搜尋知識面板的「X 則評論」對住宿型會跳 Google Travel 精簡頁（分頁、RPC 不一定觸發、DOM 只拿 ~10–20）；**改開 Google Maps 地點頁**（`/maps/place/?q=place_id:<ID>`）→ 點「評論」分頁→排最新→**滑鼠滾輪捲內層窗格無限載入**→逐則抽（`.jftiEf`/`.wiI7pd`，星等掃 aria-label）。實測 6 間抓到 281/187/94/65/53/36 則（近全量、含日期）。③ 住宿型（飯店版評論）星等在不同 aria-label（含「房間：5 服務：」子評分）→ 星等抽取要掃**所有** aria-label（顆星/分/Rated/X 顆/X/5）否則 rating 全 null | `shop-maps.mjs`（headful Maps，正解）；`analyze-surf-reviews.mjs`＋`reingest-surf-reviews.mjs` 算近一年分佈/主題%/負評；App 用 `category` 區分住宿/台東衝浪。**實測（2026-06-23）：同流程改 `headless:true` 仍不行，且 DOM 探測確認根因**——headless 下 Google 回**精簡版地點頁**：`role=tab` 數＝0（**無 總覽/評論/相片 分頁**）、評論清單與「N 則評論」完全不渲染，整頁唯一含「評論」字樣的可點元素是「**撰寫評論**」（發表入口、按了才跳登入牆）。⚠️選擇器陷阱：`aria-label*="評論"` 會誤命中「撰寫評論」→ 點評論分頁要用「文字以『評論』開頭、且排除『撰寫/發表』」。結論：headless 連可讀評論 UI 都沒有，**抓 Maps 評論必用 headful**（`shop-maps.mjs` 預設 headful，`HEADLESS=1` 只供驗證）。④另測「直接 google.com **搜尋面板**」（手機常用的找評論方式）：headful 同樣不被擋、評論有顯示、可抽取，但**桌面版只內嵌約 3 則**（手機行動版才有「更多評論」分頁到上百則；桌面點「N 則評論」不展開可捲清單）。搜尋面板與 Maps 是**同一份評論庫**，故桌面自動化抓全量仍以 **Maps 地點頁無限捲**為準（`shop-search.mjs` 備查；星等用 aria-label 不是「X/5」文字，且 `aria-label*="評論"` 會誤中「撰寫評論」） |

**通用守則**：①解析先行、信心把關（low 一定停）；②官方數據（評分/總數/簡介）優先用 Places，爬取只補 Places 沒有的；③抓 0 要重試或保底並在 log 誠實標示，不靜默回空；④入庫前 code-point 切字＋清孤立代理字元；⑤判讀是 Claude 本人做，不開 `claude -p`。

**App 顯示側雷點（2026-06-23）**：
- **特色來源只顯示一個**：`LodgingTab` 原本寫死 `f.sources[0]`，多來源事實只出一個連結 → 改 `f.sources.map(...)` 全部渲染（來源1/來源2…）。住宿/店家評價共用此元件，一起修好。
- **DB 更新了但瀏覽端看到舊資料**：Next.js 會快取 Server Component / Route Handler 內的 supabase fetch（含 dev 的 `.next/cache` 跨重啟仍在）→ 離線改 DB 後不反映。修法：讀 `lodging_research` 的 `app/api/lodging/route.ts` 加 `export const dynamic='force-dynamic'`＋`revalidate=0`；本機驗證若卡舊資料，`rm -rf .next/cache` 再重啟。
- **多來源佐證補件**：每條事實的 `sources` 應列「全部」佐證連結（不只一個）。住宿先前入庫多被精簡成 1 個；補件靠子代理逐間重研究文章（多關鍵字→逐篇 WebFetch 確認本店→列出支持該條的所有 URL，寧缺勿濫、防張冠李戴），結果合併進 `features.facts[i].sources`（`scripts/update-lodging-sources.mjs` / `update-surf-sources.mjs`）。住宿多來源比例 50%→78%。

---

## 附錄：四條 geocode 管線一覽

每次改過濾規則，以下四處要同步：

| 管線 | 檔案位置 | 說明 |
|---|---|---|
| 後端補照片/座標 | `lib/maps/activityPhotos.ts` | 生成/patch 後背景執行 |
| 前端地圖 geocode | `components/map/MapView.tsx`（`enqueue` 迴圈） | 打開地圖時執行，結果寫回 DB |
| 背景路線預算 | `components/map/RoutePrefetcher.tsx`（`enqueue` 迴圈） | 頁面載入後執行，結果存 travelLegs |
| 路線點位組裝 | `lib/maps/route.ts`（`buildDayPoints`） | 地圖 marker 與路線計算用 |
