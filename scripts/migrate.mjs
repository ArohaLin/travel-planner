// 簡易 migration 執行器：node scripts/migrate.mjs <sql檔路徑>
// 使用 .env.local 的 SUPABASE_DB_URL（Session pooler）直接執行 DDL。
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!env.SUPABASE_DB_URL) {
  console.error('缺少 SUPABASE_DB_URL')
  process.exit(1)
}
const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/migrate.mjs <sql檔>')
  process.exit(1)
}
const sql = readFileSync(file, 'utf8')
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL })
await client.connect()
try {
  await client.query(sql)
  console.log(`✅ 已執行 ${file}`)
} finally {
  await client.end()
}
