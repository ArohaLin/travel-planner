# 旅遊規劃 App — Claude Code 交接文件

> 路徑：`/Users/aroha/travel-planner`
> 語言：所有回覆、commit 訊息、UI 文字一律使用**繁體中文**
> 最後更新：2026-06-13
> GitHub：https://github.com/ArohaLin/travel-planner
> 正式網址：https://travel-planner-delta-blond.vercel.app

---

## 專案概覽

iPhone 16 Pro Safari 優化的旅遊規劃 PWA，功能包含：
- AI 生成 + 修改行程（Anthropic Claude API）
- 多人即時協作（Supabase Realtime）
- 管理員帳號系統（無自助註冊）
- 問題回報 + 追蹤系統（管理員專用）

**技術棧：** Next.js 14 (App Router) + TypeScript + Supabase + Tailwind CSS + Anthropic SDK

---

## 快速啟動

```bash
cd /Users/aroha/travel-planner
npm run dev        # 開發伺服器 http://localhost:3000
```

環境變數在 `.env.local`（已設定，不要動）：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ANTHROPIC_KEY`        ← 注意：不是 ANTHROPIC_API_KEY
- `NVIDIA_API_KEY`           ← 備用 AI 模型（MiniMax，UI 已不再提供，程式保留）
- `OLLAMA_API_KEY`           ← 本地 AI（自架 Ollama，OpenAI 相容端點 api.alala.uk）；已設於 Vercel Production
- `INVITE_JWT_SECRET`
- `NEXT_PUBLIC_APP_URL`

以上環境變數均已同步設定至 Vercel Production 環境。

---

## 目前完成狀態

### ✅ Phase 1（基礎功能 — 全部完成）
- 登入 / 登出（無自助註冊，管理員建立帳號）
- Dashboard：我的行程列表
- 建立行程精靈（4 步驟）→ AI 生成完整行程
- 行程頁：DayTabs + ActivityCard + AccommodationCard
- AI 聊天（ChatSheet）：行程調整模式 + 咨詢服務模式
- 多人協作：Realtime 即時同步 + Presence 頭像
- 修改歷程頁面
- 成員管理 + 邀請連結

### ✅ Phase 2（帳號系統 + AI 重構 — 全部完成）

**帳號系統：**
- `profiles.global_role` 欄位（admin / regular / guest）
- 管理員才能建立 / 編輯 / 刪除帳號
- `/profile` 頁面：個人資料 + 管理員帳號管理 UI
- 批次指派行程存取（每個使用者可設定哪些行程 + 角色）

**AI 重構：**
- 行程調整模式：AI 輸出 3 個方案 → 使用者選擇 → 套用（不再自動套用）
- 咨詢服務模式：AI 只提供文字建議，不輸出任何 patch
- `PlanSelector.tsx`：3 方案卡 + 補充說明重新生成功能

**問題回報系統：**
- 任何登入使用者可回報問題（`/api/bug-reports` POST）
- 管理員專用 BugReportSheet（`components/ui/BugReportSheet.tsx`）
- 功能：列表 / 篩選 / 狀態更新 / 指派處理人 / 刪除（含確認對話框）
- 篩選列：水平捲動（不換行），確保 iPhone 16 Pro 不跳到第二列
- Sheet 高度：`height: calc(96dvh - env(safe-area-inset-top))`，與回報問題頁面等高

### ✅ PWA / Icon
- `public/apple-touch-icon.png`（180px）
- `public/icon-192.png`、`public/icon-512.png`
- `public/manifest.json`（standalone 模式）
- Icon 設計（v4，2026-06-13 起）：使用者提供的手繪蠟筆風圖（白紙底 + 地球 + 飛機 + 行李箱），已去白邊裁成全出血正方形
- 重新產生 icon：`node scripts/generate-icon-v4.mjs`（來源圖：scripts/icon-source-v4.png，手繪風地球+飛機+行李箱）

### ✅ 地圖功能（Google Maps）
- 套件：`@vis.gl/react-google-maps`，需環境變數 `NEXT_PUBLIC_GOOGLE_MAPS_KEY`（已在 .env.local，**也已設定於 Vercel Production**）
- 行程頁 `行程 / 地圖` Toggle 切換（`ItineraryClient.tsx`）
- 預設顯示目前選中那天，頂部天數 chips 可複選看多天
- 每個景點數字 marker（①②③…）依行程順序，連接路線折線（含方向箭頭）；住宿為「宿」方形 marker
- 多天模式不同天用不同顏色（DAY_COLORS）
- 座標策略：開地圖時前端用 Maps JS Geocoder 查座標 → 存回 DB 的 `location` 欄位（`/api/itinerary/[id]/geo`），下次開啟即時顯示
- 相關檔案：`components/map/MapView.tsx`、`components/map/ItineraryMap.tsx`、`lib/maps/geocode.ts`
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` 已設定於 Vercel Production；Google Cloud 已啟用 **Maps JavaScript API / Places API / Maps Static API**（後兩者為宣傳冊功能所需）

