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
  - **未做（Phase 2/3）**：單卡鎖定「用資料更新這張卡」、使用者照片設為卡片照、更強網頁抓取（動態頁）。前端聊天 UI 需登入、本機無法預覽 → 靠實機驗證。

## D. 設計決策／原則
> 程式碼看不出來、但日後該記得的「為何這樣決定」。

- **借鏡原則**：先確認「我們是不是已領先」再決定要不要做；別把已是護城河的東西重做。授權紅線：MIT 可抄碼；AGPL/GPL/無授權只可學概念、自行重寫，不可貼原始碼（我們是 Vercel 網路服務，AGPL 風險尤高）。
- **主行程表視覺＝「簡潔風時間軸」（2026-06-24 改版）**：使用者嫌原版「工程感」。出 3 風格 mockup（雜誌/手帳/簡潔）讓使用者選 → 定 **C 簡潔風**。版型＝「時間欄（起/迄）｜時間軸節點｜內容」三欄；每點顯示 起–迄時間＋**停留膠囊**＋分類色點，移動列加**距離**（開車12分・8km），偏緊才上色。節點依類型上色。**關鍵取捨：編輯/刪除/AI備註從每張卡上移除 → 收進「點卡片→詳情視窗」底部動作列**（列表乾淨、代價是改卡多一步，使用者已同意）。實作：`cardTone.ts`（類型色調＋km/停留格式）、`DayView` 擁有時間軸＋`RowFrame`、`ActivityCard` 改輸出 `ActivityContent`。本機用臨時 `/uitest` 公開路由＋mock 資料預覽驗證（驗完即刪、middleware 還原）——**這是驗證需登入頁面 UI 的可重用手法**。其他既有風格（簡表手帳風、宣傳冊雜誌風）不動。
