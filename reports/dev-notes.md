---
title: 開發筆記
date: 2026-06-24
category: 開發筆記
summary: 記錄討論中有價值的改善想法、未來目標、實驗與結果、設計決策。只記「未來/想法/實驗/決策」，bug 修正走 issue-log，不重工。需要時才翻看與更新。
---

# 開發筆記

> **用途**：記錄有價值的改善想法、未來目標、做過的實驗與結果、重要設計決策。
> **界線（不重工）**：bug 的「症狀→根因→修法」一律進 `issue-log`，**不寫這裡**；本檔只管「打算做什麼、試過什麼、為何這樣決定」。現況架構/功能看 `CLAUDE.md`。
> **維護**：需要時才翻看與更新（規劃下一步前先翻；冒出想法/實驗結果就記）。狀態：`待評估 / 規劃中 / 進行中 / 已做 / 擱置`。

---

## A. 改善 Backlog／未來目標

> 來源 OSS 調研詳見報告 `reports/oss-travel-research.md`（含每項對應我們哪個檔案）。授權：MIT＝程式可參考改用；概念＝只可學自行重寫（GPL/AGPL/無授權）。

### A-1 快速見效（低工程、高價值、授權安全）
| 項目 | 來源 | 價值/工程 | 授權 | 狀態 |
|---|---|---|---|---|
| 加入日曆（iCal/.ics 匯出，行程頁/宣傳冊一鍵加進手機日曆） | AdventureLog, surmai | 高/低 | 概念易自寫 | 待評估 |
| 出發前提醒 leadDays 倒推表（強化既有待辦「出發前倒數」，自動算訂票截止日） | Migo | 中/低 | MIT 可抄 | 待評估 |
| AI 生成改用 responseSchema 鎖結構（取代 `patchParser` 正則 tag，降 parse 失敗） | rutugo, surmai, tripsage | 高/中 | 概念 | **生成＋調整 L1 已上線**；L2 已 spike →**不採用**（見實驗紀錄）|
| Places `X-Goog-FieldMask` 省費稽核（核對 `lib/maps/places.ts` 有無夾帶貴欄位） | Journey-Jolt | 中/低 | 概念（即查）| 待評估 |

### A-2 中等投入（高價值）
| 項目 | 來源 | 價值/工程 | 授權 | 狀態 |
|---|---|---|---|---|
| 費用/預算追蹤＋分帳（對應舊待辦「費用加總」） | rutugo, surmai, tripsage | 高/中 | MIT 藍本 | 待評估 |
| 宣傳冊 PDF 匯出（`/api/share/[token]/pdf`，Playwright 印；⚠️ lazy 圖要改 eager） | travel-guidebook | 中/中 | MIT 腳本可用 | 待評估 |
| 生成期真實 POI grounding（先給 AI 真實景點清單、限定只能選 → 從源頭防幻覺座標） | EasyTrip, Journey-Jolt, tripsage | 高/中 | 概念 | 待評估 |
| 地圖 provider 抽象＋OSRM 免費路線（OSM 當預設/備援、真實道路 polyline） | itskovacs/trip | 中/中 | MIT 可抄 | 待評估 |
| 行程可行性門控（AI 生成/調整後檢查「單日里程/跨城亂跳」是否合理） | travel-guidebook | 中/中 | 概念 | 待評估 |
| 天氣（出發前＋主動推播，Vercel Cron + 免費天氣 API） | EasyTrip, rutugo | 中/中 | 概念 | 待評估 |

### A-3 策略級（先研究再評估）
| 項目 | 來源 | 價值/工程 | 授權 | 狀態 |
|---|---|---|---|---|
| 離線變動佇列（Dexie 樂觀寫＋冪等重放，根治背景回前景 stale） | TREK | 高/高 | 概念（AGPL）| 待評估 |
| 分批＋漸進式生成體感（拆段並行打 AI、Realtime 推分段，免 110 秒空白） | rutugo | 中/中-高 | 概念 | 待評估 |
| router→子代理＋pgvector RAG（從單次生成演進；大資料用 RAG 取代整包塞 prompt） | tripsage | 中/高 | MIT 參考 | 待評估 |
| Email/截圖→AI→自動入庫（貼確認信/截圖一鍵抽成行程項） | surmai | 中/高 | 概念 | **Phase 1 已上線**（AI 小幫手，見實驗紀錄）|
| MCP server（讓使用者用自己的 Claude 操作行程，省我們 API 費） | TREK, itskovacs/trip | 高/高 | 概念 | 待評估 |

