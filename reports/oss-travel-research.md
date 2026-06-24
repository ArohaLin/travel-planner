---
title: 開源旅遊規劃專案技術調研（10 選）
date: 2026-06-24
category: 技術調研
summary: 從 GitHub 挑出 10 個與我們架構相近的開源旅遊規劃 web app，逐一拆解技術棧/功能/授權，並綜整「值得借鏡的技術」排序與我們的雙向落差。porting 一律等確認再做。
---

# 開源旅遊規劃專案技術調研（10 選）

> 目的：找出值得我們（Next.js 14 + TS + Supabase + Tailwind + Anthropic/Gemini + 即時協作 + PWA + Google Maps）借鏡的技術。
> 取捨：**偏「架構相近、程式可借鏡」**（非純高星），技術棧範圍放寬到「任何 JS/TS 全棧 web app」，另放 2-3 個高星標竿。
> ⚠️ **本報告只研究與建議；任何「搬進專案」一律等確認後另開工。**

## 一、研究方法與一個關鍵發現

用 `gh` CLI 直接打 GitHub API 撈 ~50 候選 → 過濾 → 多因子評分（星數＋近半年活躍＋與我們技術棧契合＋是不是真產品）→ 選 10。

**關鍵發現：高星 ≠ 跟我們相近。** 純按星數排，前段幾乎都不可用：
- 路網**演算法引擎/函式庫**：OpenTripPlanner（2.6k★）、navitia、amadeus SDK、flights 爬蟲
- **原生 App**：Travel-Mate（1.3k★ Android）、KDE/itinerary（桌面）
- **連結清單**：awesome-travel、Major-project-list
- **AI agent demo/notebook**：一票 CrewAI/LangGraph/Streamlit

真正「跟我們同類的 web app」多落在中星段（50–300★）；唯一高星又同類的標竿是 **TREK（5.9k★）**。另外，搜「collaborative trip planner」幾乎全是 0★ 學生作業 → **印證「AI 生成＋即時協作」的成熟開源旅遊規劃非常稀有，我們的定位有護城河。**

## 二、10 個專案總表

| # | 專案 | 星 | 技術棧 | 授權 | 定位一句話 | 對我們最大價值 |
|---|---|---|---|---|---|---|
| 1 | **TREK** | 5.9k | React+NestJS+SQLite+原生WS | **AGPL**⚠️ | 自架全功能旅遊 PWA，即時協作 | 離線變動佇列、MCP 整合層 |
| 2 | **AdventureLog** | 3.3k | SvelteKit+Django+**PostGIS** | **GPL**⚠️ | 自架旅遊記錄+規劃 | PostGIS、iCal、OSM 免費推薦 |
| 3 | **itskovacs/trip** | 1.7k | Angular+FastAPI+SQLite | MIT✅ | POI 地圖追蹤+行程 | **地圖 provider 抽象＋OSRM 免費路線** |
| 4 | **travel-planner-ai (rutugo)** | 252 | **Next.js+Convex+Clerk+OpenAI** | 無⚠️ | AI 一句話生成行程 SaaS | **function-calling schema＋分批漸進生成** |
| 5 | **surmai** | 266 | React+**PocketBase(Go)** | MIT✅ | 個人/家庭旅遊憑證整理 | **Email→AI→自動入庫、結構化 AI 輸出** |
| 6 | **Migo 旅行領航** | 215 | Claude/Codex **Skill** | MIT✅ | Claude 生成單檔離線 HTML 行程 | **出發前提醒倒推引擎、單檔離線匯出** |
| 7 | **Journey-Jolt** | 80 | React+Firebase+Gemini | MIT✅ | AI 行程生成（已停運） | 真實道路 polyline、FieldMask 省費 |
| 8 | **tripsage-ai** | 38 | Next.js16+**AI SDK v6+pgvector** | MIT✅ | 多代理 AI 規劃（架構樣板） | **router→子代理、預算 grounding、RAG** |
| 9 | **EasyTrip** | 60 | Next.js+FastAPI+LangServe | 無⚠️ | 黑客松冠軍 AI 行程 | 生成期 POI grounding、cron 天氣推播 |
| 10 | **travel-guidebook** | 66 | Claude **Skill**+Playwright | MIT✅ | AI 生成列印級旅遊手冊 PDF | **PDF 匯出、純排版設計系統、可行性門控** |

> 授權說明：**MIT/Apache=程式可參考改用**；**GPL/AGPL=強傳染（copyleft），只可學概念、自行重寫、嚴禁抄碼**（我們是 Vercel 網路服務，AGPL 風險尤高）；**無授權=保留全部著作權，法律上不可複製碼**。

## 三、逐專案重點

