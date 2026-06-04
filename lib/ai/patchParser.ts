import { ItineraryPatchSchema, AIPlansArraySchema, type ItineraryPatch, type AIPlan } from '@/lib/types/patch'
import { ItinerarySchema, type Itinerary } from '@/lib/types/itinerary'

export function extractPatch(text: string): ItineraryPatch | null {
  const match = text.match(/<patch>([\s\S]*?)<\/patch>/)
  if (!match) return null

  try {
    const cleaned = match[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const raw = JSON.parse(cleaned)
    const result = ItineraryPatchSchema.safeParse(raw)
    if (!result.success) {
      console.error('[patchParser] Patch validation failed:', result.error.flatten())
      return null
    }
    return result.data
  } catch (err) {
    console.error('[patchParser] JSON parse error:', err)
    return null
  }
}

function tryParseItinerary(candidate: string): Itinerary | null {
  const cleaned = candidate.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const raw = JSON.parse(cleaned)
    const result = ItinerarySchema.safeParse(raw)
    if (!result.success) {
      console.error('[patchParser] Itinerary validation issues:', JSON.stringify(
        result.error.issues.map(i => ({ path: i.path.join('.'), msg: i.message, code: i.code }))
      ))
      return null
    }
    return result.data
  } catch {
    return null
  }
}

export function extractItinerary(text: string): Itinerary | null {
  // Primary: look for <itinerary>...</itinerary> XML tag
  const xmlMatch = text.match(/<itinerary>([\s\S]*?)<\/itinerary>/)
  if (xmlMatch) {
    const result = tryParseItinerary(xmlMatch[1])
    if (result) return result
  }

  // Fallback: try to find a raw JSON object with "metadata" and "days" fields
  // (handles MiniMax which may not output XML tags)
  const jsonMatch = text.match(/\{[\s\S]*"metadata"[\s\S]*"days"[\s\S]*\}/)
  if (jsonMatch) {
    // Try to extract valid JSON — find the outermost balanced braces
    let depth = 0, start = -1, end = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') { if (depth === 0) start = i; depth++ }
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (start !== -1 && end !== -1) {
      const result = tryParseItinerary(text.slice(start, end + 1))
      if (result) {
        console.log('[patchParser] Extracted itinerary from raw JSON (no XML tag)')
        return result
      }
    }
  }

  return null
}

export function stripPatchTag(text: string): string {
  return text.replace(/<patch>[\s\S]*?<\/patch>/g, '').trim()
}

/**
 * 解析 <plans>[...]</plans> 標籤，回傳 AIPlan 陣列
 */
export function extractPlans(text: string): AIPlan[] | null {
  // 優先找完整的 <plans>...</plans>
  let match = text.match(/<plans>([\s\S]*?)<\/plans>/)

  // 若找不到（輸出被截斷，缺少 </plans>），嘗試從 <plans> 到結尾修復
  if (!match && text.includes('<plans>')) {
    const start = text.indexOf('<plans>') + '<plans>'.length
    let partial = text.slice(start).trim()
    // 移除 code fence
    partial = partial.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    // 嘗試找最後一個完整的 } 閉合位置，補上 ]
    const lastBrace = partial.lastIndexOf('}')
    if (lastBrace !== -1) {
      const candidate = partial.slice(0, lastBrace + 1)
      // 計算 [ 和 ] 數量，補齊缺少的 ]
      const openBrackets = (candidate.match(/\[/g) || []).length
      const closeBrackets = (candidate.match(/\]/g) || []).length
      const missing = ']'.repeat(Math.max(0, openBrackets - closeBrackets))
      const repaired = candidate + missing
      match = [null as any, repaired] as RegExpMatchArray
      console.log('[patchParser] Repaired truncated <plans>, length:', repaired.length)
    }
  }

  if (!match) return null

  try {
    let cleaned = match[1].trim()
    // 移除整體 markdown code fence（Gemini 有時會包 ```json ... ```）
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    // 移除 JSON 內部的行尾 trailing comma（Gemini 常見問題）
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')
    // 移除 JSON 字串以外的 JavaScript 風格注解
    cleaned = cleaned.replace(/\/\/[^\n"]*/g, '')

    const raw = JSON.parse(cleaned)
    console.log('[patchParser] Plans raw type:', typeof raw, Array.isArray(raw) ? 'isArray len=' + raw.length : 'notArray', 'keys:', typeof raw === 'object' && raw !== null ? Object.keys(raw).slice(0, 5) : 'n/a')
    if (Array.isArray(raw) && raw.length > 0) {
      console.log('[patchParser] Plans[0] keys:', Object.keys(raw[0]).join(','))
    }
    const result = AIPlansArraySchema.safeParse(raw)
    if (!result.success) {
      console.error('[patchParser] Plans validation failed:', JSON.stringify(result.error.flatten()))
      console.error('[patchParser] Plans raw[0]:', JSON.stringify(raw[0] ?? raw).slice(0, 300))
      return null
    }
    return result.data
  } catch (err) {
    console.error('[patchParser] Plans JSON parse error:', err)
    return null
  }
}

/**
 * 移除 <plans> 標籤，只保留說明文字
 */
export function stripPlansTag(text: string): string {
  return text.replace(/<plans>[\s\S]*?<\/plans>/g, '').trim()
}

/** 從 AI 回應擷取 <memory>...</memory> 內容（#15 行程記憶）。無則回 null。 */
export function extractMemory(text: string): string | null {
  const m = text.match(/<memory>([\s\S]*?)<\/memory>/)
  if (!m) return null
  const content = m[1].trim()
  return content.length > 0 ? content : null
}

/** 移除 <memory>...</memory>（含未閉合的殘段），避免顯示給使用者。 */
export function stripMemoryTag(text: string): string {
  return text
    .replace(/<memory>[\s\S]*?<\/memory>/g, '')
    .replace(/<memory>[\s\S]*/g, '')
    .trim()
}