### ✅ 宣傳冊檢視（對外唯讀分享，2026-06-13）
旅行社 DM 風格的對外行程手冊：任何人有連結即可瀏覽（免登入、不能修改）。
- **入口**：行程頁 header 的 📄 按鈕（限建立者/管理者）→ 產生／複製連結／重新整理內容／換連結／關閉。元件 `components/brochure/BrochureShareButton.tsx`。
- **公開頁**：`/share/[token]`（server component，`middleware.ts` 已放行 `/share`、`/api/share`）。雜誌長捲頁 `components/brochure/BrochureView.tsx`：封面 → 旅程總覽（風格標籤＋總覽路線圖＋每日大綱）→ 逐日章節（路線圖＋每景點照片＋介紹）→ 結尾。**依需求不顯示任何金額**，亦不顯示 notes／預約連結／成員個資。
- **零付費 API 重點**：產生宣傳冊時抓一次照片 reference＋座標，快取進 `itineraries.brochure_cache`（JSONB，與 AI 用的 `data` 分開）；公開訪客只讀快取。照片／地圖一律經自家 proxy（`/api/share/[token]/photo`、`/map`）出圖，Google 金鑰永不出現在公開 HTML，並設 CDN 快取（`s-maxage`）保護成本。
- **資料**：`itineraries` 加 `public_share`(bool) / `share_token`(unique) / `brochure_cache`(jsonb)，migration `supabase/migration_brochure.sql`（已執行）。
- **產生 API**：`/api/itinerary/[id]/share`（owner 限定）GET 狀態、POST `{action: enable|disable|regenerate}`。座標優先沿用景點既有 `location`，Places 查到的當 fallback；查無照片/地圖一律回優雅 SVG 佔位（版面不破）。
- **server 工具**：`lib/maps/places.ts`（`findPlace` 一次拿照片+座標、`staticMapUrl`、`placePhotoUrl`、`placeholderSvg`）；server 金鑰用 `GOOGLE_MAPS_SERVER_KEY ?? NEXT_PUBLIC_GOOGLE_MAPS_KEY`（實測此金鑰 server 端無 referer 也可呼叫 Places/Static Maps）。型別 `lib/types/brochure.ts`。
- ⚠️ 公開頁靠 token 當門禁、用 service role 讀取（繞過 RLS），故不需新增 RLS policy。關閉分享（`public_share=false`）即時讓頁面與所有 proxy 失效。

### ✅ 景點照片 + 宣傳冊 DM 改版（2026-06-13）
- **景點照片（photoRef）**：`Activity`/`Accommodation` 加 `photoRef` 欄位（背景抓 Google Places 代表照、快取進行程 data）。
  - 生成行程後 `runAfterResponse` 背景抓圖（不卡卡片產生）；舊行程在行程頁載入時自動補抓一次（`POST /api/itinerary/[id]/photos`，只補缺的）。共用 `lib/maps/activityPhotos.ts` 的 `fetchAndStoreActivityPhotos`。
  - 景點卡「點進去」詳情視窗（`ActivityDetailModal`）頂部顯示 hero 大圖，走登入版 proxy `GET /api/itinerary/[id]/photo?activityId=`（驗權後串流）。
  - `forPrompt()` 也濾掉 `photoRef`（與 travelLegs 同）。
