import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// 精修版：對照原圖重繪
// 特徵：黃→藍漸層背景、大地球居中偏左、飛機繞軌道、斜放咖啡色行李箱、四角閃星
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <!-- 背景：暖黃(左上) → 天藍(右下) -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:#ffe566"/>
      <stop offset="45%"  style="stop-color:#ffc93c"/>
      <stop offset="100%" style="stop-color:#7ecef4"/>
    </linearGradient>

    <!-- 地球海洋 -->
    <radialGradient id="ocean" cx="38%" cy="36%" r="62%">
      <stop offset="0%"   style="stop-color:#5bc8f5"/>
      <stop offset="55%"  style="stop-color:#1e90d4"/>
      <stop offset="100%" style="stop-color:#0c5fa0"/>
    </radialGradient>

    <!-- 地球大陸 -->
    <linearGradient id="land" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:#6ecf6e"/>
      <stop offset="100%" style="stop-color:#3aad3a"/>
    </linearGradient>

    <!-- 地球光澤 -->
    <radialGradient id="shine" cx="32%" cy="28%" r="42%">
      <stop offset="0%"   style="stop-color:#ffffff;stop-opacity:0.45"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>

    <!-- 行李箱主體 -->
    <linearGradient id="bag" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:#b5845a"/>
      <stop offset="100%" style="stop-color:#7a4f2e"/>
    </linearGradient>
    <linearGradient id="bagDark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   style="stop-color:#8b6040"/>
      <stop offset="100%" style="stop-color:#5c3820"/>
    </linearGradient>

    <!-- 飛機白色漸層 -->
    <linearGradient id="planeBody" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#ddeeff"/>
    </linearGradient>

    <!-- 投影 -->
    <filter id="shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="2" dy="4" stdDeviation="5" flood-color="#00000030"/>
    </filter>
    <filter id="bagShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="3" dy="5" stdDeviation="8" flood-color="#00000045"/>
    </filter>
  </defs>

  <!-- ══ 圓角背景 ══ -->
  <rect width="512" height="512" rx="110" ry="110" fill="url(#bg)"/>

  <!-- ══ 地球（大，居中偏左） ══ -->
  <g transform="translate(210, 252)">
    <!-- 地球本體 -->
    <circle cx="0" cy="0" r="158"
            fill="url(#ocean)"
            stroke="#1565c0" stroke-width="5"/>

    <!-- 大陸塊群 -->
    <!-- 北美洲 -->
    <path d="M -95,-85 Q -65,-118 -25,-105 Q 15,-92 30,-68
             Q 40,-48 28,-28 Q 12,-12 -8,-18
             Q -30,-24 -52,-16 Q -78,-6 -90,-30
             Q -105,-56 -95,-85 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>

    <!-- 歐洲/非洲 -->
    <path d="M 20,-95 Q 55,-112 82,-88 Q 105,-68 100,-38
             Q 95,-12 75,0 Q 52,10 35,-2
             Q 15,-15 18,-42 Q 20,-68 20,-95 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>

    <path d="M 30,12 Q 62,5 78,28 Q 90,48 80,72
             Q 68,95 42,100 Q 18,104 5,85
             Q -5,65 8,40 Q 18,18 30,12 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>

    <!-- 亞洲/澳洲 -->
    <path d="M -45,25 Q -18,12 0,28 Q 15,42 8,62
             Q 0,80 -20,82 Q -42,84 -50,65
             Q -58,46 -45,25 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2" stroke-linejoin="round"/>

    <!-- 南極洲 hint -->
    <path d="M -90,130 Q -40,148 20,140 Q 60,135 85,118
             A 158 158 0 0 1 -90 130 Z"
          fill="#e8f5e9" opacity="0.6"/>

    <!-- 地球外框 -->
    <circle cx="0" cy="0" r="158"
            fill="none" stroke="#1976d2" stroke-width="3.5" opacity="0.5"/>

    <!-- 光澤 -->
    <circle cx="0" cy="0" r="158" fill="url(#shine)"/>
  </g>

  <!-- ══ 飛機環繞軌道（橢圓白線） ══ -->
  <ellipse cx="210" cy="252" rx="185" ry="62"
           fill="none"
           stroke="white" stroke-width="5"
           stroke-linecap="round"
           opacity="0.72"
           transform="rotate(-22, 210, 252)"/>

  <!-- ══ 飛機（卡通風，右上，沿軌道） ══ -->
  <g transform="translate(358, 112) rotate(12)" filter="url(#shadow)">
    <!-- 機身 -->
    <rect x="-60" y="-16" width="120" height="32" rx="16"
          fill="url(#planeBody)" stroke="#b0c4d8" stroke-width="3"/>
    <!-- 機頭 -->
    <path d="M 60,-13 Q 86,0 60,13 Z"
          fill="white" stroke="#b0c4d8" stroke-width="2.5"/>

    <!-- 主翼（上） -->
    <path d="M 5,-16 L 44,-62 Q 48,-68 55,-65 L 30,-16 Z"
          fill="white" stroke="#b0c4d8" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- 主翼（下） -->
    <path d="M 5,16 L 44,62 Q 48,68 55,65 L 30,16 Z"
          fill="#ddeeff" stroke="#b0c4d8" stroke-width="2.5" stroke-linejoin="round"/>

    <!-- 後翼（上） -->
    <path d="M -42,-16 L -58,-38 Q -60,-42 -56,-42 L -36,-16 Z"
          fill="white" stroke="#b0c4d8" stroke-width="2"/>
    <!-- 後翼（下） -->
    <path d="M -42,16 L -58,38 Q -60,42 -56,42 L -36,16 Z"
          fill="#ddeeff" stroke="#b0c4d8" stroke-width="2"/>
    <!-- 垂直尾翼 -->
    <path d="M -40,-16 L -58,-46 Q -56,-50 -52,-48 L -30,-16 Z"
          fill="white" stroke="#b0c4d8" stroke-width="2"/>

    <!-- 機窗 -->
    <circle cx="26" cy="-2" r="7" fill="#b8d8f0" stroke="#82b8e0" stroke-width="2"/>
    <circle cx="8"  cy="-3" r="7" fill="#b8d8f0" stroke="#82b8e0" stroke-width="2"/>
    <circle cx="-10" cy="-3" r="7" fill="#b8d8f0" stroke="#82b8e0" stroke-width="2"/>

    <!-- 引擎 -->
    <rect x="16" y="16" width="28" height="13" rx="6.5"
          fill="#e0eefc" stroke="#b0c4d8" stroke-width="2"/>
    <rect x="16" y="-29" width="28" height="13" rx="6.5"
          fill="#e0eefc" stroke="#b0c4d8" stroke-width="2"/>
  </g>

  <!-- ══ 行李箱（右下，斜放，復古咖啡色） ══ -->
  <g transform="translate(348, 310) rotate(8)" filter="url(#bagShadow)">
    <!-- 把手支架 -->
    <path d="M 35,0 L 35,-24 Q 35,-36 48,-36 L 80,-36 Q 93,-36 93,0"
          fill="none" stroke="#5c3820" stroke-width="9"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- 把手握柄 -->
    <rect x="28" y="-42" width="60" height="16" rx="8"
          fill="#8b6040" stroke="#5c3820" stroke-width="3"/>

    <!-- 箱體（主體） -->
    <rect x="0" y="0" width="128" height="154" rx="18"
          fill="url(#bag)" stroke="#5c3820" stroke-width="4.5"/>

    <!-- 箱體右側暗面 -->
    <rect x="96" y="6" width="26" height="142" rx="0"
          fill="#7a4f2e" opacity="0.4"
          clip-path="inset(0 0 0 0 round 0 14px 14px 0)"/>

    <!-- 扣帶橫條（上） -->
    <rect x="0" y="52" width="128" height="16" rx="0"
          fill="#8b6040" stroke="#5c3820" stroke-width="2" opacity="0.8"/>
    <!-- 扣帶橫條（下） -->
    <rect x="0" y="86" width="128" height="16" rx="0"
          fill="#8b6040" stroke="#5c3820" stroke-width="2" opacity="0.8"/>

    <!-- 中央金屬扣 -->
    <rect x="46" y="46" width="36" height="28" rx="7"
          fill="#f5c842" stroke="#c9962a" stroke-width="3"/>
    <rect x="53" y="54" width="22" height="12" rx="4"
          fill="#ffe97a"/>

    <!-- 貼紙 1：藍色方形（左上角） -->
    <rect x="10" y="10" width="32" height="26" rx="5"
          fill="#2196f3" stroke="#1565c0" stroke-width="2.5"/>
    <!-- 貼紙1 內容（交叉線） -->
    <line x1="10" y1="23" x2="42" y2="23" stroke="#1565c0" stroke-width="2"/>
    <line x1="26" y1="10" x2="26" y2="36" stroke="#1565c0" stroke-width="2"/>

    <!-- 貼紙 2：綠色圓形（下方） -->
    <circle cx="24" cy="118" r="16"
            fill="#4caf50" stroke="#2e7d32" stroke-width="2.5"/>
    <!-- 貼紙2 內容（飛機符號） -->
    <path d="M 16,118 L 24,112 L 32,118 L 27,118 L 27,126 L 21,126 L 21,118 Z"
          fill="white" opacity="0.9"/>

    <!-- 直向縫線 -->
    <line x1="64" y1="5" x2="64" y2="149"
          stroke="#5c3820" stroke-width="2.5"
          stroke-dasharray="8 6" opacity="0.5"/>

    <!-- 滾輪 -->
    <ellipse cx="26"  cy="162" rx="18" ry="12"
             fill="#3e2723" stroke="#1a0000" stroke-width="3"/>
    <ellipse cx="102" cy="162" rx="18" ry="12"
             fill="#3e2723" stroke="#1a0000" stroke-width="3"/>
    <!-- 輪軸高光 -->
    <ellipse cx="26"  cy="158" rx="8" ry="4" fill="#6d4c41" opacity="0.6"/>
    <ellipse cx="102" cy="158" rx="8" ry="4" fill="#6d4c41" opacity="0.6"/>
  </g>

  <!-- ══ 四角閃爍星星 ══ -->
  <!-- 左上大星 -->
  <g transform="translate(66, 78)">
    <path d="M 0,-24 L 6,-6 L 24,0 L 6,6 L 0,24 L -6,6 L -24,0 L -6,-6 Z"
          fill="white" opacity="0.95"/>
    <path d="M 0,-12 L 3,-3 L 12,0 L 3,3 L 0,12 L -3,3 L -12,0 L -3,-3 Z"
          fill="white"/>
  </g>
  <!-- 右上小星 -->
  <g transform="translate(450, 60)">
    <path d="M 0,-16 L 4,-4 L 16,0 L 4,4 L 0,16 L -4,4 L -16,0 L -4,-4 Z"
          fill="white" opacity="0.88"/>
  </g>
  <!-- 右上更小星 -->
  <g transform="translate(478, 130)">
    <path d="M 0,-10 L 2.5,-2.5 L 10,0 L 2.5,2.5 L 0,10 L -2.5,2.5 L -10,0 L -2.5,-2.5 Z"
          fill="white" opacity="0.75"/>
  </g>
  <!-- 左下小星 -->
  <g transform="translate(52, 430)">
    <path d="M 0,-14 L 3.5,-3.5 L 14,0 L 3.5,3.5 L 0,14 L -3.5,3.5 L -14,0 L -3.5,-3.5 Z"
          fill="white" opacity="0.80"/>
  </g>
  <!-- 右下小點星 -->
  <circle cx="468" cy="390" r="5" fill="white" opacity="0.6"/>
  <circle cx="478" cy="370" r="3" fill="white" opacity="0.45"/>
  <!-- 左側小點 -->
  <circle cx="44"  cy="200" r="4" fill="white" opacity="0.5"/>
  <circle cx="55"  cy="172" r="2.5" fill="white" opacity="0.38"/>
</svg>
`

async function generate() {
  const buf = Buffer.from(svg)
  const sizes = [
    { name: 'apple-touch-icon.png',   size: 180 },
    { name: 'icon-192.png',           size: 192 },
    { name: 'icon-512.png',           size: 512 },
    { name: 'favicon.ico',            size: 32  },
    { name: 'icon-preview-final.png', size: 512 },
  ]
  for (const { name, size } of sizes) {
    await sharp(buf).resize(size, size).png().toFile(join(publicDir, name))
    console.log(`✅ ${name} (${size}×${size})`)
  }
  console.log('\n🎉 精修版完成！')
}

generate().catch(console.error)
