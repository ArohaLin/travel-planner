/**
 * A/B 實測：gemini-3.5-flash vs gemini-3.1-pro-preview
 * 用 production 真實的 buildGeneratePrompt + extractItinerary，
 * 客觀規則檢查：重疊、空窗、住宿出發、schema、欄位完整度；
 * 原始輸出存檔供主觀評分（路線/需求/特色/幻覺）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildGeneratePrompt } from '../lib/ai/systemPrompt'
import { extractItinerary } from '../lib/ai/patchParser'
import { ItinerarySchema, type Itinerary, type ItineraryDay } from '../lib/types/itinerary'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

// 測試規格：貼近實際使用情境的親子自駕行程（與現有行程不同目的地組合，測「新生成」能力）
const SPEC = {
  destination: '台東',
  originCity: '新竹',
  startDate: '2026-08-15',
  endDate: '2026-08-19',
  totalDays: 5,
  travelers: 4,
  currency: 'TWD',
  style: ['親子', '自然'],
  specialRequests:
    '全程自駕。想去綠島住一晚並安排浮潛；想在鹿野高台看熱氣球嘉年華；有一天想要親子衝浪體驗；最後一天傍晚前回到新竹。',
  tripTitle: '台東親子五日遊（A/B測試）',
  returnCity: '新竹',
  preferredTransport: ['自駕'],
  memberProfiles: [
    { age: 40 }, { age: 38 }, { age: 10 }, { age: 7 },
  ],
}

const MODELS = process.argv[2] ? [process.argv[2]] : ['gemini-3.5-flash', 'gemini-3.1-pro-preview']
const PRICE: Record<string, { inM: number; outM: number }> = {
  'gemini-3.5-flash': { inM: 0.3, outM: 2.5 },
  'gemini-3.1-pro-preview': { inM: 2.0, outM: 12.0 },
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface DayIssues {
  overlaps: string[]
  gaps: string[]
  firstNotTransport: string[]
}

function analyze(it: Itinerary) {
  const issues: DayIssues = { overlaps: [], gaps: [], firstNotTransport: [] }
  let totalActs = 0
  let withIntro = 0
  let withAddress = 0
  let structuredOk = 0
  let structuredTotal = 0

  for (const day of it.days as ItineraryDay[]) {
    const acts = day.activities
    totalActs += acts.length
    // 第一個活動必須是 transport（從住宿/出發地出發）
    if (acts.length > 0 && acts[0].type !== 'transport') {
      issues.firstNotTransport.push(`第${day.dayIndex + 1}天 第一個=${acts[0].title}`)
    }
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i]
      if (a.intro?.trim()) withIntro++
      if (a.location?.address?.trim()) withAddress++
      // 結構化欄位完整度（依類型）
      structuredTotal++
      if (a.type === 'transport') {
        if (a.toLabel && a.transportMode) structuredOk++
      } else if (a.type === 'food') {
        if (a.mealType && a.placeLabel) structuredOk++
      } else {
        if (a.placeLabel) structuredOk++
      }
      // 重疊與空窗
      if (i > 0) {
        const prev = acts[i - 1]
        if (prev.endTime && toMin(a.startTime) < toMin(prev.endTime)) {
          issues.overlaps.push(`第${day.dayIndex + 1}天 ${prev.title}(${prev.endTime}) ↔ ${a.title}(${a.startTime})`)
        }
        if (prev.endTime) {
          const gap = toMin(a.startTime) - toMin(prev.endTime)
          if (gap > 15) issues.gaps.push(`第${day.dayIndex + 1}天 ${prev.title}→${a.title} 空 ${gap} 分`)
        }
      }
    }
  }

  const schema = ItinerarySchema.safeParse(it)
  return {
    days: it.days.length,
    totalActs,
    avgActs: (totalActs / it.days.length).toFixed(1),
    schemaOk: schema.success,
    schemaErrors: schema.success ? 0 : schema.error.issues.length,
    overlaps: issues.overlaps,
    gaps: issues.gaps,
    firstNotTransport: issues.firstNotTransport,
    introPct: Math.round((withIntro / totalActs) * 100),
    addressPct: Math.round((withAddress / totalActs) * 100),
    structuredPct: Math.round((structuredOk / structuredTotal) * 100),
    accommodationDays: it.days.filter((d) => d.accommodation).length,
  }
}

async function run() {
  const prompt = buildGeneratePrompt(SPEC)
  console.log(`prompt 長度: ${prompt.length} 字元\n`)
  const g = new GoogleGenerativeAI(env.GEMINI_API_KEY)

  for (const name of MODELS) {
    console.log(`════════ ${name} ════════`)
    const model = g.getGenerativeModel({ model: name, generationConfig: { maxOutputTokens: 32768 } })
    let text = ''
    let usage = { in: 0, out: 0 }
    let ms = 0
    let lastErr = ''
    for (let attempt = 1; attempt <= 8; attempt++) {
      const t0 = Date.now()
      try {
        const result = await model.generateContent(prompt)
        ms = Date.now() - t0
        text = result.response.text()
        const um = result.response.usageMetadata
        if (um) usage = { in: um.promptTokenCount ?? 0, out: um.candidatesTokenCount ?? 0 }
        break
      } catch (e) {
        lastErr = (e as Error).message?.slice(0, 300) ?? String(e)
        console.log(`  第 ${attempt} 次失敗（${lastErr}），${attempt < 4 ? '等 10 秒重試' : '放棄'}`)
        if (attempt < 8) await new Promise((r) => setTimeout(r, 60000))
      }
    }
    if (!text) {
      console.log(`  ❌ 全部失敗: ${lastErr}\n`)
      continue
    }

    writeFileSync(`scripts/ab-raw-${name}.txt`, text)
    const it = extractItinerary(text)
    if (!it) {
      console.log(`  ❌ 解析失敗（extractItinerary 回 null），原文已存 scripts/ab-raw-${name}.txt`)
      console.log(`  耗時 ${(ms / 1000).toFixed(1)}s, tokens in=${usage.in} out=${usage.out}\n`)
      continue
    }
    writeFileSync(`scripts/ab-parsed-${name}.json`, JSON.stringify(it, null, 2))

    const a = analyze(it)
    const price = PRICE[name]
    const costUSD = (usage.in / 1e6) * price.inM + (usage.out / 1e6) * price.outM
    console.log(`  耗時: ${(ms / 1000).toFixed(1)}s`)
    console.log(`  tokens: in=${usage.in} out=${usage.out}`)
    console.log(`  費用: $${costUSD.toFixed(4)} USD（約 NT$${(costUSD * 32.5).toFixed(2)}）`)
    console.log(`  天數: ${a.days}（要求 ${SPEC.totalDays}）  活動數: ${a.totalActs}（平均 ${a.avgActs}/天）  有住宿天數: ${a.accommodationDays}`)
    console.log(`  schema: ${a.schemaOk ? '✅' : `❌ ${a.schemaErrors} 個問題`}`)
    console.log(`  時間重疊: ${a.overlaps.length === 0 ? '✅ 0' : '❌ ' + a.overlaps.length}`)
    a.overlaps.forEach((s) => console.log(`    - ${s}`))
    console.log(`  >15分空窗: ${a.gaps.length === 0 ? '✅ 0' : '⚠️ ' + a.gaps.length}`)
    a.gaps.forEach((s) => console.log(`    - ${s}`))
    console.log(`  第一站非交通: ${a.firstNotTransport.length === 0 ? '✅ 0' : '❌ ' + a.firstNotTransport.length}`)
    a.firstNotTransport.forEach((s) => console.log(`    - ${s}`))
    console.log(`  欄位完整度: intro ${a.introPct}% | 地址 ${a.addressPct}% | 結構化欄位 ${a.structuredPct}%`)
    console.log()
  }
}

run()