- **宣傳冊重用照片**：產生宣傳冊時先 `fetchAndStoreActivityPhotos` 補齊，再以 `activity.photoRef` 建快取（已抓過不再打 Places）。
- **DM 風格改版**（參考旅行社範本）：封面加 AI 英文副標＋亮點標語；旅程總覽加 AI 特色簡介＋賣點清單；新增「行程特色」頁（精選景點/特色美食/推薦住宿，從現有資料策展＋照片）；新增「距離參考」（座標 Haversine 概估，每日＋全程公里）；每日章節加「早午晚宿摘要列」＋景點 2 欄排版（桌機 2 欄、手機 1 欄）。
  - AI 文案：`lib/ai/brochureCopy.ts` 的 `generateBrochureCopy()`（支援 LOCAL_AI、失敗回退預設），結果存 `brochure_cache.copy`；距離存 `brochure_cache.dayKm/totalKm`。
  - 公開頁無瀏覽器外殼，加浮動返回鈕 `components/brochure/BrochureBackButton.tsx`（原生 history.back + 即時回饋 + 防連按）。
  - 改進版（2026-06-13）：距離參考改用 `travelLegs`（實際開車距離，無 geocode 鋸齒；無則 haversine 淨位移）；總覽＋每日加「純文字行程簡表」；特色去重（同名只一次）並改大圖精選；每日改「簡表＋時間軸（小縮圖）」與特色做出差異化；公開頁覆寫 viewport 開放雙指縮放；圖片 `loading="lazy"`。

---

## 專案結構（重點檔案）

```
travel-planner/
├── app/
│   ├── layout.tsx                    # Root layout，含 PWA icon metadata
│   ├── (auth)/login/page.tsx         # 登入頁（無 register，已移除）
│   ├── dashboard/
│   │   ├── layout.tsx                # Bottom nav + auth guard
│   │   └── page.tsx                  # 我的行程列表
│   ├── itinerary/
│   │   ├── new/page.tsx              # 建立行程精靈
│   │   └── [id]/
│   │       ├── layout.tsx
│   │       ├── page.tsx              # 主行程頁
│   │       ├── members/page.tsx
│   │       └── history/page.tsx
│   ├── profile/
│   │   ├── page.tsx                  # 個人資料 + 管理員帳號管理
│   │   ├── ProfileClient.tsx
│   │   └── layout.tsx
│   └── api/
│       ├── admin/users/
│       │   ├── route.ts              # GET（列所有使用者）POST（建立帳號）
│       │   └── [userId]/
│       │       ├── route.ts          # PATCH（更新）DELETE（刪除）
│       │       └── itineraries/route.ts  # 批次指派行程存取
│       ├── ai/
│       │   ├── generate/route.ts     # 初次生成完整行程
│       │   └── chat/route.ts         # Streaming 對話（adjust / consult 模式）
│       ├── bug-reports/
│       │   ├── route.ts              # GET（列表）POST（新增）
│       │   └── [id]/route.ts         # PATCH（更新狀態）DELETE（刪除）
│       ├── chat-message/[id]/route.ts
│       └── itinerary/
│           ├── route.ts
│           └── [id]/
│               ├── route.ts
│               ├── patch/route.ts    # 套用 AI patch
│               └── members/route.ts
│
├── components/
│   ├── ui/
│   │   └── BugReportSheet.tsx       # 問題追蹤抽屜（管理員）
│   ├── ai/
│   │   ├── ChatSheet.tsx            # AI 聊天抽屜 + 模式切換 toggle
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   └── PlanSelector.tsx         # 3 方案選擇卡
│   ├── itinerary/
│   │   ├── ItineraryHeader.tsx
│   │   ├── DayTabs.tsx
│   │   ├── DayView.tsx
│   │   ├── ActivityCard.tsx
│   │   └── AccommodationCard.tsx
│   └── collaboration/
│       ├── PresenceAvatars.tsx
│       └── MemberList.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   └── server.ts                # createServerClient + createServiceRoleClient
│   ├── ai/
│   │   ├── client.ts
│   │   ├── systemPrompt.ts          # buildAdjustPrompt / buildConsultPrompt / buildGeneratePrompt
│   │   ├── patchParser.ts           # extractPlans / stripPlansTag / extractPatch
│   │   └── patchApplier.ts
│   ├── types/
│   │   ├── itinerary.ts
│   │   ├── patch.ts                 # PatchOp / ItineraryPatch / AIPlan / AIPlanResponse
│   │   ├── collaboration.ts         # GlobalRole / Profile / MemberRole
│   │   └── bugReport.ts
│   └── hooks/
│       ├── useItinerary.ts
│       ├── useChat.ts               # chatMode state + lastPlans state
│       ├── usePresence.ts
│       └── useModelPreference.ts
│
├── supabase/
│   ├── schema.sql                   # 完整 DB schema
│   ├── migration_phase2.sql         # global_role + helper function
│   └── migration_bug_reports.sql    # bug_reports table
│
├── scripts/
│   └── generate-icon-v4.mjs        # 產生 PWA icon（執行：node scripts/generate-icon-v4.mjs）
│
├── middleware.ts                    # Auth guard（/register 已移除）
└── public/
    ├── manifest.json
    ├── apple-touch-icon.png
    ├── icon-192.png
    ├── icon-512.png
    └── favicon.ico
```