---

## B. 想法暫存／待評估
> 還沒排序、還沒進 Backlog 的點子。

- 推播通知：協作者修改行程時通知其他成員（CLAUDE.md 舊待辦；可與「天氣主動推播」共用 Cron 基建）。
- 自動化測試覆蓋（Playwright E2E）：多個調研專案都有、我們目前無；協作/生成等關鍵流程值得補。
- ActivityCard 顯示 Google Maps 縮圖（CLAUDE.md 舊待辦）。

---

## C. 實驗紀錄
> 試了什麼 → 結果 → 結論/決定。（純 bug 修正不放這，走 issue-log。）

- **2026-06-24｜OSS 競品技術調研**：用 `gh` API 撈 GitHub 旅遊規劃 web app、挑 10 個架構相近的逐一深挖。
  - 結果：高星 ≠ 跟我們相近（前段全是引擎/函式庫/清單/原生 App）；真正同類多在中星段，唯一高星同類標竿是 TREK。
  - 結論：我們在「AI 生成＋即時協作＋真實資料策展＋宣傳冊分享＋成本控制」已領先多數開源 → 借鏡以「補洞」為主。完整報告：`reports/oss-travel-research.md`，借鏡項目已填入上方 Backlog。

---

- **2026-06-24｜AI 生成改 JSON 模式（責結構化 L1，先做「生成」）**：
  - 背景：`patchParser.ts`（258 行正則＋括號深度＋截斷修復）脆弱；分兩層 L1（`responseMimeType:json` 保證合法 JSON）/ L2（responseSchema 強約束結構）。先攻最低風險的「生成」。
  - 做法：生成的 Gemini 呼叫加 `responseMimeType:'application/json'`；prompt 拿掉 `<itinerary>` 標籤指示改「直接輸出 JSON 物件」；`extractItinerary` 加 `JSON.parse` 直解快路徑（保留舊標籤/裸 JSON 後備給 claude -p）。
  - 實測（真實 Gemini＋我們 prompt＋parser）：Flash 過載→自動備援 Pro（90s），輸出**純 JSON、無標籤、無 code fence**，extractItinerary 直接解析成功（花蓮 3 日、活動 8/10/8、zod 通過）。
  - 結論：L1 對「生成」零 UX 退化、可靠度上升、洗掉標籤抽取 hack。⚠️ L1/L2 都修不了「截斷」（另案）。
- **2026-06-24｜AI 調整(adjust) 也改 JSON 模式（L1，步驟②）**：
  - 範圍修正：原計畫「整天替換簡化 schema」**取消**——那是 L2 才需要；L1 下 schema 複雜不影響（JSON 模式只保證合法 JSON、結構照樣 zod 驗），且整天替換會讓小修改輸出變大、更易截斷。
  - 做法：`buildAdjustPromptGemini` 改輸出「單一 JSON 物件 `{message, plans, memory}`」（拿掉 `<plans>`/`<memory>` 標籤）；chat route 的 gemini-adjust 加 `responseMimeType:json`、**不即時串流**（JSON 不能當散文顯示，前端改顯示既有的「處理中」彈跳點＋可離開 App 橫幅）；新增 `parseAdjustJson`，**失敗自動退回舊 `extractPlans`（安全網）**。memory 改從 JSON 的 memory 欄位取（取代 `<memory>` 標籤）。
  - 串流取捨：adjust 放棄即時散文預覽，換穩定（之後想要可再做「部分 JSON 串流」）。
  - 實測（真實 Gemini＋台東行程＋新 prompt＋parseAdjustJson）：Pro 過載→備援 Flash（35s），輸出純 JSON、無標籤無 fence，parseAdjustJson 成功（message＋1 方案＋patch ops update_day、zod 通過＋memory 乾淨無「已調整N處」雜訊）。
  - ✅ 前端體感已**實機確認**（2026-06-24）：送出→「處理中」動畫（彈跳點＋可離開 App 橫幅）→方案卡正常出現可套用→聊天泡泡顯示說明文字，皆正常。非 gemini（claude/minimax）adjust 路徑維持舊格式不動。
