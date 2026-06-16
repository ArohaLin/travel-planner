---
name: travel-rec-build
description: 為 travel-planner 旅遊 App「指定一個區域」建置精選推薦資料庫（如新增嘉義、花蓮、宜蘭精選）。涵蓋三階段流程——程式蒐集 Google Places 候選、貝氏校正算分初篩、人工策展把關（代表性 vs 灌水）——寫入 recommendations 表（featured 精選＋longlist 漏網之魚），再補件簡介。當使用者要求「新增/建置某地區的推薦」「增加某縣市精選景點」「重建某區資料庫」時使用。
---

# 旅遊推薦資料庫・建置 Skill（指定區域）

把「一個區域」建置成可信、可比較、低維護的精選推薦清單，寫進 `recommendations` 表。
台東已實戰完成（featured 45＋longlist 129）。後續所有區域一律照此流程。

> 搭配 skill：建好的資料如何被清單／搜尋／願望清單使用，見 **travel-rec-serve**。
> 路徑：`/Users/aroha/travel-planner`。語言：繁體中文。

## 核心哲學
- **真實資料為底、人工策展把關**：地點一律來自 Google Places，非 LLM 幻覺。
- **靜態存策展、即時補事實**：長期只存 `google_place_id` ＋策展欄位；評分/照片/營業顯示時即時抓（不過時、零維護、合 Google 條款）。
- **低 token**：蒐集/查證/算分/初篩全用程式；AI 只在最後策展，且批次處理。瀏覽時 0 AI token。
- **必讀準則**：`reports/recommendation-criteria.md`（App 內「開發報告」也可讀）。**新增任何區域前先讀它並遵守**，尤其第四節「代表性 vs 灌水」取捨表。

