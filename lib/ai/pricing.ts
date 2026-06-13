import type { ModelProvider } from './client'
import { MODEL_CLAUDE, MODEL_MINIMAX, MODEL_GEMINI, MODEL_GEMINI_PRO, MODEL_OLLAMA } from './client'

/**
 * AI 回傳資訊 + 費用估算
 *
 * ⚠️ 單價與匯率為「估算值」，可隨時調整下方常數。
 *    單價單位：每百萬（1,000,000）token 的美金價格。
 */

// ── 可調整：美金 → 台幣匯率 ────────────────────────────────────────────────
export const USD_TO_TWD = 32.5

// ── 可調整：各模型單價（USD / 1M tokens）────────────────────────────────────
// 來源為公開定價的估值，實際以各供應商帳單為準；請依需要更新。
interface ModelPrice {
  /** 顯示用的模型版本名稱 */
  label: string
  /** input（prompt）每百萬 token 美金 */
  inputPerM: number
  /** output（completion）每百萬 token 美金 */
  outputPerM: number
}

export const MODEL_PRICING: Record<ModelProvider, ModelPrice> = {
  claude: {
    label: MODEL_CLAUDE,      // claude-sonnet-4-6
    inputPerM: 3.0,
    outputPerM: 15.0,
  },
  gemini: {
    label: MODEL_GEMINI,      // gemini-3.5-flash
    inputPerM: 0.30,
    outputPerM: 2.50,
  },
  minimax: {
    label: MODEL_MINIMAX,     // minimaxai/minimax-m2.7（經 NVIDIA 端點）
    inputPerM: 0.30,
    outputPerM: 1.20,
  },
  local: {
    label: MODEL_OLLAMA,      // 自架 Ollama gemma4:12b（自費電力，API 計價 0）
    inputPerM: 0,
    outputPerM: 0,
  },
}

/** 依「實際模型 ID」覆寫定價（同一供應商有多個模型時用，例如 Gemini 調整用 Pro） */
export const MODEL_PRICE_BY_ID: Record<string, ModelPrice> = {
  [MODEL_GEMINI_PRO]: {
    label: MODEL_GEMINI_PRO,  // gemini-3.1-pro-preview
    inputPerM: 2.0,
    outputPerM: 12.0,
  },
}

// ── Token 用量 ─────────────────────────────────────────────────────────────
export interface AIUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

// ── AI 回傳資訊（記錄最近一次）─────────────────────────────────────────────
export interface AIResultInfo {
  /** 呼叫時間（ISO） */
  timestamp: string
  /** 使用情境：行程調整 / 諮詢 / 建立行程 */
  scene: 'adjust' | 'consult' | 'generate'
  /** 模型供應商 */
  provider: ModelProvider | 'local'
  /** 模型版本字串 */
  model: string
  /** 是否成功 */
  success: boolean
  /** HTTP / 供應商錯誤代碼（成功為 null） */
  errorCode: string | null
  /** 錯誤代碼的中文意義（成功為 null） */
  errorMeaning: string | null
  /** token 用量（本機模式或無資料為 null） */
  usage: AIUsage | null
  /** 費用估算（美金，無資料為 null） */
  costUSD: number | null
  /** 費用估算（台幣，無資料為 null） */
  costTWD: number | null
  /** 耗時毫秒 */
  durationMs: number
}

/** 計算費用（美金）。usage 缺失回 null。modelId 有覆寫價時優先採用（如 Gemini Pro）。 */
export function computeCostUSD(
  provider: ModelProvider,
  usage: AIUsage | null,
  modelId?: string,
): number | null {
  if (!usage) return null
  const price = (modelId && MODEL_PRICE_BY_ID[modelId]) || MODEL_PRICING[provider]
  if (!price) return null
  const inputCost = (usage.inputTokens / 1_000_000) * price.inputPerM
  const outputCost = (usage.outputTokens / 1_000_000) * price.outputPerM
  return inputCost + outputCost
}

export function usdToTwd(usd: number | null): number | null {
  if (usd == null) return null
  return usd * USD_TO_TWD
}

// ── 錯誤代碼意義對照 ───────────────────────────────────────────────────────
const ERROR_MEANINGS: Record<string, string> = {
  '400': '請求格式錯誤',
  '401': '認證失敗（API key 無效或過期）',
  '403': '無權限存取此模型',
  '404': '找不到模型或端點',
  '408': '請求逾時',
  '413': '請求內容過大',
  '422': '參數無法處理',
  '429': 'API 額度用罄或請求過於頻繁',
  '500': '伺服器內部錯誤',
  '502': '上游伺服器錯誤',
  '503': '服務暫時無法使用',
  '504': '上游回應逾時',
  TIMEOUT: '生成逾時',
  PARSE_ERROR: 'AI 回應格式異常，無法解析',
  EMPTY: 'AI 沒有回應內容',
  UNKNOWN: '未知錯誤',
}

/** 從錯誤訊息推斷錯誤代碼 + 中文意義 */
export function classifyError(err: unknown): { code: string; meaning: string } {
  const msg = String((err as Error)?.message ?? err ?? '')
  // 嘗試抓 HTTP 狀態碼
  const statusMatch = msg.match(/\b(400|401|403|404|408|413|422|429|500|502|503|504)\b/)
  if (statusMatch) {
    const code = statusMatch[1]
    return { code, meaning: ERROR_MEANINGS[code] ?? '未知錯誤' }
  }
  if (/timeout|逾時|timed out/i.test(msg)) return { code: 'TIMEOUT', meaning: ERROR_MEANINGS.TIMEOUT }
  if (/parse|解析|JSON/i.test(msg)) return { code: 'PARSE_ERROR', meaning: ERROR_MEANINGS.PARSE_ERROR }
  if (/empty|空/i.test(msg)) return { code: 'EMPTY', meaning: ERROR_MEANINGS.EMPTY }
  return { code: 'UNKNOWN', meaning: ERROR_MEANINGS.UNKNOWN }
}

export function errorMeaning(code: string): string {
  return ERROR_MEANINGS[code] ?? '未知錯誤'
}