- **2026-06-24｜L2 responseSchema spike（結論：不採用，保留 L1）**：
  - 動機：用 Gemini `responseSchema` 強約束結構，想再降 parse 失敗。寫了 shippable 的 Zod→Gemini schema 轉換器（`zod-to-json-schema` openApi3 target ＋ 清理層：合併 `allOf`、`oneOf→anyOf`、剝不支援關鍵字、去空 enum）。
  - **確認可行的**：① `anyOf` 可繞過 SDK 型別（型別未列、要 `as any`）送達 API、Gemini 正確回傳 discriminated 物件 ② 轉換器離線輸出乾淨（無 `$ref`/`pattern`/`additionalProperties`）③ 生成 schema（陣列無長度約束）可被接受、zod 偶爾過。
  - **致命負面結果（多輪真實 Gemini 實測）**：
    - **生成**：schema 模式下 Gemini 偏「最小滿足結構」→ 3 天行程**一律只生 1 天**；想用 `days.minItems` 強制天數 → **Gemini responseSchema 不接受 `minItems`/`maxItems`（400）**；輸出又變冗長 → 撞 **MAX_TOKENS 截斷 → 不可 parse**（L1 同行程不會）；連 zod 都不保證過。
    - **調整**：union schema 被 **400「invalid argument」**拒（拿掉 minItems 仍 400，還有別的不支援構造、錯誤訊息籠統難 debug）。
  - **結論**：L1 已給「合法 JSON ＋ 完整豐富（生成 8/10/8）＋ 過 zod（調整乾淨）」。L2 反而**降完整度、不保證 zod、易截斷、調整被拒**，且想取代的後驗證仍得留 → **CP 值為負，不採用**。已移除 `zod-to-json-schema` 套件。真正 #1 風險「截斷」L1/L2 都不解（另案）。
  - **🔑 未來若再評估免重踩的事實**：Gemini responseSchema **不支援 `minItems`/`maxItems`、自訂 regex/`pattern`**；`anyOf` 可用但 SDK 型別未列；schema 模式會讓模型**偏最小輸出＋更冗長易截斷**，不適合「深、欄位多、要完整多天」的大結構。

---

- **2026-06-25｜AI 小幫手（多模態匯入）Phase 1 上線**：把照片／網址／文字丟給 AI → 抽取資訊 → 判斷新增 or 更新既有卡＋落在哪天 → 出 patch 方案（沿用方案卡→確認→歷程快照）；不確定就給候選或說明缺什麼。
  - 架構：ChatSheet 第三模式「小幫手」（對話串獨立 thread mode=assistant）；後端獨立路由 `/api/ai/assistant`（非串流、Gemini 多模態 Flash→Pro 備援、JSON `{message,plans,candidates}`）；`buildAssistantPrompt`＋`parseAssistantJson`；網址抓取 `lib/ai/fetchUrl`、圖片壓縮 `lib/utils/image`。
  - **關鍵驗證（spike）**：「Gemini vision」不是新模型——現有 Flash/Pro 本身多模態。合成訂房截圖→Flash（42s）正確 OCR＋對到第5天既有住宿→`set_day_accommodation`（reservationStatus=reserved＋實際房價＋訂單號），parseAssistantJson 通過。**核心假設成立**。
  - 取捨：對話歷史不存圖檔本體（只存文字標記），保隱私省空間；照片上傳前 client 端壓縮（≤1280px、JPEG 0.72）控 payload。
  - **Phase 2（已上線 2026-06-25）**：卡片詳情「用資料更新這張卡」→ 開小幫手並鎖定該卡（lockedActivityId/dayIndex→prompt 🔒 段），AI 只改該卡；ChatSheet 顯示鎖定橫幅、切模式自動清鎖。
  - **Phase 3（已上線 2026-06-25）**：使用者照片設為卡片照。新增公開 Storage bucket `card-photos`、Activity 加 `userPhotoUrl`（卡片/詳情優先於 Google photoRef）；卡片詳情選圖→壓縮→上傳（路徑 `{id}/{activityId}.jpg` upsert）→update_activity patch。詳見專案 CLAUDE.md。
  - **未做**：小幫手上傳的店家照自動設成卡片照；更強動態網頁抓取。前端聊天 UI 需登入、本機無法預覽 → 靠實機驗證。