---

## 資料庫 Schema 重點

### profiles
```sql
id UUID, display_name TEXT, avatar_url TEXT,
global_role TEXT CHECK (IN 'admin','regular','guest') DEFAULT 'regular',
created_at TIMESTAMPTZ
```

### bug_reports
```sql
id UUID, bug_number SERIAL,
title TEXT, description TEXT, category TEXT,
status TEXT (open/in_progress/resolved/closed),
priority TEXT (low/medium/high/critical),
reporter_id UUID → profiles, assignee_id UUID → profiles,
resolution TEXT, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

### 主要 RLS 規則
- `itineraries` SELECT → 必須在 `itinerary_members` 中
- `itineraries` UPDATE → role IN ('owner','editor')
- `bug_reports` → reporter 可新增，admin (service_role) 可 CRUD
- admin 操作用 `createServiceRoleClient()`，繞過 RLS

---

## AI 系統設計

### 模型策略（2026-06-13）
| 情境 | 可用模型 |
|---|---|
| 建立行程（generate） | **只用 Gemini**（wizard 已移除選擇器、固定送 gemini） |
| 行程調整（adjust） | **只用 Gemini**（ChatSheet 模型列只剩 Gemini，切到調整自動鎖 gemini） |
| 咨詢服務（consult） | **Gemini ＋ 本地 AI**（使用者可切換） |

- **本地 AI** = 自架 Ollama（OpenAI 相容端點 `https://api.alala.uk/v1`，模型 `gemma4:12b`，串流）。`lib/ai/client.ts` 的 `getOllamaClient()`，provider 值為 `'local'`，定價 0。chat route 的 `local` 分支放在 `isLocalAI()`（claude -p 開發覆寫）**之前** → 明確選本地 AI 一律走 Ollama。需家中電腦＋Ollama 開機，否則 502。
- Claude / MiniMax 的 UI 選項已移除（後端程式保留，未使用）。`useModelPreference` 只接受 `gemini` / `local`，預設 `gemini`。

### 兩種模式
| | 行程調整模式 | 咨詢服務模式 |
|---|---|---|
| 系統提示詞 | `buildAdjustPrompt()` | `buildConsultPrompt()` |
| AI 輸出 | `<plans>[...]</plans>` JSON（1–3方案） | 純文字建議 |
| Patch 套用 | 使用者選擇後才套用 | 絕不套用 |
| UI | PlanSelector 卡片 | 一般聊天泡泡 |

