import { getAnthropicClient, MODEL_CLAUDE } from '@/lib/ai/client'
import { isLocalAI, runLocalClaude } from '@/lib/ai/localClaude'
import type { Itinerary } from '@/lib/types/itinerary'
import type { BrochureCopy } from '@/lib/types/brochure'

/**
 * 用 AI 為宣傳冊生成「封面副標 + 亮點標語 + 特色簡介 + 賣點清單」。
 * 小型結構化生成，支援本機 LOCAL_AI；失敗一律回退到合理預設（不擋宣傳冊產生）。
 */

const INSTRUCTION = `你是旅遊宣傳冊文案編輯。根據使用者提供的行程摘要，輸出一段繁體中文的宣傳文案。
只輸出 JSON（不要任何說明、不要 markdown 圍欄），格式：
{
  "subtitle": "目的地的英文名稱，如 'Taitung, Taiwan'（簡短、優雅，給封面當英文副標）",
  "tagline": "一句吸引人的中文標語（15 字內，放封面）",
  "intro": "2–3 句行程特色簡介（像旅行社 DM 的前言，描述這趟旅程的整體魅力與風格）",
  "highlights": ["賣點一句話", "賣點一句話", "賣點一句話", "賣點一句話"]
}
規則：highlights 3–5 條，每條 20 字內、具體點出此行程的精華（景點/體驗/美食/住宿），不要空泛。全程繁體中文（subtitle 除外）。`

function summarize(itin: Itinerary): string {
  const m = itin.metadata
  const lines: string[] = [
    `行程名稱：${m.title}`,
    `目的地：${m.destination}｜天數：${itin.days.length} 天｜人數：${m.travelers}`,
    m.style?.length ? `風格：${m.style.join('、')}` : '',
    '每日重點：',
  ]
  for (const d of itin.days) {
    const acts = d.activities
      .filter((a) => a.type !== 'transport')
      .map((a) => a.placeLabel || a.title)
      .slice(0, 6)
    const foods = d.activities
      .filter((a) => a.type === 'food' && a.foodItems)
      .map((a) => a.foodItems)
      .slice(0, 2)
    lines.push(
      `  Day ${d.dayIndex + 1}（${d.city}）${d.theme ? '：' + d.theme : ''}` +
        `｜景點：${acts.join('、') || '—'}` +
        (foods.length ? `｜美食：${foods.join('、')}` : '') +
        (d.accommodation ? `｜住宿：${d.accommodation.name}` : ''),
    )
  }
  return lines.filter(Boolean).join('\n')
}

function fallback(itin: Itinerary): BrochureCopy {
  return {
    subtitle: itin.metadata.destination,
    tagline: itin.metadata.title,
    intro: '',
    highlights: [],
  }
}

/** 從文字中抽出第一個完整 JSON 物件 */
function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function coerce(raw: unknown, itin: Itinerary): BrochureCopy {
  const fb = fallback(itin)
  if (!raw || typeof raw !== 'object') return fb
  const o = raw as Record<string, unknown>
  return {
    subtitle: typeof o.subtitle === 'string' && o.subtitle.trim() ? o.subtitle.trim() : fb.subtitle,
    tagline: typeof o.tagline === 'string' && o.tagline.trim() ? o.tagline.trim() : fb.tagline,
    intro: typeof o.intro === 'string' ? o.intro.trim() : '',
    highlights: Array.isArray(o.highlights)
      ? o.highlights.filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 5)
      : [],
  }
}

export async function generateBrochureCopy(itin: Itinerary): Promise<BrochureCopy> {
  const summary = summarize(itin)
  try {
    let text = ''
    if (isLocalAI()) {
      text = await runLocalClaude({
        systemPrompt: INSTRUCTION,
        userMessage: summary,
        timeoutMs: 90000,
      })
    } else {
      const anthropic = getAnthropicClient()
      const msg = await anthropic.messages.create({
        model: MODEL_CLAUDE,
        max_tokens: 1000,
        messages: [{ role: 'user', content: `${INSTRUCTION}\n\n---\n行程摘要：\n${summary}` }],
      })
      text = msg.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
    }
    return coerce(extractJson(text), itin)
  } catch (e) {
    console.error('[brochureCopy] 生成失敗，使用預設：', String(e).slice(0, 200))
    return fallback(itin)
  }
}
