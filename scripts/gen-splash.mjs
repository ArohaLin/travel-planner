/**
 * 產生 iOS PWA 啟動畫面（apple-touch-startup-image）。
 * 將核准的飛機插圖合成在品牌底色上＋「旅程規劃」字樣，輸出精確裝置解析度 PNG。
 * 執行：node scripts/gen-splash.mjs
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const AIRPLANE = '/Users/aroha/Pictures/comfy/comfy-20260617-173813-166601755.png'
const OUT_DIR = path.join(ROOT, 'public', 'splash')

const BG = '#f9fafb'

// 裝置：iPhone 16 Pro = 1206×2622（402×874 @3x）
const devices = [
  { name: 'iphone16pro', w: 1206, h: 2622 },
]

await sharp(`${OUT_DIR}`).metadata().catch(() => {}) // noop

import fs from 'fs'
fs.mkdirSync(OUT_DIR, { recursive: true })

for (const d of devices) {
  // 飛機插圖縮到畫面寬的 ~62%，白底用 multiply 融進品牌底色
  const planeW = Math.round(d.w * 0.62)
  const plane = await sharp(AIRPLANE).resize({ width: planeW }).toBuffer()
  const planeMeta = await sharp(plane).metadata()
  const planeH = planeMeta.height

  // 版面：飛機略高於中央，標題在其下
  const planeTop = Math.round(d.h * 0.34)
  const planeLeft = Math.round((d.w - planeW) / 2)
  const titleY = planeTop + planeH + Math.round(d.h * 0.04)

  const titleSvg = Buffer.from(
    `<svg width="${d.w}" height="${d.h}" xmlns="http://www.w3.org/2000/svg">
       <text x="50%" y="${titleY}" text-anchor="middle"
         font-family="PingFang TC, Hiragino Sans, Heiti TC, sans-serif"
         font-size="96" font-weight="600" fill="#1f2937" letter-spacing="4">旅程規劃</text>
       <text x="50%" y="${titleY + 80}" text-anchor="middle"
         font-family="PingFang TC, Hiragino Sans, sans-serif"
         font-size="40" font-weight="400" fill="#9ca3af" letter-spacing="2">啟動中…</text>
     </svg>`,
  )

  const out = path.join(OUT_DIR, `${d.name}.png`)
  await sharp({ create: { width: d.w, height: d.h, channels: 3, background: BG } })
    .composite([
      { input: plane, top: planeTop, left: planeLeft, blend: 'multiply' },
      { input: titleSvg, top: 0, left: 0 },
    ])
    .png()
    .toFile(out)
  console.log(`✅ ${out}  (${d.w}×${d.h})`)
}
