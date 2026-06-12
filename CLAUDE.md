# 旅遊規劃 App — Claude Code 交接文件

> 路徑：`/Users/aroha/travel-planner`
> 語言：所有回覆、commit 訊息、UI 文字一律使用**繁體中文**
> 最後更新：2026-05-24
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
- `NVIDIA_API_KEY`           ← 備用 AI 模型（MiniMax）
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
- 套件：`@vis.gl/react-google-maps`，需環境變數 `NEXT_PUBLIC_GOOGLE_MAPS_KEY`（已在 .env.local，**尚未加到 Vercel**）
- 行程頁 `行程 / 地圖` Toggle 切換（`ItineraryClient.tsx`）
- 預設顯示目前選中那天，頂部天數 chips 可複選看多天
- 每個景點數字 marker（①②③…）依行程順序，連接路線折線（含方向箭頭）；住宿為「宿」方形 marker
- 多天模式不同天用不同顏色（DAY_COLORS）
- 座標策略：開地圖時前端用 Maps JS Geocoder 查座標 → 存回 DB 的 `location` 欄位（`/api/itinerary/[id]/geo`），下次開啟即時顯示
- 相關檔案：`components/map/MapView.tsx`、`components/map/ItineraryMap.tsx`、`lib/maps/geocode.ts`
- ⚠️ 部署前必須在 Vercel Production 環境新增 `NEXT_PUBLIC_GOOGLE_MAPS_KEY`，否則地圖不顯示

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

### 兩種模式
| | 行程調整模式 | 咨詢服務模式 |
|---|---|---|
| 系統提示詞 | `buildAdjustPrompt()` | `buildConsultPrompt()` |
| AI 輸出 | `<plans>[...]</plans>` JSON（1–3方案） | 純文字建議 |
| Patch 套用 | 使用者選擇後才套用 | 絕不套用 |
| UI | PlanSelector 卡片 | 一般聊天泡泡 |

### Chat Route 餵給 AI 的 input
1. System prompt（含完整行程 JSON 在 `<current_itinerary>` 標籤）
2. 最近 14 則聊天記錄（大型行程 6 則）
3. 使用者當次輸入

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

## 權限設計

### 全域角色（global_role）
| | 使用 App | AI 對話 | 管理帳號 | 看問題追蹤 |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| regular | ✅ | ✅ | ❌ | ❌ |
| guest | ✅（唯讀） | ❌ | ❌ | ❌ |

### 行程角色（member_role）
| | 檢視 | AI + 修改 | 邀請成員 | 刪除行程 |
|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ❌ | ❌ |
| viewer | ✅ | ❌ | ❌ | ❌ |

> guest 全域角色優先 → 即使是 editor 仍唯讀

---

## 待辦 / 已知問題

目前**無明確待辦**，Phase 1 + Phase 2 均已完成。

若要繼續開發，參考方向：
1. **行程分享連結**：允許未登入使用者以唯讀方式預覽行程
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
