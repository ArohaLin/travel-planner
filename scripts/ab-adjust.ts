/**
 * 測 Pro 在「行程調整」場景的耗時：用真實 buildAdjustPromptGemini + 真實台東行程，
 * 送一個典型調整請求，量時間/token/費用，並驗證 <plans> 可解析。
 */
import { readFileSync } from 'node:fs'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { buildAdjustPromptGemini } from '../lib/ai/systemPrompt'
import { extractPlans } from '../lib/ai/patchParser'
import type { Itinerary } from '../lib/types/itinerary'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

async function main() {
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: row } = await db
  .from('itineraries')
  .select('data')
  .eq('id', '15251c86-e7b7-4b2e-a065-eeb8e11638a0')
  .single()
const itinerary = row!.data as Itinerary

const systemPrompt = buildAdjustPromptGemini(itinerary)
const userMessage = '第二天下午的衝浪體驗想改成更輕鬆的活動，請推薦並調整，注意小孩只有7歲和10歲。'

const MODEL = process.argv[2] ?? 'gemini-3.1-pro-preview'
const g = new GoogleGenerativeAI(env.GEMINI_API_KEY)
const model = g.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt })

console.log(`模型: ${MODEL}  systemPrompt: ${systemPrompt.length} 字元`)
for (let attempt = 1; attempt <= 4; attempt++) {
  const t0 = Date.now()
  try {
    const chat = model.startChat({ generationConfig: { maxOutputTokens: 32768 } })
    const result = await chat.sendMessage(userMessage)
    const ms = Date.now() - t0
    const text = result.response.text()
    const um = result.response.usageMetadata
    const plans = extractPlans(text)
    const inTok = um?.promptTokenCount ?? 0
    const outTok = um?.candidatesTokenCount ?? 0
    const price = MODEL.includes('pro') ? { i: 2.0, o: 12.0 } : { i: 0.3, o: 2.5 }
    const cost = (inTok / 1e6) * price.i + (outTok / 1e6) * price.o
    console.log(`耗時: ${(ms / 1000).toFixed(1)}s`)
    console.log(`tokens: in=${inTok} out=${outTok}`)
    console.log(`費用: $${cost.toFixed(4)}（約 NT$${(cost * 32.5).toFixed(2)}）`)
    console.log(`<plans> 解析: ${plans && plans.length > 0 ? `✅ ${plans.length} 個方案「${plans[0].title}」` : '❌ 失敗'}`)
    break
  } catch (e) {
    console.log(`第 ${attempt} 次失敗: ${(e as Error).message?.slice(0, 160)}`)
    if (attempt < 4) await new Promise((r) => setTimeout(r, 30000))
  }
}

}
main()