### 1. TREK（5.9k★, AGPL ⚠️只可學概念）
功能與我們最重疊的標竿：即時協作、互動地圖（3D Mapbox+Leaflet）、PWA 真離線、預算分帳、打包清單、旅遊日誌、PDF 匯出、WebAuthn/MFA、20 語系。**本身無 LLM**，改架 MCP server（150+ tools）讓外部 AI 操作行程。
- **最該學**：① 離線變動佇列（Dexie 樂觀寫＋`X-Idempotency-Key` 冪等重放）→ 正對我們「背景回前景 stale」痛點；② MCP 整合層（讓使用者用自己的 Claude 操作行程，省我們 API 費）；③ OSM+Open-Meteo 零付費地圖/天氣 fallback。
- **落差**：他們強在離線/功能廣度/測試完整；我們強在**內建 LLM 生成＋雲端託管＋在地策展**（他完全沒有生成式 AI）。

### 2. AdventureLog（3.3k★, GPL ⚠️只可學概念）
SvelteKit 前端 + Django REST 後端 + **PostGIS** + 內建全球國家/城市資料集。偏「事後記錄打卡＋世界地圖統計」，與我們互補。
- **最該學**：① **Supabase 開 PostGIS**（我們本來就能開）把「附近搜尋/總里程」做精準，省掉前端 Haversine 概估；② **iCal/.ics 匯出**（一鍵加入手機日曆，低成本高體感）；③ allauth 的 OIDC SSO/TOTP；④ OSM/Overpass 免費推薦候選源。
- **落差**：他強在地理能力/認證成熟度/事後記錄；我們強在 AI 生成/即時協作/分享體驗/行動端。

### 3. itskovacs/trip（1.7k★, MIT ✅可抄碼）
極簡 POI 地圖追蹤 + 行程規劃。**最值得抄碼的一個**。
- **最該學**：① **地圖 provider 抽象層**（`BaseMapProvider`，OSM/Google 各實作 search/route/details + types→分類 mapper）→ 讓免費 OSM 當預設、Google 變進階；② **OSRM 免費真實路線 + polyline 解碼**（補我們 travelLegs 精度、免 Google Directions 費）；③ 孤兒檔清理 hook、MCP 工具化行程操作。
- **落差**：它手動排程無 AI；我們有 AI＋即時協作。**地圖 provider 抽象＋OSRM 是本報告最高 CP 的可抄碼項。**

### 4. travel-planner-ai / rutugo（252★, 無授權 ⚠️只可學概念）
**技術棧最貼近我們**（Next.js + Convex + Clerk + OpenAI），已商業化。
- **最該學**：① **OpenAI function-calling + JSON Schema 鎖結構**（不靠 prompt 叮嚀）→ 我們可改用 Gemini `responseSchema`/Claude tool-use 降低 parse 失敗；② **分批 + 漸進式填充**（三段並行打 AI、即時 DB 讓 UI 一塊塊亮）→ 解我們「等整份生成 110 秒空白」的體感痛點；③ 費用追蹤 schema（對應我們待辦「費用加總」）。
- **Convex 即時 vs 我們 Supabase Realtime**：Convex query 天生訂閱、從根本免疫 stale；我們得手動修 `visibilitychange`。只可學概念（換 DB 不現實），但啟發是把協作同步做更徹底的訂閱化。
- **落差**：他即時體驗/AI 穩定度/費用追蹤強；我們多模型策略/權限模型/真實資料治理/還原快照強。

### 5. surmai（266★, MIT ✅可抄碼）
React + PocketBase(Go+SQLite)。家庭旅遊「憑證整理器」，AI 只用來解析信、不生成行程。
- **最該學**：① **Email→AI→自動配對 trip 的匯入管線**（IMAP 掃信→AI 一次分類抽取→用日期區間自動歸到對的行程）→ 我們完全沒有，輕量版「貼上確認信/截圖→AI 抽成行程項」就很有價值；② **泛型結構化 AI 輸出**（型別→JSON Schema→強制結構化）→ 換掉我們 `patchParser` 的正則 tag 解析；③ ICS 匯出、費用分帳、非註冊旅伴 `traveller_profiles`（更貼家庭情境）。
- **落差**：他強在 Email 匯入/離線/費用分帳/自架；我們強在 AI 生成/即時協作/推薦策展/分享。

### 6. Migo 旅行領航（215★, MIT ✅可抄碼）
Claude/Codex **Skill**：一句話 → 單檔、可離線、手機優先的 HTML 行程。**理念與我們最像。**
- **最該學**：① **出發前提醒倒推引擎**（純函式：用 UTC 從出發日減 leadDays 算「X 號前要訂」＋一張經驗 leadDays 表：國內機票30/國際45/高鐵15/熱門景點7…）→ 正好強化我們剛做的待辦「出發前倒數提醒」；② **單檔離線匯出範式**（資料＋引擎 inline、Leaflet+OSM 免 key、Wikimedia 圖片＋curl 驗 200）→ 我們宣傳冊可加「匯出可離線單檔 HTML」新形態；③ `page-contract.md` 內容契約把資料結構與設計解耦（穩定生成、less 幻覺）。
- **落差**：他是一次性靜態產物，無帳號/協作/持久化；我們是真產品，量級遠勝。