- **2026-06-26｜效能體檢＋第一波改善（全部實測，非推測）**：使用者反映「到處轉圈圈幾秒」。先做體檢（curl 正式站＋直連 Supabase 量查詢＋讀程式碼定位），再一次做掉五項。
  - **量測證據**：① 冷啟動：`/login` 第一次 TTFB **1.42s**、熱 0.13s；`/api/weather` 冷 7.4s（含它自己歷年同期現算 ~6s，非純冷啟動）。② 單支 Supabase 查詢 **140–170ms**（從台灣量）。③ 精選推薦查詢最重（撈全部 rec＋全部 rating≥4 住宿再 JS 合併，熱 220–326ms）。腳本 `scripts/perf-probe.mjs`。
  - **三大根因**：A 冷啟動（無 `vercel.json`→function 在**美東 iad1**，Supabase 在**新加坡 ap-southeast-1**，使用者在台灣→每查詢跨太平洋來回；且無 keep-warm）。B 每請求 **2 次 `auth.getUser()`**（`middleware.ts` 一次＋頁面/route 各一次，都是向 Auth 伺服器網路驗證、序列關卡）。C 客戶端**零快取**：探索/願望/住宿評價都 `useEffect` 內 raw fetch、tabs 條件渲染→切走卸載切回重新掛載→重抓。
  - **做了什麼**：
    1. **客戶端快取**（根因 C）：`lib/cache/clientCache.ts`（module-level Map，元件卸載也存活）。ExploreSheet（recs/wishlist）＋LodgingTab（items）改 stale-while-revalidate——掛載時先讀快取立即顯示（不轉圈）、背景 revalidate 覆蓋。切 tab/重開＝瞬間。
    2. **getClaims**（根因 B）：`middleware.ts` 與熱讀路徑（dashboard、itinerary 頁/layout、recommendations、wishlist、lodging、places/search、place/hours）改 `lib/auth/user.ts` 的 `getAuthUser()`＝`getClaims()` 本地驗章（ES256 非對稱、`crypto.subtle.verify`，JWKS 每 warm 實例抓一次快取、之後 0 網路）。**敏感/管理/寫入路由（admin、profile、bug、push、ai、各 mutation）刻意保留 `getUser()`** 即時伺服器驗證——分層設計。
    3. **區域**（根因 A）：`vercel.json` `regions:["sin1"]`（新加坡），與 Supabase 同區→function↔DB 從跨太平洋砍到同區個位數 ms，也離台灣使用者更近。**單項最大改善。**
    4. **keep-warm**（根因 A）：Hobby 方案 Vercel Cron 只能一天一次→改 **GitHub Actions** `*/10` ping `/api/health`＋`/login`（repo 公開→Actions 分鐘無限）。新增 `app/api/health`（無 auth/DB）並放行 middleware。補強性質、覆蓋有限。
    5. **splash 文字**：`gen-splash.mjs` 「連線中…」→「啟動中…」（那是 iOS 靜態啟動圖烤死的字，非真連線狀態，原字會誤導成卡在連線）。
  - **驗證的關鍵取捨／事實**：① `getClaims()` 內部走 `getSession()`→**過期 token 會用 refresh token 自動刷新**（`GoTrueClient.js` `_useSession`），故不會每小時把人登出；middleware 先跑先刷新、寫回 cookie，Server Component 端看到的已是新 token。② 安全取捨：getClaims 只驗「簽章有效＋未過期」，帳號停用最長一個 token 效期（~1hr）空窗——對無金流、管理員建帳號的 App 可接受。③ helper／middleware 都包 try/catch：壞 token 當未登入（導去登入）而非 500。④ 本機只能煙霧測未登入路徑（`/login` 200、無錯）＋型別；authed 路徑靠原始碼驗證＋部署後實機確認，故 getClaims 獨立 commit 便於單獨回退。
  - **預估幅度**：每個登入操作省 ~280ms（兩次 getUser→本地）；切 tab/重開探索願望從「幾百ms~幾秒」→瞬間；區域讓每查詢往返大降；冷啟動由 keep-warm 補強。
  - **scenario (2) 返回行程列表載入中**：本波（getClaims＋區域）會明顯改善 RSC 伺服器渲染時間；若仍有感，下一步看 Next Router Cache／prefetch（未做，留待實機回饋）。

