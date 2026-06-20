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

/** 嘗試把一段字串解析為 AIPlan[]（清 code fence / trailing comma / 行內註解後驗證）。失敗回 null。 */
function tryParsePlans(raw: string): AIPlan[] | null {
  try {
    let cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')   // 行尾 trailing comma（Gemini 常見）
    cleaned = cleaned.replace(/\/\/[^\n"]*/g, '')      // JSON 字串外的 // 註解
    const parsed = JSON.parse(cleaned)
    const result = AIPlansArraySchema.safeParse(parsed)
    if (!result.success) {
      console.error('[patchParser] Plans validation failed:', JSON.stringify(result.error.flatten()).slice(0, 400))
      return null
    }
    return result.data
  } catch (err) {
    console.error('[patchParser] Plans JSON parse error:', String(err).slice(0, 160))
    return null
  }
}

/** 從文字抓「第一個平衡的 JSON 陣列」字串（字串內的括號不計）。找不到回 null。 */
function firstBalancedArray(text: string): string | null {
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  return null
}

/**
 * 截斷修復（逐字解析，正確跳過字串內的括號）。
 *
 * 兩個修復層次：
 * 1. planEnds（depth 2→1）：找到完整的頂層方案物件，在後面補 `]` 收尾。
 *    適用：有多個方案、或方案剛好在截斷前完整閉合。
 *
 * 2. opEnds（depth 5→4）：在單一方案被截斷在 ops 陣列中途時使用。
 *    典型結構：root[1] → plan{2} → patch{3} → ops[4] → op{5}
 *    找到最後一個完整 op，補上 `],"proposedBy":"ai"}}]` 收尾。
 *    （proposedBy 在 ops 之後才寫，截斷時常缺；schema 已設 default:'ai'）
 */
function repairTruncatedJson(partial: string): AIPlan[] | null {
  const clean = partial.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let depth = 0, inStr = false, esc = false, started = false
  const planEnds: number[] = []
  const opEnds: number[] = []

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '[' || ch === '{') { if (!started && ch === '[') started = true; depth++ }
    else if (ch === ']' || ch === '}') {
      depth--
      if (started) {
        if (ch === '}' && depth === 1) planEnds.push(i)  // 完整的頂層方案物件
        if (ch === '}' && depth === 4) opEnds.push(i)    // patch.ops 裡完整的 op
      }
    }
  }

  // 層次 1：從最後一個完整方案往前試
  for (let i = planEnds.length - 1; i >= 0; i--) {
    const result = tryParsePlans(clean.slice(0, planEnds[i] + 1) + ']')
    if (result?.length) {
      console.log(`[patchParser] Repaired: salvaged ${result.length} complete plan(s)`)
      return result
    }
  }

  // 層次 2：方案截斷在 ops 中途，從最後一個完整 op 往前試
  // 補上 ]（關 ops）+ ,"proposedBy":"ai"（補遺漏欄位）+ }}]（關 patch/plan/root）
  for (let i = opEnds.length - 1; i >= 0; i--) {
    const base = clean.slice(0, opEnds[i] + 1)
    for (const tail of [']}}]', '],"proposedBy":"ai"}}]']) {
      const result = tryParsePlans(base + tail)
      if (result?.length) {
        const opCount = result[0].patch?.ops?.length ?? '?'
        console.log(`[patchParser] Repaired truncated ops: salvaged ${opCount} ops`)
        return result
      }
    }
  }

  return null
}

/**
 * 解析方案，回傳 AIPlan 陣列。容錯順序：
 * 1) 完整 <plans>...</plans>
 * 2) <plans> 被截斷（缺 </plans>）→ 逐字追蹤括號深度找完整方案物件，救回最多方案
 * 3) 後備：Gemini 偶爾不照指示包 <plans>，改用 ```json 程式碼區塊或裸 JSON 陣列輸出方案
 *    → 從 code fence / 第一個平衡陣列救回（曾發生「C 一鍵排程」漏包標籤、方案無法套用、裸 JSON 外漏）
 */
export function extractPlans(text: string): AIPlan[] | null {
  // 1) 完整成對
  const tagged = text.match(/<plans>([\s\S]*?)<\/plans>/)
  if (tagged) { const p = tryParsePlans(tagged[1]); if (p) return p }

  // 2) 截斷修復（逐字解析：完整方案 → ops 層級兩層容錯）
  if (text.includes('<plans>')) {
    const start = text.indexOf('<plans>') + '<plans>'.length
    const partial = text.slice(start)
    const p = repairTruncatedJson(partial)
    if (p) return p
  }

  // 3) 後備：未包 <plans> 的方案（code fence 或裸陣列）
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    const p = tryParsePlans(fence[1])
    if (p) { console.log('[patchParser] Plans recovered from code fence (no <plans> tag), plans:', p.length); return p }
  }
  const arr = firstBalancedArray(text)
  if (arr) {
    const p = tryParsePlans(arr)
    if (p) { console.log('[patchParser] Plans recovered from bare JSON array (no <plans> tag), plans:', p.length); return p }
  }

  return null
}

/**
 * 移除 <plans> 標籤，只保留說明文字。
 * 同時處理「未閉合 / 被截斷」的 <plans>（缺少 </plans>）——這類輸出常見於
 * 項目過多、輸出在 token 上限被截斷時；若不一併清掉，原始 JSON 會殘留在
 * displayText 並外漏到聊天泡泡（且讓 content 暴增、被字元上限過濾器丟棄）。
 * 與 extractPlans 的截斷修復、前端串流的 /<plans>[\s\S]*\/ 清除邏輯對齊。
 */
export function stripPlansTag(text: string): string {
  return text
    .replace(/<plans>[\s\S]*?<\/plans>/g, '') // 完整成對
    .replace(/<plans>[\s\S]*/g, '')           // 未閉合 / 截斷 → 清到結尾
    .trim()
}

/**
 * 移除「漏包標籤的方案 JSON」——adjust 模式偶爾 Gemini 不用 <plans>，改用 ```json 程式碼區塊或
 * 直接裸寫方案陣列。這些 JSON 不該顯示給使用者，否則聊天泡泡會冒出大段 JSON 原文。
 * 僅在 adjust 顯示文字上套用（咨詢模式本就不該有 JSON）。
 */
export function stripLeakedPlanJson(text: string): string {
  let t = text
    .replace(/```[\s\S]*?```/g, '') // 成對 code fence
    .replace(/```[\s\S]*$/g, '')    // 未閉合 code fence → 清到結尾
  // 裸方案/patch JSON：偵測到方案/patch 標記時，從第一個 [ 或 { 起截斷（方案 JSON 一律在 prose 之後）
  if (/"planIndex"|"ops"\s*:|"add_activity"|"op"\s*:/.test(t)) {
    const idxs = [t.indexOf('['), t.indexOf('{')].filter((i) => i >= 0)
    if (idxs.length) t = t.slice(0, Math.min(...idxs))
  }
  return t.trim()
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