### 7. Journey-Jolt（80★, MIT ✅可抄碼，但已停運）
React+Firebase+Gemini。README 自承因 Google API 費用「暫時停運」——**反向佐證我們的成本架構是對的**。
- **最該學**：① **真實道路 polyline 路線圖**（Routes API `encodedPolyline` → `@mapbox/polyline` 解碼 → `<Polyline>`）→ 把我們地圖的「景點間直線」升級成沿路彎曲真實路線；② **Places `X-Goog-FieldMask` 省費**→ 值得逐欄位核對我們的 FieldMask 有無夾帶貴欄位；③ few-shot 範例對話當 generate 格式保險。
- **落差**：壓倒性領先（它金鑰寫死前端、Firestore 全開、無協作）。價值是「對照組＋少數技巧」。

### 8. tripsage-ai（38★, MIT ✅可抄碼，但偏架構樣板無 demo）
Next.js 16 + Vercel AI SDK v6 + pgvector。單人高度工程化的**多代理架構天花板樣板**。
- **最該學**：① **router 分類 → 專責子代理**（輕量 router 用結構化輸出+低溫分類，再交對應 agent）→ 我們 adjust/consult/generate 已是雛形，可演進；② **預算最佳化 = LLM 分配 + 真實資料 grounding + 強制 schema**（不是數值最佳化器）→ 直接對應我們待辦「費用加總」，schema 可抄；③ **Hybrid RAG（pgvector + rerank）**取代「整包行程塞 prompt」→ 資料變大時省 token 又準；④ 工具層 cache/rateLimit/repair guardrail、`schemaVersion` 版本化輸出。
- **落差**：他 AI 架構先進但**沒落地成產品**（連 demo 都沒有）；我們是真產品但 AI 仍單次生成。

### 9. EasyTrip（60★, 無授權 ⚠️只可學概念）
黑客松冠軍，已停更。「agentic」名實不符（其實是 Next.js 控制器手動編排的 tool-augmented chain）。
- **最該學**：① **生成期 grounding**（LLM 抽參數→程式用 Serper 查真實飯店/餐廳清單→強制 AI 只能選清單內）→ 比我們「事後補座標」更從源頭防幻覺；② **node-cron 天氣主動推播**（對應我們待辦「推播通知」「天氣查詢」）；③ dnd-kit 拖拉（我們已做 ✓）。
- **安全警訊**：它把真實金鑰連 `.env` 提交進 repo——提醒我們持續確認 `.env*` 在 .gitignore（我們的已是）。

### 10. travel-guidebook（66★, MIT ✅可抄碼）
Claude **Skill**：生成 30+ 頁、羊皮紙風、列印級旅遊手冊 **PDF**。**直接對應我們的宣傳冊。**
- **最該學**：① **列印級 PDF 匯出**（Playwright `page.pdf()`，腳本極短可直接用）→ 我們宣傳冊只有線上長捲頁、**缺可下載/可傳 LINE 的 PDF**；⚠️坑：`loading="lazy"` 圖片在列印模式不載入（我們正好用了 lazy），導 PDF 要改 eager；② **「排版即設計」CSS 系統**（功能色：交通青/美食琥珀/住宿橄欖/警示赭 + 純 CSS/SVG 裝飾）→ 補我們「照片抓不到時版面空」的純排版備援；③ 列印分頁控制（`break-inside:avoid`/`@page`）；④ **行程可行性門控**（單日里程/跨城隔離/海拔規則）→ 補我們「這天排得下嗎」的 sanity-check。
- **落差**：他強在離線交付物/純排版美學/文學溫度；我們強在真實 Google 照片地圖/極省成本/多人協作線上產品化。

## 四、綜合：值得我們深入研究的技術（借鏡排序）

依「價值 × 工程量 × 授權安全」排。**★=建議優先**。

### A. 快速見效（低工程量、高價值、授權安全）
| 技術 | 來源 | 對應我們落點 | 授權 |
|---|---|---|---|
| ★ **iCal/.ics「加入日曆」匯出** | AdventureLog, surmai | 行程頁/宣傳冊加按鈕，產 .ics 字串即可 | 概念（易自寫）|
| ★ **出發前提醒 leadDays 倒推表** | Migo | 強化剛做的待辦「出發前倒數」自動算訂票截止 | MIT 可抄 |
| ★ **AI 生成改用 responseSchema 鎖結構** | rutugo, surmai, tripsage | 取代 `patchParser` 正則 tag，降 parse 失敗 | 概念 |
| **Places FieldMask 省費稽核** | Journey-Jolt | 核對 `lib/maps/places.ts` 有無夾帶貴欄位 | 概念（即查）|