- **2026-06-27｜美食地圖（探索面板入口 A）MVP**：把既有美食推薦（`category='美食'`）做成地圖檢視，疊行程脈絡，串既有願望／排入流程。先畫 mockup 給使用者確認四個決策（脈絡疊圖可開關／點 marker→彈卡→再點進詳情／依子類 icon／排進某天選天+時段）再實作。
  - **建置前查證（非推測）**：美食 94 筆（台東＋嘉義）**全部已有座標＋照片**（94/94）→ 免即時補座標（原 task 取消）。但 **`sub_category` 全 null** → icon 改靠「**店名**」比對（`lib/explore/foodIcons.ts`），命中不錯、其餘通用 🍴（要更準日後在 `travel-rec-build` 補子類）。marker 另用實心/空心區分 featured/longlist（tier 明確有）。
  - **架構決策**：`FoodMap` 自寫 @vis.gl `<Map>`（**不重用 `ItineraryMap`**——它的 `<Map>` children 封閉、無法塞外部 marker 層）；行程脈絡層用**直線連點**（只是「順不順路」參考，不精算開車路線）；APIProvider 已由 `ItineraryClient` 包住探索面板 → FoodMap 內可直接 `useMap`/`<Map>`，免自包。
  - **複用**：`placement.suggestSlots`（選天時段建議）、`/api/place/hours`（營業判斷，抽 `lib/explore/hours.ts` 共用）、`/api/photo`（照片）、wishlist 既有 POST + `onAddToDay`（地圖排入先確保入願望再排：`addRecToDay`）。**後端零新增**。
  - 新檔：`lib/explore/foodIcons.ts`、`lib/explore/hours.ts`、`components/explore/FoodMap.tsx`、`components/explore/RecDetailModal.tsx`；改 `ExploreSheet.tsx`（美食分類加 清單⇄地圖 toggle）。
  - **狀態**：型別＋build 過；authed 地圖互動待正式站手機實測。**未做**：行程脈絡單天篩選、入口 B（行程地圖美食圖層）。

## D. 設計決策／原則
> 程式碼看不出來、但日後該記得的「為何這樣決定」。

- **借鏡原則**：先確認「我們是不是已領先」再決定要不要做；別把已是護城河的東西重做。授權紅線：MIT 可抄碼；AGPL/GPL/無授權只可學概念、自行重寫，不可貼原始碼（我們是 Vercel 網路服務，AGPL 風險尤高）。
- **主行程表視覺＝「簡潔風時間軸」（2026-06-24 改版）**：使用者嫌原版「工程感」。出 3 風格 mockup（雜誌/手帳/簡潔）讓使用者選 → 定 **C 簡潔風**。版型＝「時間欄（起/迄）｜時間軸節點｜內容」三欄；每點顯示 起–迄時間＋**停留膠囊**＋分類色點，移動列加**距離**（開車12分・8km），偏緊才上色。節點依類型上色。**關鍵取捨：編輯/刪除/AI備註從每張卡上移除 → 收進「點卡片→詳情視窗」底部動作列**（列表乾淨、代價是改卡多一步，使用者已同意）。實作：`cardTone.ts`（類型色調＋km/停留格式）、`DayView` 擁有時間軸＋`RowFrame`、`ActivityCard` 改輸出 `ActivityContent`。本機用臨時 `/uitest` 公開路由＋mock 資料預覽驗證（驗完即刪、middleware 還原）——**這是驗證需登入頁面 UI 的可重用手法**。其他既有風格（簡表手帳風、宣傳冊雜誌風）不動。

## E. 行程連動／座標／猜測——系統性重構規劃（2026-06-28，待逐階段執行）

> 起因：使用者點出「系統把簡單的事複雜化、一直挖東補西」。三輪唯讀檢視（連動、座標、猜測）後的整合規劃。
> **病根一句話：沒有單一可信的真相欄位，就只能事後『同步』或當下『猜』。**
> 本節只記方向與步驟；逐階段做、各自可上線可驗收。規劃前先讀本節與 issue-log 3-A~3-H、4-A、7。

