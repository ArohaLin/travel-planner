# 旅程規劃 App

AI 協助的多人協作旅遊行程規劃工具，繁體中文介面，優化給 iPhone Safari 使用。

## 技術棧

- **Next.js 14** (App Router) + TypeScript
- **Supabase** — PostgreSQL + Auth + Realtime
- **Claude API** (`claude-sonnet-4-6`)
- **Tailwind CSS**
- **Vercel** 部署

## 快速開始

### 1. 安裝 Node.js

前往 [nodejs.org](https://nodejs.org) 下載 LTS 版本（v20+），或使用 Homebrew：

```bash
brew install node
```

### 2. 建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 建立新專案
2. 在 **SQL Editor** 執行 `supabase/schema.sql` 中的完整 SQL
3. 在 **Authentication > Providers** 確認 Email 登入已啟用
4. 複製 Project URL 和 API Keys

### 3. 設定環境變數

```bash
cp .env.local.example .env.local
```

編輯 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
INVITE_JWT_SECRET=your-random-32-char-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. 安裝依賴並啟動

```bash
cd travel-planner
npm install
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)

### 5. 部署到 Vercel

```bash
npm install -g vercel
vercel
```

在 Vercel Dashboard 設定相同的環境變數，`NEXT_PUBLIC_APP_URL` 改為你的 Vercel 網址。

## 主要功能

| 功能 | 說明 |
|------|------|
| AI 行程生成 | 4 步驟精靈，Claude 生成完整行程 |
| AI 對話修改 | ChatSheet 底部抽屜，即時 streaming |
| 固定格式 | Patch 系統確保格式不會漂移 |
| 多人協作 | Supabase Realtime 即時同步 |
| 在線 Presence | 即時顯示誰在查看行程 |
| 修改歷程 | 完整記錄所有修改與操作者 |
| 邀請連結 | Owner 可生成 7 天有效邀請連結 |
| 權限管理 | Owner / Editor / Viewer 三層權限 |

## 專案結構

```
app/
├── (auth)/login, register     # 登入/註冊
├── dashboard/                  # 我的行程列表
├── itinerary/
│   ├── new/                    # 建立行程精靈
│   └── [id]/                   # 行程主頁
│       ├── history/            # 修改歷程
│       ├── members/            # 成員管理
│       └── join/               # 接受邀請

lib/
├── types/itinerary.ts          # 唯一行程格式定義
├── types/patch.ts              # Patch 操作型別
├── ai/systemPrompt.ts          # Claude 系統提示詞
├── ai/patchApplier.ts          # 純函數 patch 套用
└── hooks/useItinerary.ts       # Realtime 訂閱

supabase/schema.sql             # 完整 DB schema + RLS
```

## iPhone Safari 優化

- `env(safe-area-inset-*)` 支援 Dynamic Island 和 Home Indicator
- 最小觸控目標 44×44pt（Apple HIG）
- `font-size: 16px` 防止 Safari 自動縮放
- `overscroll-behavior: contain` 防止橡皮筋滾動
- `-webkit-overflow-scrolling: touch` 慣性滾動
