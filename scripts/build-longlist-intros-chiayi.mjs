/**
 * 嘉義「漏網之魚」longlist 簡介補件
 *
 * 1. 對每筆 longlist 打 Google Place Details 取 editorial_summary（官方簡介，零幻覺）
 * 2. 沒有官方簡介者，批次用本機 claude -p 生成中性簡介（免費、不計費）
 * 3. UPDATE recommendations.editorial_reason
 *
 * 執行：node scripts/build-longlist-intros-chiayi.mjs
 * 需要 .env.local 的 NEXT_PUBLIC_GOOGLE_MAPS_KEY 與 SUPABASE_DB_URL，以及本機 claude CLI
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { spawn } from 'child_process'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
const DB_URL   = process.env.SUPABASE_DB_URL
if (!MAPS_KEY) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set')
if (!DB_URL)   throw new Error('SUPABASE_DB_URL not set')

// ── Place Details: editorial_summary ────────────────────────────────────────
async function fetchSummary(placeId) {
  const url = 'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${placeId}&fields=editorial_summary&language=zh-TW&key=${MAPS_KEY}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const j = await res.json()
    return j.result?.editorial_summary?.overview ?? null
  } catch {
    return null
  }
}

// ── claude -p 批次生成（一次一個 chunk，回 JSON 物件 idx→intro）───────────────
function callClaude(promptText) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--tools', ''], { cwd: '/tmp' })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error('claude exit ' + code + ': ' + err))
      resolve(out.trim())
    })
    child.stdin.write(promptText)
    child.stdin.end()
  })
}

async function aiIntros(items) {
  // items: [{idx, name, category, rating}]
  const list = items.map((it) =>
    `${it.idx}. ${it.name}（類別：${it.category}${it.rating ? `，評分 ${it.rating}` : ''}）`
  ).join('\n')
  const prompt =
    '你是嘉義在地導覽。以下是嘉義的地點清單，請為每個地點寫一句「中性、客觀」的繁體中文簡介（20–30 字，描述它是什麼、特色），' +
    '只依名稱與類別推斷，不確定的細節不要編造（可寫該類型的通用描述）。\n' +
    '嚴格只輸出 JSON 物件，key 是編號（字串），value 是簡介字串，不要任何其他文字或 markdown：\n\n' +
    list
  const raw = await callClaude(prompt)
  // 去 code fence
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // 抓第一個 { ... }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('claude 回傳非 JSON：' + raw.slice(0, 200))
  return JSON.parse(cleaned.slice(start, end + 1))
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
const db = new Client({ connectionString: DB_URL })
await db.connect()

const { rows } = await db.query(
  `SELECT id, name, category, google_place_id, rating_snapshot
     FROM recommendations
    WHERE region='嘉義' AND tier='longlist'
      AND (editorial_reason IS NULL OR editorial_reason='')
    ORDER BY category, credibility DESC`
)
console.log(`待補簡介：${rows.length} 筆`)

// 1) Google 官方簡介（並發 2、throttle）
const fromGoogle = new Map()  // id → overview
const needAI = []
let cursor = 0
async function worker() {
  while (cursor < rows.length) {
    const r = rows[cursor++]
    const ov = await fetchSummary(r.google_place_id)
    if (ov) fromGoogle.set(r.id, ov)
    else needAI.push(r)
    if ((fromGoogle.size + needAI.length) % 20 === 0)
      console.log(`  Place Details 進度 ${fromGoogle.size + needAI.length}/${rows.length}`)
    await new Promise((x) => setTimeout(x, 500))
  }
}
await Promise.all([worker(), worker()])
console.log(`Google 官方簡介：${fromGoogle.size} 筆；需 AI 補：${needAI.length} 筆`)

// 2) AI 補缺（每 chunk 20 筆）
const fromAI = new Map()  // id → intro
const CHUNK = 20
for (let i = 0; i < needAI.length; i += CHUNK) {
  const slice = needAI.slice(i, i + CHUNK)
  const items = slice.map((r, j) => ({ idx: i + j, name: r.name, category: r.category, rating: r.rating_snapshot }))
  console.log(`  claude -p 生成 ${i + 1}–${Math.min(i + CHUNK, needAI.length)}/${needAI.length}…`)
  try {
    const map = await aiIntros(items)
    for (const it of items) {
      const intro = map[String(it.idx)]
      if (intro) fromAI.set(needAI[it.idx].id, String(intro).trim())
    }
  } catch (e) {
    console.error('  ⚠️ 此 chunk 生成失敗，跳過：', e.message)
  }
}

// 3) 寫回
let updated = 0
for (const r of rows) {
  const intro = fromGoogle.get(r.id) ?? fromAI.get(r.id)
  if (!intro) continue
  await db.query(`UPDATE recommendations SET editorial_reason=$1 WHERE id=$2`, [intro, r.id])
  updated++
}
await db.end()

console.log(`\n✅ 完成！更新 ${updated} 筆簡介（Google ${fromGoogle.size} + AI ${fromAI.size}）`)
const missing = rows.length - updated
if (missing) console.log(`⚠️ 仍有 ${missing} 筆無簡介（AI chunk 失敗），可重跑腳本補`)