### E-0 病灶總覽（已查證，非推測）
1. **被動失效**：新增/編輯/刪除/排序都不主動更新路段資料（`travelLegs`/`travelSig`），全靠背景 `RoutePrefetcher` 事後比對指紋重算（`reschedule.ts` 註解明言「只動活動，travelLegs 靠 RoutePrefetcher」）→ 編輯後到重算完成之間顯示舊數字。
2. **路段只用「終點 id」當鍵**（`legByTo: toId→leg`），沒綁「從哪來」→ 刪/換前一站後，這段仍對得到、但數字是從舊前一站算的（＝刪節點後 11:30 移動列用被刪節點估算）。
3. **同一資訊存多份**：地名（`title`/`placeLabel`/交通卡 `toLabel`/`fromLabel`）、座標（`location`，四條 geocode 管線）、距離時間（`travelLegs`）。漏同步就殘留/空/錯。
4. **座標來源混雜**：名稱 geocode（同名誤抓：都歷↔綠島）／`place_id`（精確）／港口內建／`{0,0}` 歸零重定位，四種混用、無「優先最準」策略；四條補齊管線各自過濾（rest 跳過等要四處同步）；三態（null/{0,0}/有效）判斷散落。
5. **到處用「猜」（缺結構化標記）**：標題關鍵字猜（複合交通 `isCompositeTransport`、交通方式 `isNonDriving`/`modeInfo`、餐別 `bucketMeals`）、type 猜（`rest` 跳 geocode→綠島事件；`bookingRequired` 反推預訂狀態）、寫死閾值（步行<5分≤1km、80m/分、緩衝路程一半夾5~15分、無座標 30km/h）、fallback 充當（缺 `placeLabel` 用 `title` 當地名→「前往 衝浪」、缺 `endTime` 用類型預設）。

### E-1 核心原則（架構方向）
- **原則一　結構即時推導**：移動列「哪兩點、起點名、終點名」一律即時讀相鄰卡片（終點名已做，3-G）。廢交通卡存的 `toLabel`/`fromLabel`/「前往X」`title`（只留複合用途特殊 title）。
- **原則二　過期要誠實**：用 `travelLegs` 前先比對「當前序列指紋＝＝存的 `travelSig`」；不符就退**直線概估＋標「概估」**，絕不顯示對不上的舊精確值。
- **原則三　主動失效**：patch 套用時，某天序列或座標一變就清該天 `travelSig`（標過期）→ 立即退概估＋背景重算，不靠背景猜時機。
- **原則四　座標單一真相、優先 place_id（地基）**：地點盡量綁 `google_place_id`（搜尋選取時取得），座標由 place_id 取得（精確、無同名、可重取），名稱 geocode 降為最後 fallback；四條 geocode 管線收斂成一個「座標補齊服務」（單一入口＋單一過濾規則）；三態收斂、廢 `{0,0}` 魔術值。
- **原則五　明確標記取代猜測**：補語意欄位（主要由 AI 生成/搜尋選取時自動帶，使用者通常不用填），消掉字串/type/閾值猜。**補欄位是為了讓系統不再猜、介面反而更單純，不是叫使用者多填。**

### E-2 要補的結構化欄位（消哪些猜）
- 交通卡：`transportKind`（self-drive/ferry/train/flight/bus/walk）消 `modeInfo`+`isNonDriving` 關鍵字猜；`isComposite`（複合用途）消 `isCompositeTransport` 兩處關鍵字；綁港口 id 消 `KNOWN_PORTS` 名比對。
- 活動：`hasPlace`（是否實體地點）取代「`rest` 猜要不要座標」（綠島事件根治）；綁 `googlePlaceId` 消名稱 geocode 誤抓；`mealSlot`（早午晚）消餐別時間猜。
- 行程：自駕風格／步行速度＝設定＋合理預設，取代寫死閾值（次要）。

### E-3 分階段執行（建議順序，各自可上線可驗收）
**階段 0｜止血：主動失效＋過期誠實（原則二、三）** — 最小、低風險、解眼前痛
- `patchApplier`：套用後若某天 activities 序列或任一座標有變 → 清該天 `travelSig`（標過期）。
- `DayView`：算當前序列指紋，與 `day.travelSig` 不符 → 該天 `travelLegs` 視為過期 → 移動列退「直線概估・概估中」，不用舊精確值。
- 驗收：刪/編輯/排序某節點後，相鄰移動列**立即**變概估（不再顯示被刪節點舊數字），稍候/開地圖背景重算回精確。
- 風險：低（顯示層＋一個失效點）。

