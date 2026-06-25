/**
 * 小幫手用：把網址抓成純文字餵 AI（基本版）。
 * 抓 HTML → 取 title/og:title/description + 去標籤內文，截斷到合理長度。
 * Google Maps 短連結會自動 follow redirect，落地頁的 title/meta 通常含地點名。
 */

function htmlToText(html: string): string {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? '').trim()
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return [
    title && `標題：${title}`,
    ogTitle && ogTitle !== title && `og:title：${ogTitle}`,
    desc && `描述：${desc}`,
    body && `內文：${body.slice(0, 3500)}`,
  ].filter(Boolean).join('\n')
}

export interface FetchedUrl { url: string; text?: string; error?: string }

export async function fetchUrlText(url: string): Promise<FetchedUrl> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TravelPlannerBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return { url, error: `HTTP ${res.status}` }
    const ctype = res.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/.test(ctype)) return { url, error: `非網頁內容（${ctype.split(';')[0] || '未知'}）` }
    const html = await res.text()
    const text = htmlToText(html)
    if (!text) return { url, error: '抓不到可用文字' }
    return { url, text }
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError' ? '逾時' : String(e).slice(0, 60)
    return { url, error: msg }
  }
}

/** 從一段文字裡抓出 http(s) 連結（最多 5 個，去重） */
export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'）)]+/g) ?? []
  return Array.from(new Set(matches)).slice(0, 5)
}