### Chat Route 餵給 AI 的 input
1. System prompt（含完整行程 JSON 在 `<current_itinerary>` 標籤；本地 AI 咨詢改用精簡摘要 `buildConsultPromptLocal`）
2. 最近聊天記錄：`HISTORY_LIMIT = 30` 則，再依模型字元預算 `MAX_HISTORY_CHARS` 從新往舊裁切（Gemini 30,000、本地 AI 4,000）
3. 使用者當次輸入

> 對話保留設計：訊息永久存 `chat_messages`、依「行程×模式」分對話串。
> 視窗顯示上限 30 則 / 20,000 字（`useChat`）；AI 實際參考 30 則 + 上述字元預算（兩者對齊）。
> `aiMemory` 為長期記憶，不受則數限制、每次都帶。

### Patch 格式
```typescript
interface ItineraryPatch {
  patchId: string
  description: string   // 繁體中文摘要
  ops: PatchOp[]
  proposedBy: 'ai' | 'user'
}
```

---

## iPhone 16 Pro Safari 注意事項

- 所有高度用 `dvh`（dynamic viewport height），不用 `vh`
- 底部避開 Home Indicator：`padding-bottom: env(safe-area-inset-bottom)`
- `input` / `textarea` 最小 `font-size: 16px`（防 Safari 自動縮放）
- 最小點擊目標：`min-height: 44px; min-width: 44px`
- ChatSheet 和 BugReportSheet：`height: calc(96dvh - env(safe-area-inset-top))`
- BugReportSheet 篩選列：`overflow-x: auto` + `flex-shrink-0`（禁止換行）

---

## 權限設計（多人模式：一層權限）

**模型**：全域角色（global_role）決定「能做什麼」，行程成員（itinerary_members）只決定「看得到什麼」。`itinerary_members.role` 僅保留 `owner` 當「建立者」標記，editor/viewer 不再決定能力。

| global_role | 可見的行程 | 修改 + AI | 選人/管理成員 | 刪除行程 | 建立行程 | 管理帳號 |
|---|---|---|---|---|---|---|
| admin | **全部（自動）** | ✅ | ✅（任何行程） | ✅ | ✅ | ✅ |
| regular | 被勾選的＋自己建立的 | ✅ | 只有自己建立的 | 只有自己建立的 | ✅ | ❌ |
| guest | 被勾選的 | ❌（唯讀、無 AI） | ❌ | ❌ | ❌ | ❌ |

**核心實作**：
- `lib/auth/access.ts` 的 `getItineraryAccess(db, itineraryId, userId)` 為唯一權限判斷入口，回傳 `{ visible, canEdit, effectiveRole, isAdmin }`。所有 API/頁面統一走它。
- `effectiveRole` 換算後餵給既有 UI 權限函式（canEdit/canChat…）：建立者或 admin → `owner`；regular 成員 → `editor`；guest 成員 → `viewer`。
- DB 端 RLS：`supabase/migration_multiuser.sql`，含 `is_admin()` / `can_edit_itinerary()`，所有表都有管理者通道。
- **行程內選人**：成員管理頁列出所有帳號 + 勾選開關（勾＝可見）；建立者/管理者固定可見不可取消。`PUT /api/itinerary/[id]/members { userId, visible }`。
- 邀請連結 UI 已移除（後端 token 加入流程仍保留相容）。
- ⚠️ `itinerary_members` 同時有 `user_id` 與 `invited_by` 兩個 FK 指向 profiles，PostgREST join 須指明 `profiles!itinerary_members_user_id_fkey`。

---

## 待辦 / 已知問題

目前**無明確待辦**，Phase 1 + Phase 2 均已完成。

若要繼續開發，參考方向：
1. ~~**行程分享連結**：允許未登入使用者以唯讀方式預覽行程~~ ✅ 已完成（見上方「宣傳冊檢視」）
2. **推播通知**：協作者修改時通知其他成員
3. **地圖整合**：在 ActivityCard 顯示 Google Maps 縮圖
4. **AI 補強**：行程費用自動加總、當地天氣查詢
5. **測試覆蓋**：目前無自動化測試，可補 Playwright E2E

---

## 常用指令

