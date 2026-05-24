import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// ══════════════════════════════════════════════════════
// 設計 A：「極光藍」— 深邃夜空，飛機劃過月球/地球，星星點綴
// ══════════════════════════════════════════════════════
const svgA = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgA" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="60%" style="stop-color:#1e3a5f"/>
      <stop offset="100%" style="stop-color:#0e4272"/>
    </linearGradient>
    <radialGradient id="globeA" cx="45%" cy="40%" r="55%">
      <stop offset="0%" style="stop-color:#60a5fa"/>
      <stop offset="50%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#1e3a8a"/>
    </radialGradient>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#93c5fd;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="planeA" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0f2fe"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="512" height="512" rx="108" ry="108" fill="url(#bgA)"/>

  <!-- 星星 -->
  <circle cx="60"  cy="55"  r="2.5" fill="white" opacity="0.8"/>
  <circle cx="120" cy="90"  r="1.5" fill="white" opacity="0.6"/>
  <circle cx="200" cy="45"  r="2"   fill="white" opacity="0.7"/>
  <circle cx="320" cy="70"  r="1.5" fill="white" opacity="0.5"/>
  <circle cx="420" cy="50"  r="3"   fill="white" opacity="0.8"/>
  <circle cx="460" cy="100" r="1.5" fill="white" opacity="0.6"/>
  <circle cx="80"  cy="150" r="1.5" fill="white" opacity="0.4"/>
  <circle cx="440" cy="180" r="2"   fill="white" opacity="0.5"/>
  <circle cx="380" cy="130" r="1.5" fill="white" opacity="0.6"/>
  <circle cx="150" cy="130" r="1"   fill="white" opacity="0.4"/>

  <!-- 地球光暈 -->
  <circle cx="180" cy="300" r="165" fill="url(#glowA)"/>

  <!-- 地球本體 -->
  <circle cx="180" cy="300" r="130" fill="url(#globeA)"/>
  <!-- 地球紋路 -->
  <ellipse cx="180" cy="300" rx="130" ry="42" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.4"/>
  <ellipse cx="180" cy="300" rx="80"  ry="130" fill="none" stroke="#93c5fd" stroke-width="1.5" opacity="0.3"/>
  <ellipse cx="180" cy="300" rx="25"  ry="130" fill="none" stroke="#93c5fd" stroke-width="1.5" opacity="0.25"/>
  <!-- 大陸色塊（簡化） -->
  <path d="M 120 240 Q 155 220 175 235 Q 195 250 185 270 Q 165 285 140 275 Z" fill="#34d399" opacity="0.35"/>
  <path d="M 185 260 Q 215 245 230 258 Q 240 272 225 285 Q 205 295 190 280 Z" fill="#34d399" opacity="0.3"/>
  <path d="M 130 305 Q 155 295 165 310 Q 170 325 150 332 Q 130 335 125 320 Z" fill="#34d399" opacity="0.3"/>
  <!-- 地球邊框 -->
  <circle cx="180" cy="300" r="130" fill="none" stroke="#60a5fa" stroke-width="2.5" opacity="0.5"/>

  <!-- 飛機飛行軌跡 -->
  <path d="M 100 320 Q 260 180 430 140"
        fill="none" stroke="white" stroke-width="1.5"
        stroke-dasharray="8 6" opacity="0.25"/>

  <!-- 飛機（白色，右上方向） -->
  <g transform="translate(318, 178) rotate(-30)" filter="url(#glow)">
    <!-- 機身 -->
    <ellipse cx="0" cy="0" rx="72" ry="16" fill="url(#planeA)"/>
    <!-- 機頭 -->
    <ellipse cx="68" cy="0" rx="14" ry="12" fill="white"/>
    <!-- 機尾 -->
    <ellipse cx="-66" cy="0" rx="10" ry="8" fill="#e0f2fe"/>
    <!-- 主翼 -->
    <path d="M 15,0 L 46,-48 L 62,-44 L 38,0 Z" fill="white" opacity="0.95"/>
    <path d="M 15,0 L 46,48  L 62,44  L 38,0 Z" fill="#dbeafe" opacity="0.9"/>
    <!-- 後翼 -->
    <path d="M -52,0 L -64,-24 L -48,-22 L -40,0 Z" fill="white"/>
    <path d="M -52,0 L -64,24  L -48,22  L -40,0 Z" fill="#dbeafe"/>
    <!-- 垂直尾翼 -->
    <path d="M -48,0 L -66,-32 L -54,-30 L -38,0 Z" fill="white"/>
    <!-- 機窗 -->
    <circle cx="32" cy="-5" r="5" fill="#bfdbfe" opacity="0.8"/>
    <circle cx="16" cy="-6" r="5" fill="#bfdbfe" opacity="0.8"/>
    <circle cx="0"  cy="-6" r="5" fill="#bfdbfe" opacity="0.8"/>
    <!-- 引擎 -->
    <ellipse cx="28" cy="14" rx="14" ry="6" fill="#93c5fd"/>
    <ellipse cx="28" cy="-14" rx="14" ry="6" fill="#93c5fd"/>
  </g>

  <!-- 行李箱（右下，小一點當配角） -->
  <g transform="translate(348, 340)">
    <!-- 把手 -->
    <rect x="20" y="-14" width="36" height="9" rx="4.5" fill="#bfdbfe" opacity="0.9"/>
    <!-- 箱體 -->
    <rect x="0" y="0" width="76" height="90" rx="12" fill="#1e40af" opacity="0.85"/>
    <!-- 中線 -->
    <line x1="38" y1="6" x2="38" y2="84" stroke="#60a5fa" stroke-width="2" opacity="0.5"/>
    <!-- 橫條 -->
    <rect x="6" y="24" width="64" height="8" rx="4" fill="#3b82f6" opacity="0.6"/>
    <rect x="6" y="56" width="64" height="8" rx="4" fill="#3b82f6" opacity="0.6"/>
    <!-- 扣環 -->
    <rect x="10" y="-5" width="12" height="6" rx="2.5" fill="#60a5fa"/>
    <rect x="54" y="-5" width="12" height="6" rx="2.5" fill="#60a5fa"/>
    <!-- 滾輪 -->
    <circle cx="14" cy="96" r="7" fill="#1e3a8a"/>
    <circle cx="62" cy="96" r="7" fill="#1e3a8a"/>
  </g>

  <!-- 底部標語區：輕微漸層遮罩 -->
  <defs>
    <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:0"/>
      <stop offset="100%" style="stop-color:#0f172a;stop-opacity:0.3"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" ry="108" fill="url(#overlay)"/>
</svg>
`

// ══════════════════════════════════════════════════════
// 設計 B：「珊瑚橘」— 暖色夕陽漸層，扁平幾何風格，活潑清新
// ══════════════════════════════════════════════════════
const svgB = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgB" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff6b35"/>
      <stop offset="50%" style="stop-color:#f7931e"/>
      <stop offset="100%" style="stop-color:#ffcd3c"/>
    </linearGradient>
    <radialGradient id="circleB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.2"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>
  </defs>

  <!-- 背景 -->
  <rect width="512" height="512" rx="108" ry="108" fill="url(#bgB)"/>

  <!-- 背景裝飾圓 -->
  <circle cx="420" cy="100" r="140" fill="url(#circleB)"/>
  <circle cx="80"  cy="420" r="100" fill="url(#circleB)"/>

  <!-- 地球（簡潔扁平風格） -->
  <g transform="translate(170, 285)">
    <!-- 地球主體 -->
    <circle cx="0" cy="0" r="118" fill="white" opacity="0.2"/>
    <circle cx="0" cy="0" r="118" fill="none" stroke="white" stroke-width="3" opacity="0.6"/>
    <!-- 赤道 -->
    <ellipse cx="0" cy="0" rx="118" ry="38" fill="none" stroke="white" stroke-width="3" opacity="0.5"/>
    <!-- 縱線 -->
    <ellipse cx="0" cy="0" rx="60" ry="118" fill="none" stroke="white" stroke-width="2.5" opacity="0.4"/>
    <!-- 大陸（簡化幾何） -->
    <ellipse cx="-30" cy="-30" rx="38" ry="28" fill="white" opacity="0.4"/>
    <ellipse cx="40"  cy="-15" rx="28" ry="22" fill="white" opacity="0.35"/>
    <ellipse cx="-10" cy="30"  rx="32" ry="20" fill="white" opacity="0.3"/>
    <ellipse cx="50"  cy="40"  rx="20" ry="16" fill="white" opacity="0.25"/>
  </g>

  <!-- 飛機軌跡 -->
  <path d="M 80 400 Q 250 200 440 130"
        fill="none" stroke="white" stroke-width="2.5"
        stroke-dasharray="12 8" opacity="0.35"/>

  <!-- 飛機（扁平白色） -->
  <g transform="translate(310, 175) rotate(-28)">
    <!-- 機身 -->
    <rect x="-65" y="-14" width="130" height="28" rx="14" fill="white"/>
    <!-- 機頭尖 -->
    <path d="M 65,-10 L 90,0 L 65,10 Z" fill="white"/>
    <!-- 主翼 -->
    <path d="M 10,-14 L 40,-58 L 58,-54 L 32,-14 Z" fill="white" opacity="0.9"/>
    <path d="M 10,14  L 40,58  L 58,54  L 32,14  Z" fill="white" opacity="0.85"/>
    <!-- 後翼 -->
    <path d="M -48,-14 L -60,-34 L -46,-32 L -36,-14 Z" fill="white"/>
    <path d="M -48,14  L -60,34  L -46,32  L -36,14  Z" fill="white"/>
    <!-- 垂直尾翼 -->
    <path d="M -44,-14 L -62,-42 L -50,-38 L -32,-14 Z" fill="white"/>
    <!-- 機窗（橘色，與背景呼應） -->
    <circle cx="28"  cy="-3" r="5.5" fill="#ff8c42"/>
    <circle cx="10"  cy="-4" r="5.5" fill="#ff8c42"/>
    <circle cx="-8"  cy="-4" r="5.5" fill="#ff8c42"/>
    <circle cx="-26" cy="-4" r="5.5" fill="#ff8c42"/>
    <!-- 引擎 -->
    <rect x="18" y="14" width="28" height="12" rx="6" fill="#ffe0cc"/>
    <rect x="18" y="-26" width="28" height="12" rx="6" fill="#ffe0cc"/>
  </g>

  <!-- 行李箱（扁平幾何風） -->
  <g transform="translate(350, 340)">
    <!-- 把手 -->
    <path d="M 22 0 L 22 -18 Q 22 -26 30 -26 L 50 -26 Q 58 -26 58 -18 L 58 0"
          fill="none" stroke="white" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
    <!-- 箱體 -->
    <rect x="0" y="0" width="80" height="95" rx="12" fill="white" opacity="0.25"/>
    <rect x="0" y="0" width="80" height="95" rx="12" fill="none" stroke="white" stroke-width="3" opacity="0.7"/>
    <!-- 中線 -->
    <line x1="40" y1="8" x2="40" y2="87" stroke="white" stroke-width="2.5" opacity="0.5"/>
    <!-- 橫條 -->
    <rect x="8" y="26" width="64" height="9" rx="4.5" fill="white" opacity="0.35"/>
    <rect x="8" y="60" width="64" height="9" rx="4.5" fill="white" opacity="0.35"/>
    <!-- 滾輪 -->
    <circle cx="16" cy="101" r="8" fill="white" opacity="0.7"/>
    <circle cx="64" cy="101" r="8" fill="white" opacity="0.7"/>
  </g>

  <!-- 定位針（右上角小裝飾） -->
  <g transform="translate(405, 80)">
    <path d="M 0,-32 Q 22,-32 22,-12 Q 22,6 0,28 Q -22,6 -22,-12 Q -22,-32 0,-32 Z"
          fill="white" opacity="0.9"/>
    <circle cx="0" cy="-10" r="9" fill="#ff6b35"/>
  </g>

  <!-- 裝飾小圓點 -->
  <circle cx="70"  cy="80"  r="5" fill="white" opacity="0.4"/>
  <circle cx="110" cy="55"  r="3" fill="white" opacity="0.3"/>
  <circle cx="450" cy="380" r="4" fill="white" opacity="0.3"/>
</svg>
`

// ══════════════════════════════════════════════════════
// 設計 C：「翠綠探索」— 深墨綠底，金色細節，羅盤+飛機，高端質感
// ══════════════════════════════════════════════════════
const svgC = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgC" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#052e16"/>
      <stop offset="50%" style="stop-color:#064e3b"/>
      <stop offset="100%" style="stop-color:#065f46"/>
    </linearGradient>
    <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#d97706;stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:#d97706;stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fbbf24"/>
      <stop offset="100%" style="stop-color:#d97706"/>
    </linearGradient>
    <radialGradient id="globeC" cx="40%" cy="35%" r="58%">
      <stop offset="0%" style="stop-color:#10b981"/>
      <stop offset="60%" style="stop-color:#047857"/>
      <stop offset="100%" style="stop-color:#064e3b"/>
    </radialGradient>
    <filter id="goldGlow">
      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="512" height="512" rx="108" ry="108" fill="url(#bgC)"/>

  <!-- 羅盤光暈 -->
  <circle cx="256" cy="268" r="195" fill="url(#compassBg)"/>

  <!-- 羅盤外圈 -->
  <circle cx="256" cy="268" r="188" fill="none" stroke="#d97706" stroke-width="1.5" opacity="0.2"/>
  <circle cx="256" cy="268" r="175" fill="none" stroke="#fbbf24" stroke-width="2"   opacity="0.15"/>

  <!-- 羅盤刻度（每30度）-->
  <g stroke="#fbbf24" stroke-width="2" opacity="0.25">
    <line x1="256" y1="80"  x2="256" y2="96"/>
    <line x1="256" y1="440" x2="256" y2="456"/>
    <line x1="68"  y1="268" x2="84"  y2="268"/>
    <line x1="428" y1="268" x2="444" y2="268"/>
    <!-- 斜線刻度 -->
    <line x1="339" y1="105" x2="330" y2="119"/>
    <line x1="422" y1="185" x2="408" y2="192"/>
    <line x1="422" y1="351" x2="408" y2="344"/>
    <line x1="339" y1="431" x2="330" y2="417"/>
    <line x1="173" y1="431" x2="182" y2="417"/>
    <line x1="90"  y1="351" x2="104" y2="344"/>
    <line x1="90"  y1="185" x2="104" y2="192"/>
    <line x1="173" y1="105" x2="182" y2="119"/>
  </g>

  <!-- 地球 -->
  <g transform="translate(170, 290)">
    <circle cx="0" cy="0" r="115" fill="url(#globeC)"/>
    <ellipse cx="0" cy="0" rx="115" ry="36" fill="none" stroke="#6ee7b7" stroke-width="2" opacity="0.35"/>
    <ellipse cx="0" cy="0" rx="62"  ry="115" fill="none" stroke="#6ee7b7" stroke-width="1.5" opacity="0.28"/>
    <!-- 大陸 -->
    <path d="M -40 -50 Q -10 -70 20 -55 Q 40 -40 35 -20 Q 20 -5 -5 -10 Q -35 -15 -40 -50 Z"
          fill="#34d399" opacity="0.45"/>
    <path d="M 25 -35 Q 52 -48 62 -28 Q 68 -12 55 0 Q 38 10 22 2 Q 10 -8 25 -35 Z"
          fill="#34d399" opacity="0.38"/>
    <path d="M -20 15 Q 5 5 18 18 Q 25 32 10 42 Q -12 48 -22 34 Z"
          fill="#34d399" opacity="0.38"/>
    <path d="M 30 22 Q 50 18 56 34 Q 58 48 42 52 Q 26 55 22 42 Z"
          fill="#34d399" opacity="0.32"/>
    <circle cx="0" cy="0" r="115" fill="none" stroke="#6ee7b7" stroke-width="2.5" opacity="0.4"/>
  </g>

  <!-- 飛機（金色，精緻質感） -->
  <g transform="translate(315, 172) rotate(-32)" filter="url(#goldGlow)">
    <ellipse cx="0" cy="0" rx="75" ry="17" fill="url(#goldGrad)"/>
    <ellipse cx="70" cy="0" rx="14" ry="12" fill="#fbbf24"/>
    <ellipse cx="-70" cy="0" rx="10" ry="8" fill="#d97706"/>
    <!-- 主翼 -->
    <path d="M 12,0 L 48,-52 L 65,-47 L 38,0 Z" fill="#fbbf24" opacity="0.95"/>
    <path d="M 12,0 L 48,52  L 65,47  L 38,0 Z" fill="#f59e0b" opacity="0.9"/>
    <!-- 後翼 -->
    <path d="M -54,0 L -68,-26 L -52,-24 L -42,0 Z" fill="#fbbf24"/>
    <path d="M -54,0 L -68,26  L -52,24  L -42,0 Z" fill="#f59e0b"/>
    <!-- 垂直尾翼 -->
    <path d="M -50,0 L -70,-36 L -56,-32 L -38,0 Z" fill="#fbbf24"/>
    <!-- 機窗（翠綠） -->
    <circle cx="34" cy="-5" r="5.5" fill="#064e3b" opacity="0.8"/>
    <circle cx="18" cy="-6" r="5.5" fill="#064e3b" opacity="0.8"/>
    <circle cx="2"  cy="-6" r="5.5" fill="#064e3b" opacity="0.8"/>
    <!-- 引擎 -->
    <ellipse cx="30" cy="16" rx="14" ry="6" fill="#d97706"/>
    <ellipse cx="30" cy="-16" rx="14" ry="6" fill="#d97706"/>
  </g>

  <!-- 飛行軌跡（金色虛線） -->
  <path d="M 90 390 Q 250 200 440 148"
        fill="none" stroke="#fbbf24" stroke-width="2"
        stroke-dasharray="10 7" opacity="0.22"/>

  <!-- 行李箱（金色輪廓） -->
  <g transform="translate(350, 340)">
    <!-- 把手 -->
    <path d="M 22 0 L 22 -16 Q 22 -24 30 -24 L 52 -24 Q 60 -24 60 -16 L 60 0"
          fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    <!-- 箱體 -->
    <rect x="0" y="0" width="82" height="98" rx="12"
          fill="#065f46" stroke="#fbbf24" stroke-width="2.5" opacity="0.9"/>
    <!-- 中線 -->
    <line x1="41" y1="7" x2="41" y2="91" stroke="#fbbf24" stroke-width="2" opacity="0.4"/>
    <!-- 橫條 -->
    <rect x="7" y="26" width="68" height="9" rx="4.5" fill="#fbbf24" opacity="0.2"/>
    <rect x="7" y="62" width="68" height="9" rx="4.5" fill="#fbbf24" opacity="0.2"/>
    <!-- 金色鎖扣 -->
    <rect x="30" y="42" width="22" height="14" rx="5" fill="#fbbf24" opacity="0.7"/>
    <!-- 滾輪 -->
    <circle cx="15" cy="104" r="7" fill="#fbbf24" opacity="0.65"/>
    <circle cx="67" cy="104" r="7" fill="#fbbf24" opacity="0.65"/>
  </g>

  <!-- 羅盤指針（北方，裝飾用） -->
  <g transform="translate(256, 88)" filter="url(#goldGlow)">
    <path d="M 0,-22 L 6,0 L 0,6 L -6,0 Z" fill="#ef4444" opacity="0.8"/>
    <path d="M 0,22  L 6,0 L 0,6 L -6,0 Z" fill="#fbbf24" opacity="0.6"/>
    <circle cx="0" cy="0" r="4" fill="#fbbf24" opacity="0.9"/>
  </g>

  <!-- N 字母（北方） -->
  <text x="256" y="60" text-anchor="middle" font-size="14" font-weight="bold"
        fill="#fbbf24" opacity="0.45" font-family="serif">N</text>
</svg>
`

async function generate() {
  const designs = [
    { name: 'A', label: '極光藍', svg: svgA },
    { name: 'B', label: '珊瑚橘', svg: svgB },
    { name: 'C', label: '翠綠探索', svg: svgC },
  ]

  for (const d of designs) {
    const buf = Buffer.from(d.svg)
    const out512 = join(publicDir, `icon-preview-${d.name}.png`)
    await sharp(buf).resize(512, 512).png().toFile(out512)
    console.log(`✅ 設計 ${d.name}（${d.label}）→ icon-preview-${d.name}.png`)
  }

  console.log('\n🎉 3 組預覽圖已產生完成！請在瀏覽器查看：')
  console.log('   A: http://localhost:3000/icon-preview-A.png')
  console.log('   B: http://localhost:3000/icon-preview-B.png')
  console.log('   C: http://localhost:3000/icon-preview-C.png')
}

generate().catch(console.error)