**階段 1｜座標地基（原則四）** — 中風險，仔細測同名/離島/港口
- 活動加 `googlePlaceId`；「換地點」搜尋選取時一併存（`AddressAutocomplete` 已能回座標，擴充回傳 place_id）。
- 收斂單一服務 `resolveCoords`：優先 place_id→Places Details 取座標；無才帶城市 geocode；rest/transport 過濾只在這裡。四處（`activityPhotos`/`MapView`/`RoutePrefetcher`/`buildDayPoints`）改呼叫它。
- 三態收斂：座標只用「有效／null（待定位）」，廢 `{0,0}`；統一 `hasCoords`。
- 驗收：同名點（都歷/綠島）不再誤抓；換地點時間距離正確；四條管線過濾一致。
- 風險：中（座標核心，issue-log 1-A/4-A 雷區，需回歸）。

**階段 2｜明確標記取代猜測（原則一、五）** — 中風險，動資料模型＋AI prompt＋多元件
- 型別加 `transportKind`/`isComposite`（交通卡）、`hasPlace`/`mealSlot`（活動）。
- AI 生成 prompt（`systemPrompt`）同步輸出這些欄位；舊資料用現有關鍵字邏輯**一次性回填**（腳本）。
- `DayView`/`summaryRows`/`bufferScan`/`reschedule` 改讀明確欄位、移除關鍵字猜；廢 `toLabel`/`fromLabel`/「前往X」title（即時組）。
- 驗收：複合交通、交通方式、餐別、是否抓座標都讀欄位、不再靠標題；地名永不殘留/空。
- 風險：中（schema＋prompt＋回填＋多元件）。

**階段 3｜閾值可調（原則五延伸）** — 低風險低優先，可緩
- 行程設定加自駕風格/步行速度，buffer/路程估改讀設定（預設同現值）。三處 effSec 同源（issue-log 7）。

### E-4 取捨／注意
- **補欄位 ≠ 介面更複雜**：欄位主要由 AI 生成/搜尋自動帶，使用者通常不碰；目的是讓系統不再猜、介面更單純。
- 每階段獨立 commit/部署/實機驗收；**階段 0 先做**（解眼前），1→2 根治，3 可緩。
- 動座標（階段 1）務必回歸 issue-log 1-A/1-B/1-D/4-A（綠島同名、港口、rest 座標、過期 travelLegs）。
- 已先行修掉的相關項：移動列名稱即時（3-G）、換地點搜尋帶座標（#31）、偏緊改算到目的地開始（3-H）——這些是階段 0/1/2 的局部前置，全面版仍照本規劃做。

### E-5 欄位稽核結果（回應「找多餘／可合併」）——2026-06-28 已實際盤點
> 讀遍資料模型 × 全 repo 寫/讀處。分「可刪／可併／待補完（別誤刪）／衍生保留」。

**可刪（多餘，低風險）**
- `Activity.tags`：寫 0 讀 1（AI 不填、表單無欄位）→ 刪。
- ~~`TravelLeg.midLat/midLng`~~ → **不可刪（盤點誤判）**：grep 確認 `route.ts:320-321` toPersistLegs 寫入、`ItineraryMap` 讀作距離標籤位置。**教訓：盤點「可刪」動手前必自己 grep 驗證。**
- `TripMetadata.returnCity`：AI 不生成、語意含糊（多數＝出發城市）→ 刪，或改成更有用的 `returnDate`。

**可併（語意重疊）**
- `Activity.bookingRequired` ＋ `reservationStatus` → **統一成三態 `reservationStatus`**（none/needed/reserved，與住宿一致），舊資料一次性轉譯。消掉「布林＋三態」雙軌誤用。
- 交通卡 `fromLabel`／`toLabel` → **刪 `fromLabel`**（起點即時由時間軸前一卡推導）；`toLabel` 降為後備（即時讀下一卡優先，3-G 已起步）。根治 3-D 類殘留。
- （低優先、需配合 UI）活動說明文字 `intro`/`description`/`recommendation`/`tips`/`highlight` 五者重疊 → 先定「卡片層用 highlight、詳情層用 intro、其餘整併」的 UI，再動 schema。