```bash
# 開發
npm run dev

# 重新產生 PWA icon
node scripts/generate-icon-v4.mjs

# 部署（git push 即自動觸發 Vercel 重新 build）
git add .
git commit -m "修改說明"
git push    # → Vercel 自動偵測 main branch push 並重新部署

# Supabase schema 更新（需在 Supabase Dashboard SQL Editor 手動執行）
# supabase/migration_phase2.sql
# supabase/migration_bug_reports.sql
```

## 本機 AI 測試模式（免費，不走 API）

本機測試時可用 Claude Code 訂閱制取代付費 AI API：
- `.env.local` 設 `LOCAL_AI=1` → `/api/ai/chat` 與 `/api/ai/generate` 改用 `claude -p`（子程序）生成，不呼叫 Claude/Gemini/MiniMax API、不計費
- Vercel **未設** `LOCAL_AI` → 自動走原本 API（已確認 production 無此變數）
- 實作：`lib/ai/localClaude.ts`（`spawn('claude', ['-p','--tools','','--system-prompt', systemPrompt])`，cwd=/tmp）
- 注意事項：
  - **不可加 `--bare`**：bare 模式只接受 ANTHROPIC_API_KEY，無法用訂閱制 OAuth 認證
  - `claude -p` 為非串流，生成完整 JSON 較慢（chat/generate 約 110–120 秒），本機測試可接受
  - 部署到 Vercel 前無需改任何程式碼（靠環境變數自動切換）；`.env.local` 已在 .gitignore 不會外洩

## 部署工作流程（CLI 已可用，Claude 可自動執行）

**重要：`gh` 與 `vercel` CLI 皆已登入可用（vercel 帳號 `arohalin`，專案 `travel-planner`）。**
使用者要求「部署」時，Claude 可直接執行以下流程，**無需請使用者手動操作**：

1. **部署前檢查**
   - `git branch --show-current` 確認在 `main`（若不在，先切換或建分支）
   - 若這次有新增 `NEXT_PUBLIC_*` 環境變數 → 先確認 Vercel 已設定：
     `vercel env ls production | grep <KEY>`（沒有才用 `printf '值' | vercel env add <KEY> production` 加入；勿重複加，重複用 `vercel env rm <KEY> production --yes` 清掉）
2. **commit + push**
   - `git add <相關檔案>`（勿 `git add .`，以免帶入雜物）
   - commit（訊息用繁體中文，結尾加 `Co-Authored-By: Claude ...`）
   - `git push origin main` → 觸發 Vercel 自動部署
3. **觸發/確認生產部署**
   - 若只改環境變數沒改程式碼，需 `git commit --allow-empty` 或 `vercel --prod --yes` 觸發重建
   - `vercel ls travel-planner` 查最新部署狀態為 `● Ready`
4. **部署後驗證**
   - `curl -s -o /dev/null -w "%{http_code}" https://travel-planner-delta-blond.vercel.app/login`（預期 200）
   - 若有改到 `NEXT_PUBLIC_*` → 確認已編譯進前端：
     `curl -s "https://travel-planner-delta-blond.vercel.app/login" | grep -o "<值前綴>"`

> 正式網址：https://travel-planner-delta-blond.vercel.app
> 注意：`.vercel/` 已在 `.gitignore`，勿提交。

## 安全性紀錄

| 日期 | 修正項目 |
|------|---------|
| 2026-05-24 | `INVITE_JWT_SECRET` 移除 fallback 預設值，缺少時直接拋錯 |
| 2026-05-24 | `middleware.ts` matcher 移除 `api/` 排除，涵蓋所有路由 |
| 2026-05-24 | `.claude/` 本機設定資料夾加入 `.gitignore` |
| 2026-06-13 | git remote URL 內嵌的 PAT（`ghp_…`）移除，改乾淨 URL + `gh` 認證推送；舊 token 已請使用者於 GitHub 撤銷 |
| 2026-06-13 | `ollama-api-key.txt` / `OLLAMA_*.md` / `*.pdf` 加入 `.gitignore`，避免金鑰與內部文件入庫 |
