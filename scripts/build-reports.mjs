// 把 reports/*.md（含 frontmatter）打包成 lib/reports/index.ts（內容以 JSON 安全轉義）。
// 為什麼打包成 TS 模組：避免 Vercel serverless 對執行期 fs 讀檔的 file tracing 不確定性，
// 內容當成程式碼一定會被 bundle，最可靠。新增/修改報告後執行：npm run build:reports
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const dir = 'reports'
if (!existsSync(dir)) { console.error('找不到 reports/ 目錄'); process.exit(1) }

const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
const reports = []
for (const f of files) {
  const raw = readFileSync(`${dir}/${f}`, 'utf8')
  let meta = {}, body = raw
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    body = m[2]
  }
  reports.push({
    slug: f.replace(/\.md$/, ''),
    title: meta.title || f.replace(/\.md$/, ''),
    date: meta.date || '',
    category: meta.category || '',
    summary: meta.summary || '',
    content: body,
  })
}
reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

mkdirSync('lib/reports', { recursive: true })
const out = `// ⚠️ 自動產生，請勿手改。來源：reports/*.md（執行 \`npm run build:reports\` 重新產生）
export interface DevReport {
  slug: string
  title: string
  date: string
  category: string
  summary: string
  content: string
}

export const REPORTS: DevReport[] = ${JSON.stringify(reports, null, 2)}

export function getReport(slug: string): DevReport | undefined {
  return REPORTS.find((r) => r.slug === slug)
}
`
writeFileSync('lib/reports/index.ts', out)
console.log(`✅ 產生 lib/reports/index.ts（${reports.length} 份報告：${reports.map((r) => r.slug).join(', ')}）`)
