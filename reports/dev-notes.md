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
| AI 生成改用 responseSchema 鎖結構（取代 `patchParser` 正則 tag，降 parse 失敗） | rutugo, surmai, tripsage | 高/中 | 概念 | **生成＋調整 L1 已上線**（L2 responseSchema 暫不做）|
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
| Email/截圖→AI→自動入庫（貼確認信/截圖一鍵抽成行程項） | surmai | 中/高 | 概念 | 待評估 |
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

---

## D. 設計決策／原則
> 程式碼看不出來、但日後該記得的「為何這樣決定」。

- **借鏡原則**：先確認「我們是不是已領先」再決定要不要做；別把已是護城河的東西重做。授權紅線：MIT 可抄碼；AGPL/GPL/無授權只可學概念、自行重寫，不可貼原始碼（我們是 Vercel 網路服務，AGPL 風險尤高）。