### B. 中等投入（高價值）
| 技術 | 來源 | 對應我們落點 | 授權 |
|---|---|---|---|
| ★ **生成期真實 POI grounding** | EasyTrip, Journey-Jolt, tripsage | generate 時先給 AI 真實景點清單、限定只能選 → 從源頭防幻覺座標 | 概念 |
| ★ **費用/預算追蹤＋分帳** | rutugo, surmai, tripsage | 對應待辦「費用加總」；surmai/tripsage 有 MIT schema 藍本 | MIT 可抄 |
| ★ **宣傳冊 PDF 匯出** | travel-guidebook | `/api/share/[token]/pdf`，Playwright 印 PDF（注意 lazy 圖坑）| MIT 可抄 |
| **地圖 provider 抽象＋OSRM 免費路線** | itskovacs/trip | 免費 OSM 當預設/備援、真實道路 polyline 升級地圖 | MIT 可抄 |
| **行程可行性門控（sanity-check）** | travel-guidebook | AI 生成/調整後檢查「單日里程/跨城亂跳」是否合理 | 概念 |
| **天氣（出發前＋主動推播）** | EasyTrip, rutugo | Vercel Cron + 免費天氣 API；對應待辦 | 概念 |

### C. 較大投入（策略級，先研究再評估）
| 技術 | 來源 | 對應我們落點 | 授權 |
|---|---|---|---|
| **離線變動佇列（PWA 真離線）** | TREK | Dexie 樂觀寫＋冪等重放，根治背景回前景 stale | 概念（AGPL）|
| **分批＋漸進式生成體感** | rutugo | 拆段並行打 AI、用 Realtime 推分段結果，免 110 秒空白 | 概念 |
| **router→子代理 AI 架構＋pgvector RAG** | tripsage | 從單次生成演進；資料變大用 RAG 取代整包塞 prompt | MIT 可參考 |
| **Email/截圖→AI→自動入庫** | surmai | 貼確認信/截圖一鍵抽成行程項 | 概念 |
| **MCP server（讓使用者用自己的 Claude）** | TREK, itskovacs/trip | 策略：繞開我們付 API 費，讓外部 AI 操作行程 | 概念 |

## 五、雙向落差分析

### 我們已領先（護城河，別做白工）
- **內建 LLM 生成行程 + 3 方案調整 + 咨詢模式 + 長期記憶**：10 個裡只有 4 個有生成式 AI，且多是「單次吐 JSON」，無對話式調整/方案比較。
- **即時協作 + Presence**：唯一真正能比的是 TREK；多數是傳統 CRUD 邀請。
- **真實資料治理**：精選推薦（貝氏校正＋灌水判讀）＋真實 Google 評論研究入庫——無人做到這層策展把關。
- **對外宣傳冊分享 + 零付費 API 成本控制**（photoRef CDN 快取、token 門禁 proxy）——Journey-Jolt 正因沒做這些而燒到停運。
- **行程還原/快照**、**多模型策略（含免費本地 Ollama）**、**權限模型（global_role + RLS）**、**iPhone 16 Pro PWA 深度優化**。

### 我們落後（值得補）
- **離線能力**（多數只有 PWA 外殼，TREK/surmai 有真離線）
- **結構化 AI 輸出穩健度**（多數用 schema 強制，我們用正則 tag）
- **費用/預算/分帳**（rutugo/surmai/tripsage/EasyTrip 都有，我們無）
- **iCal 匯出、天氣、PDF 交付物、Email 匯入、可行性門控**（各家零星具備，我們無）
- **免費地圖 fallback**（半數用 OSM/OSRM/Leaflet，我們綁 Google）
- **AI 架構成熟度**（tripsage 的 router/RAG/guardrail，我們仍單次生成）

## 六、結語

- **最高 CP 起手式**（低工程、安全授權、立即有感）：**iCal 匯出**、**leadDays 倒推強化待辦**、**AI 生成上 responseSchema**、**FieldMask 省費稽核**。
- **中期最值得**：**費用追蹤**（多個 MIT 藍本＋對應既有待辦）、**宣傳冊 PDF**（MIT 腳本可直接用）、**生成期 POI grounding**（從源頭防幻覺）。
- **可抄碼的安全來源**：itskovacs/trip、surmai、tripsage、Migo、travel-guidebook（皆 MIT）。**只可學概念**：TREK(AGPL)、AdventureLog(GPL)、rutugo/EasyTrip(無授權)。
- 下一步：你從上面挑想做的，我再針對該項出**詳細實作計畫**（含對我們現有檔案的具體改法），確認後才動工。
