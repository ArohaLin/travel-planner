import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// -------------------------------------------------------
// SVG 設計：紫色漸層背景 + 地球 + 飛機 + 行李箱
// -------------------------------------------------------
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <!-- 主背景漸層：深紫 → 亮紫 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4c1d95"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <!-- 地球光澤 -->
    <radialGradient id="globeGrad" cx="42%" cy="38%" r="55%">
      <stop offset="0%" style="stop-color:#a78bfa;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#4c1d95;stop-opacity:1"/>
    </radialGradient>
    <!-- 白色光暈 -->
    <radialGradient id="shine" cx="35%" cy="30%" r="40%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.25"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>
    <!-- 飛機陰影 -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="6" flood-color="#1e0a4e" flood-opacity="0.4"/>
    </filter>
    <!-- 行李箱陰影 -->
    <filter id="lugShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="3" stdDeviation="4" flood-color="#1e0a4e" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- ── 圓角背景 ── -->
  <rect width="512" height="512" rx="112" ry="112" fill="url(#bgGrad)"/>

  <!-- ── 地球（左下偏中） ── -->
  <g transform="translate(148, 260)">
    <!-- 地球本體 -->
    <circle cx="0" cy="0" r="128" fill="url(#globeGrad)"/>
    <!-- 地球赤道線 -->
    <ellipse cx="0" cy="0" rx="128" ry="40" fill="none" stroke="#c4b5fd" stroke-width="2.5" opacity="0.6"/>
    <!-- 地球縱線 -->
    <ellipse cx="0" cy="0" rx="68" ry="128" fill="none" stroke="#c4b5fd" stroke-width="2" opacity="0.45"/>
    <ellipse cx="0" cy="0" rx="20" ry="128" fill="none" stroke="#c4b5fd" stroke-width="2" opacity="0.35"/>
    <!-- 地球輪廓 -->
    <circle cx="0" cy="0" r="128" fill="none" stroke="#ddd6fe" stroke-width="3" opacity="0.5"/>
    <!-- 光澤 -->
    <circle cx="0" cy="0" r="128" fill="url(#shine)"/>
  </g>

  <!-- ── 行李箱（右下） ── -->
  <g transform="translate(330, 330)" filter="url(#lugShadow)">
    <!-- 把手 -->
    <rect x="22" y="-18" width="48" height="12" rx="6" fill="#f5f3ff" opacity="0.9"/>
    <!-- 箱體 -->
    <rect x="0" y="0" width="92" height="112" rx="14" fill="#ede9fe"/>
    <!-- 箱體陰影面 -->
    <rect x="64" y="0" width="28" height="112" rx="0" fill="#ddd6fe" opacity="0.6" clip-path="inset(0 0 0 0 round 0 14px 14px 0)"/>
    <!-- 中線 -->
    <line x1="46" y1="8" x2="46" y2="104" stroke="#a78bfa" stroke-width="2.5" opacity="0.7"/>
    <!-- 橫條 -->
    <rect x="8" y="32" width="76" height="10" rx="5" fill="#c4b5fd" opacity="0.6"/>
    <rect x="8" y="70" width="76" height="10" rx="5" fill="#c4b5fd" opacity="0.6"/>
    <!-- 扣環 -->
    <rect x="12" y="-6" width="16" height="8" rx="3" fill="#a78bfa"/>
    <rect x="64" y="-6" width="16" height="8" rx="3" fill="#a78bfa"/>
    <!-- 滾輪 -->
    <circle cx="18" cy="118" r="8" fill="#7c3aed"/>
    <circle cx="74" cy="118" r="8" fill="#7c3aed"/>
  </g>

  <!-- ── 飛機（主角，斜飛右上） ── -->
  <g transform="translate(256, 200) rotate(-35)" filter="url(#shadow)">
    <!-- 機身 -->
    <ellipse cx="0" cy="0" rx="90" ry="22" fill="white"/>
    <!-- 機頭 -->
    <ellipse cx="82" cy="0" rx="18" ry="16" fill="white"/>
    <!-- 機尾 -->
    <ellipse cx="-82" cy="0" rx="14" ry="10" fill="#ede9fe"/>
    <!-- 主翼 -->
    <path d="M 20,0 L 60,-62 L 80,-58 L 50,0 Z" fill="white"/>
    <path d="M 20,0 L 60,62 L 80,58 L 50,0 Z" fill="#f5f3ff"/>
    <!-- 後翼 -->
    <path d="M -65,0 L -78,-30 L -60,-28 L -52,0 Z" fill="white"/>
    <path d="M -65,0 L -78,30 L -60,28 L -52,0 Z" fill="#f5f3ff"/>
    <!-- 垂直尾翼 -->
    <path d="M -58,0 L -82,-40 L -68,-36 L -48,0 Z" fill="white"/>
    <!-- 機窗 -->
    <circle cx="40" cy="-7" r="6" fill="#ddd6fe"/>
    <circle cx="20" cy="-8" r="6" fill="#ddd6fe"/>
    <circle cx="0"  cy="-8" r="6" fill="#ddd6fe"/>
    <!-- 引擎 -->
    <ellipse cx="38" cy="18" rx="18" ry="8" fill="#c4b5fd"/>
    <ellipse cx="38" cy="-18" rx="18" ry="8" fill="#c4b5fd"/>
  </g>

  <!-- ── 裝飾星點 ── -->
  <circle cx="420" cy="80"  r="4" fill="white" opacity="0.5"/>
  <circle cx="80"  cy="100" r="3" fill="white" opacity="0.4"/>
  <circle cx="440" cy="200" r="2.5" fill="white" opacity="0.35"/>
  <circle cx="100" cy="180" r="2" fill="white" opacity="0.3"/>
  <circle cx="390" cy="420" r="3" fill="white" opacity="0.3"/>

  <!-- ── 航線虛線弧 ── -->
  <path d="M 90 380 Q 260 130 430 140"
        fill="none" stroke="white" stroke-width="2"
        stroke-dasharray="10 8" opacity="0.2"/>
</svg>
`

async function generateIcons() {
  const svgBuffer = Buffer.from(svgSource)

  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png',         size: 192 },
    { name: 'icon-512.png',         size: 512 },
    { name: 'favicon-32.png',       size: 32  },
  ]

  for (const { name, size } of sizes) {
    const outputPath = join(publicDir, name)
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath)
    console.log(`✅ 已產生 ${name} (${size}×${size}px)`)
  }

  // 產生 favicon.ico（用 32px PNG 複製，瀏覽器可直接讀 PNG 格式的 .ico）
  const faviconPath = join(publicDir, 'favicon.ico')
  await sharp(svgBuffer).resize(32, 32).png().toFile(faviconPath)
  console.log('✅ 已產生 favicon.ico (32×32px)')

  console.log('\n🎉 所有圖示已產生完成！請查看 public/ 資料夾')
}

generateIcons().catch(console.error)
