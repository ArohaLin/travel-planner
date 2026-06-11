import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ─── Anthropic (Claude) ──────────────────────────────────────────────────────

let anthropic: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.APP_ANTHROPIC_KEY })
  }
  return anthropic
}

// ─── NVIDIA / MiniMax (OpenAI-compatible) ────────────────────────────────────

let nvidiaClient: OpenAI | null = null

export function getNvidiaClient(): OpenAI {
  if (!nvidiaClient) {
    nvidiaClient = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY ?? '',
    })
  }
  return nvidiaClient
}

// ─── Google Gemini ────────────────────────────────────────────────────────────

let geminiClient: GoogleGenerativeAI | null = null

export function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
  }
  return geminiClient
}

// ─── Model constants ─────────────────────────────────────────────────────────

export const MODEL_CLAUDE = 'claude-sonnet-4-6'
export const MODEL_MINIMAX = 'minimaxai/minimax-m2.7'
/** Gemini 快速模型：初次生成（大輸出、避開 Vercel 300s 時限）與咨詢用 */
export const MODEL_GEMINI = 'gemini-3.5-flash'
/** Gemini 推理模型：行程調整用（多約束推理實測零違規；輸出小、約 60 秒）。
 *  兩者互為自動備援（過載 503 時切換）。A/B 實測：2026-06-12 */
export const MODEL_GEMINI_PRO = 'gemini-3.1-pro-preview'

export type ModelProvider = 'claude' | 'minimax' | 'gemini'
