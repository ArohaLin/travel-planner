import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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

// ─── Model constants ─────────────────────────────────────────────────────────

export const MODEL_CLAUDE = 'claude-sonnet-4-6'
export const MODEL_MINIMAX = 'minimaxai/minimax-m2.7'

export type ModelProvider = 'claude' | 'minimax'