## 前置：環境變數（皆已在 `.env.local`，勿改動既有值）
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`：呼叫 Google Places（findplacefromtext / textsearch / details）。
- `SUPABASE_DB_URL`：建置腳本用 `pg` 直連 production DB 寫入（與正式同一個 DB）。
- 本機 `claude` CLI：補簡介時用 `claude -p` 免費生成（不計 API 費）。

⚠️ Google Places 預設 1 QPS。所有批次查詢**並發 ≤2、每筆間隔 ~600ms**（見腳本 `mapPool`），否則 `OVER_QUERY_LIMIT`。

## 資料模型（`recommendations` 表）
schema 在 `supabase/migration_recommendations.sql`；`tier` 欄位在 `supabase/migration_longlist.sql`。型別 `lib/types/recommendation.ts`。
重點欄位：
- `region`（如「台東」）、`category`（`景點/美食/住宿/親子`）、`name`、`google_place_id`（unique with region）。
- `lat/lng`、`editorial_reason`（我方短評；longlist 初期留空後補）、`tags`、`source_badges`、`credibility`（排序分）。
- `rating_snapshot/reviews_snapshot/photo_ref`（建置快照，僅供排序與列表預覽；顯示真相以即時為準）。
- `status`（`published/hidden`）、`tier`（`featured` 精選／`longlist` 漏網之魚）。

## 建置流程（三階段 + 補件）

### 階段 A — 蒐集候選（程式，不耗 AI）
多組關鍵字向 Google Places **Text Search** 查該區真實地點（依分類各組關鍵字，如「台東 景點」「台東 美食」「台東 親子」「台東 住宿」＋細分主題）。
- 只收落在該區的點；同一點被多查詢命中 → 記 `hits`（越多越具代表性）。
- 對「有名卻沒搜到」的點**定向補查**（用全名 findplacefromtext）。
- 去重以 `place_id` 為鍵。

### 階段 B — 評分／初篩（程式，不耗 AI）
不直接用星等，用**貝氏校正**壓低少量灌水：
```
貝氏 = (v/(v+M))·R + (M/(v+M))·C
R=星等  v=評論數  C=基準分 4.2  M=平滑常數 120
```
評論越少分數越往 4.2 拉。貝氏只負責**排序**，不負責「收不收」。程式依名次初篩入圍。

### 階段 C — 人工策展（對話內，把關）
逐筆套用 `reports/recommendation-criteria.md` 第四節 2×2 取捨表：
> **灌水 ≠ 淘汰；灌水 = 不採信星等。** 先問「值不值得推薦（要有獨立證據）」，再問「星等可不可信」。
- 有代表性＋星等可信 → ✅ 收，正常呈現。
- 有代表性＋星等灌水 → ✅ 收，但不靠星等（以名產/地標/跨來源理由），**誠實標註星等灌水**。
- 普通＋灌水 → ❌ 不收。
- 代表性必須有**獨立證據**（公認名產、官方收錄、媒體、必比登、多位獨立部落客），不可只憑「我覺得它很紅」。
- 同時顧**多樣性**（各分類名額分配）。
入選者寫 `editorial_reason`（誠實短評）、`tags`、`source_badges`，`tier='featured'`。

### 產出評選報告（必做，便於追溯與重建）
把過程寫成 `reports/<region>-recommendation.md`（frontmatter：title/date/category/summary），表格列出**每個候選**（含落選）的評分、貝氏、「結果與原因」，圖例：`✅入選 ⛔灌水降權 🔸樣本過少 ▫️未進名額 ↪他類入選`。
寫完跑 `npm run build:reports`（打包進 `lib/reports/index.ts`，App 內可讀）。
此報告同時是 **longlist 的資料來源**（解析 ▫️ 列）。

### 階段 D — longlist（漏網之魚）建置
「品質尚可但沒進名額」的 ▫️ 候選 → 收成 longlist 供使用者參考。
參考腳本 `scripts/build-longlist-taitung.mjs`：
1. 解析 `reports/<region>-recommendation.md` 抓 ▫️ 列（名稱／評分／貝氏）。
2. 每筆 `findplacefromtext`（`fields=place_id,geometry,photos`，並發 2、間隔 600ms）取 place_id/座標/photoRef。
3. 寫 `recommendations`，`tier='longlist'`、`editorial_reason=''`、`status='published'`；已存在 place_id 跳過（`ON CONFLICT (region, google_place_id) DO NOTHING`）。
新增其他區域時：**複製此腳本改 region 與報告路徑**（或改寫成吃參數）。

### 階段 E — 簡介補件
參考腳本 `scripts/build-longlist-intros.mjs`：
1. 對每筆打 Google **Place Details** `fields=editorial_summary` 取官方簡介（零幻覺，覆蓋率約 1/3，多為飯店/餐廳缺）。
2. 缺的批次（每 chunk 20）用本機 `claude -p` 生成「中性、客觀」20–30 字繁中簡介（免費、不計費；嚴格只輸出 JSON）。
3. `UPDATE recommendations.editorial_reason`。
**來源優先序：Google 官方 > AI 補缺。**（台東結果：Google 46 + AI 83 = 129）

## 驗證
- 跑腳本後查 DB 計數：`select category, tier, count(*) from recommendations where region='<區>' group by 1,2;`
- 抽查幾筆 `editorial_reason` 是否合理、`google_place_id` 是否有值。
- 在 App「精選推薦」確認清單與搜尋都出得來（屬 travel-rec-serve）。
- **地區選擇器**：DB 一旦有 >1 個地區，前端 ExploreSheet 的「全部／各地區」chip **自動出現**，無需改前端（`region` 拼字要與既有區一致才會正確分組）。

## 邊界 / 注意
- `SUPABASE_DB_URL` 直連的是**正式 DB**，寫入即生效；先確認 region/category 拼字正確。
- 不要覆寫既有 `editorial_reason`（補件腳本只補空的）。
- 名額/分類比例依該區實際候選量調整，無硬性數字；以準則品質為先。

## 維護（功能調整時必更新本 skill）
此 skill 描述的流程一旦變更，**務必同步更新這裡與 `reports/recommendation-criteria.md`**：
- 貝氏參數（C/M）或評分法改動。
- 取捨準則、分類集合（目前 `景點/美食/住宿/親子`）、`tier` 取值變動。
- 建置/補件腳本改名、改吃參數、或新增階段。
- DB schema（`recommendations` 欄位）異動 → 同步 migration 與型別。
