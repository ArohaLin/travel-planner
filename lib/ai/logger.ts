/**
 * AI 對話 Logger
 * - 寫入 logs/ai-conversations.log（開發 / 自架伺服器）
 * - 超過 5 MB 自動以日期時間更名並新建
 * - Vercel / production 環境沒有持久 FS，只寫 console
 */
import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'ai-conversations.log')
const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5 MB

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return
    const { size } = fs.statSync(LOG_FILE)
    if (size < MAX_LOG_BYTES) return
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dest = path.join(LOG_DIR, `ai-conversations-${ts}.log`)
    fs.renameSync(LOG_FILE, dest)
    console.log('[aiLogger] Rotated log →', dest)
  } catch {
    // ignore FS errors during rotation
  }
}

export interface AIConversationLog {
  timestamp: string
  mode: 'adjust' | 'consult'
  modelProvider: string
  itineraryId: string
  systemPromptBytes: number
  /** 送給 AI 的 history 條數 */
  historyCount: number
  /** 送給 AI 的 history 字元數 */
  historyChars: number
  userMessage: string
  /** 完整回應（可能很長） */
  fullResponse: string
  parsedPlans: boolean
  planCount: number
  durationMs: number
  error?: string
}

export function logAIConversation(data: AIConversationLog): void {
  const line = JSON.stringify(data)

  // 在 production serverless 環境只印到 console
  if (process.env.NODE_ENV === 'production') {
    console.log('[aiLog]', line)
    return
  }

  try {
    ensureDir()
    rotateIfNeeded()
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8')
  } catch (err) {
    // FS 失敗時 fallback 到 console
    console.error('[aiLogger] Write failed, fallback to console:', err)
    console.log('[aiLog]', line)
  }
}