**待補完（不是多餘，別誤刪）**：`prepStartTime`（整理時間，定義未接 UI）、`memberProfiles`（AI 會讀、表單沒讓填）、`Activity.notes`/`Accommodation.notes`（表單缺欄位）、`TravelLeg.polyline`（應實作「算完路線存回」供宣傳冊重用，目前定義了沒存）。

**衍生欄位（正確、保留）**：`travelLegs`/`travelSig`/`routePolyline`（地圖狀態追蹤）。

→ 欄位增刪一律歸 **階段 2**、且每個「可刪」動手前必 grep 驗證（`midLat/midLng` 已證實不可刪）。**P0 不刪任何欄位**，純做失效＋概估。

### E-6 地點資訊單一真相結果（回應「座標/地址/地名/縣市統一同步」）——2026-06-28 已實際盤點
**現況散落（同一地點、多處各自存、易不同步）**

| 資訊 | 活動/住宿 | 天 | 行程 | 推薦/住宿研究表（對照組） |
|---|---|---|---|---|
| 座標 | `location.lat/lng`（會漂移） | — | — | `lat/lng` |
| 地址 | `location.address` | — | — | `address` |
| **place_id** | **❌ 無** | — | — | ✅ `google_place_id` |
| 縣市 | — | `city`（常陳舊→`deriveDayCity` 每次反推） | `destination/originCity/returnCity` | `region`/`city` |
| 地名 | `title`／`placeLabel` | — | — | `name` |

**最大落差**：**行程活動完全沒有 `google_place_id`** → 座標只能靠名稱 geocode（會漂移、同名誤抓），也無法跟 Google Places 長期關聯。推薦表與住宿研究表早就用 place_id（穩定鍵、即時補事實、合 Google 條款）——**活動層級要對齊這個模型**。

**目標：地點單一真相**
- 一個地點存 **`google_place_id` ＋使用者自訂顯示名**；**座標／地址／縣市都由 place_id 衍生**（即時或快取），不各自存副本 → 改一處、全部同步、所有地方都讀同一真相。
- **必須保留**（place_id 不涵蓋）：`location.address`（查不到 place 的自由輸入）、`title`（活動名）、`placeLabel`（顯示簡稱）、`userPhotoUrl`、AI 文案。

**改造點（寫/讀）**
- 活動型別加 `googlePlaceId`；「換地點」搜尋選取時一併存（`AddressAutocomplete` 已能回座標，#31 起步，再擴回 place_id）。
- 地圖 geocode 補座標時**順手反查 place_id**，讓既有資料補上。
- `deriveDayCity`／`dayCoords`（天氣）／移動列／地圖：改由 place_id 衍生座標與縣市（取代各自反推）。
- AI 生成：找得到時盡量輸出 place_id。

→ 歸 **階段 1（座標地基擴大為「地點地基」）**；與推薦/住宿表共用同一套 place_id 解析。

### E-7 執行優先序（2026-06-28 使用者確認：P0→P1→P2 連續做、不中途確認、每階段做好驗證）
- **P0 止血**（低風險）：patch 對「序列/座標變」的天主動清 `travelSig`；`DayView` 移動列偵測過期（`travelSig` 空）→ 退**直線概估・概估中**、不顯示錯數字；順手刪確定多餘的 `TravelLeg.midLat/midLng`。
- **P1 地點地基**（中）：活動加 `googlePlaceId`；座標補齊收斂單一服務（優先 place_id→geocode fallback）、四管線改呼叫；geocode 反查 place_id；三態收斂廢 `{0,0}`；deriveCity/天氣/移動列改單一真相；地點必填策略（該有地點強制補、無地點標 `hasPlace` 透明跳過）。
- **P2 明確標記＋欄位稽核**（中）：交通卡 `transportKind`/`isComposite`、活動 `hasPlace`/`mealSlot`；AI prompt 同步＋舊資料回填；廢 `toLabel`/`fromLabel`/「前往X」title（即時組）；`bookingRequired`→`reservationStatus` 三態；刪 `tags`、`returnCity`。
- **驗證限制**：authed 行程頁本機無法預覽 → 以「單元測試覆蓋核心邏輯＋tsc/build＋部署後煙霧測」為主；authed UI 互動標為使用者實機確認點（不阻塞後續階段）。每階段獨立 commit/部署。**P3 不在本次。**
