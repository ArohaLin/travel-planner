import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// 右上角風格：黃色背景 + 地球 + 環繞飛機白色 + 咖啡色行李箱 + 閃爍星星
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <!-- 黃色漸層背景 -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffe066"/>
      <stop offset="55%" style="stop-color:#ffc200"/>
      <stop offset="100%" style="stop-color:#ffab00"/>
    </linearGradient>
    <!-- 地球藍色海洋 -->
    <radialGradient id="ocean" cx="40%" cy="38%" r="60%">
      <stop offset="0%" style="stop-color:#4fc3f7"/>
      <stop offset="100%" style="stop-color:#0277bd"/>
    </radialGradient>
    <!-- 地球大陸 -->
    <radialGradient id="land" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#81c784"/>
      <stop offset="100%" style="stop-color:#388e3c"/>
    </radialGradient>
    <!-- 地球光澤 -->
    <radialGradient id="globeShine" cx="35%" cy="30%" r="45%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.35"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>
    <!-- 行李箱漸層 -->
    <linearGradient id="luggage" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a0714f"/>
      <stop offset="100%" style="stop-color:#6d4c41"/>
    </linearGradient>
    <linearGradient id="luggageSide" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#795548"/>
      <stop offset="100%" style="stop-color:#4e342e"/>
    </linearGradient>
    <!-- 輪廓描邊用 -->
    <filter id="outline">
      <feMorphology in="SourceAlpha" operator="dilate" radius="2.5" result="expanded"/>
      <feFlood flood-color="#5d3a1a" flood-opacity="0.8" result="color"/>
      <feComposite in="color" in2="expanded" operator="in" result="outline"/>
      <feMerge>
        <feMergeNode in="outline"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <!-- 飛機陰影 -->
    <filter id="planeShadow">
      <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="#00000040"/>
    </filter>
  </defs>

  <!-- ══ 圓角背景 ══ -->
  <rect width="512" height="512" rx="108" ry="108" fill="url(#bg)"/>

  <!-- ══ 地球（中偏左上） ══ -->
  <g transform="translate(205, 215)">
    <!-- 地球本體（海洋藍） -->
    <circle cx="0" cy="0" r="135" fill="url(#ocean)" stroke="#1565c0" stroke-width="4"/>

    <!-- 大陸一（北美/歐洲區域） -->
    <path d="M -70,-80 Q -40,-105 0,-90 Q 35,-78 50,-55 Q 60,-35 45,-18
             Q 25,-5 5,-10 Q -20,-15 -40,-5 Q -60,5 -72,-18 Q -82,-45 -70,-80 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>

    <!-- 大陸二（亞洲/非洲） -->
    <path d="M 42,-50 Q 75,-62 95,-38 Q 108,-20 98,5
             Q 85,28 65,32 Q 42,35 30,18 Q 18,2 32,-20 Q 40,-38 42,-50 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>

    <!-- 大陸三（南半球小陸塊） -->
    <path d="M -25,55 Q 5,42 28,58 Q 38,72 25,88
             Q 8,100 -15,92 Q -35,82 -30,65 Z"
          fill="url(#land)" stroke="#2e7d32" stroke-width="2" stroke-linejoin="round"/>

    <!-- 環繞軌道線 -->
    <ellipse cx="0" cy="0" rx="165" ry="48"
             fill="none" stroke="white" stroke-width="3.5"
             stroke-dasharray="0" opacity="0.55"
             transform="rotate(-18)"/>

    <!-- 地球光澤 -->
    <circle cx="0" cy="0" r="135" fill="url(#globeShine)"/>
  </g>

  <!-- ══ 飛機（沿軌道，右上方） ══ -->
  <g transform="translate(340, 100) rotate(15)" filter="url(#planeShadow)">
    <!-- 機身 -->
    <rect x="-52" y="-13" width="104" height="26" rx="13" fill="white" stroke="#ccc" stroke-width="1.5"/>
    <!-- 機頭 -->
    <path d="M 52,-10 Q 72,0 52,10 Z" fill="white" stroke="#ccc" stroke-width="1.5"/>
    <!-- 主翼上 -->
    <path d="M 8,-13 L 38,-50 Q 42,-54 48,-52 L 28,-13 Z"
          fill="white" stroke="#bbb" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- 主翼下 -->
    <path d="M 8,13  L 38,50  Q 42,54  48,52  L 28,13  Z"
          fill="#e0e0e0" stroke="#bbb" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- 後翼上 -->
    <path d="M -36,-13 L -50,-30 Q -52,-33 -48,-33 L -30,-13 Z"
          fill="white" stroke="#bbb" stroke-width="1.5"/>
    <!-- 後翼下 -->
    <path d="M -36,13  L -50,30  Q -52,33  -48,33  L -30,13  Z"
          fill="#e0e0e0" stroke="#bbb" stroke-width="1.5"/>
    <!-- 垂直尾翼 -->
    <path d="M -34,-13 L -50,-38 Q -48,-42 -44,-40 L -26,-13 Z"
          fill="white" stroke="#bbb" stroke-width="1.5"/>
    <!-- 機窗 -->
    <circle cx="22"  cy="-2" r="6" fill="#b3e5fc" stroke="#81d4fa" stroke-width="1.5"/>
    <circle cx="6"   cy="-3" r="6" fill="#b3e5fc" stroke="#81d4fa" stroke-width="1.5"/>
    <circle cx="-10" cy="-3" r="6" fill="#b3e5fc" stroke="#81d4fa" stroke-width="1.5"/>
    <!-- 引擎 -->
    <rect x="18" y="13" width="24" height="11" rx="5.5"
          fill="#f5f5f5" stroke="#ccc" stroke-width="1.5"/>
    <rect x="18" y="-24" width="24" height="11" rx="5.5"
          fill="#f5f5f5" stroke="#ccc" stroke-width="1.5"/>
    <!-- 機身縱線裝飾 -->
    <line x1="-45" y1="0" x2="48" y2="0" stroke="#ddd" stroke-width="1" opacity="0.6"/>
  </g>

  <!-- ══ 行李箱（右下，咖啡色復古風） ══ -->
  <g transform="translate(335, 305)">
    <!-- 把手帶 -->
    <path d="M 28,-18 L 28,-32 Q 28,-44 40,-44 L 64,-44 Q 76,-44 76,-32 L 76,-18"
          fill="none" stroke="#5d4037" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- 把手套 -->
    <rect x="30" y="-44" width="44" height="12" rx="6"
          fill="#8d6e63" stroke="#5d4037" stroke-width="2"/>

    <!-- 箱體陰影（右側深色） -->
    <rect x="8" y="4" width="138" height="148" rx="16"
          fill="#5d4037" opacity="0.3"/>

    <!-- 箱體主體 -->
    <rect x="0" y="0" width="138" height="148" rx="16"
          fill="url(#luggage)" stroke="#4e342e" stroke-width="3.5"/>

    <!-- 箱體右側高光 -->
    <rect x="110" y="4" width="24" height="140" rx="0"
          fill="#795548" opacity="0.35"
          clip-path="inset(0 0 0 0 round 0 12px 12px 0)"/>

    <!-- 中央扣帶（橫向） -->
    <rect x="0" y="58" width="138" height="14" rx="0"
          fill="#6d4c41" stroke="#4e342e" stroke-width="1.5" opacity="0.7"/>
    <rect x="0" y="76" width="138" height="14" rx="0"
          fill="#6d4c41" stroke="#4e342e" stroke-width="1.5" opacity="0.7"/>

    <!-- 金屬扣環 -->
    <rect x="52" y="52" width="34" height="26" rx="6"
          fill="#ffd54f" stroke="#f9a825" stroke-width="2.5"/>
    <rect x="60" y="60" width="18" height="10" rx="3"
          fill="#ffecb3"/>

    <!-- 貼紙 1（藍色方形） -->
    <rect x="12" y="16" width="26" height="22" rx="4"
          fill="#29b6f6" stroke="#0288d1" stroke-width="2"/>
    <line x1="12" y1="27" x2="38" y2="27" stroke="#0288d1" stroke-width="1.5"/>
    <line x1="25" y1="16" x2="25" y2="38" stroke="#0288d1" stroke-width="1.5"/>

    <!-- 貼紙 2（綠色小圓） -->
    <circle cx="20" cy="112" r="12"
            fill="#66bb6a" stroke="#388e3c" stroke-width="2"/>
    <text x="20" y="117" text-anchor="middle" font-size="12" fill="white" font-weight="bold">✈</text>

    <!-- 左側拉鍊線 -->
    <line x1="0" y1="24" x2="0" y2="124" stroke="#4e342e" stroke-width="3" opacity="0.4"/>

    <!-- 滾輪 -->
    <ellipse cx="22"  cy="156" rx="16" ry="10"
             fill="#3e2723" stroke="#1a0000" stroke-width="2"/>
    <ellipse cx="116" cy="156" rx="16" ry="10"
             fill="#3e2723" stroke="#1a0000" stroke-width="2"/>
    <!-- 輪軸高光 -->
    <ellipse cx="22"  cy="153" rx="8" ry="4" fill="#5d4037" opacity="0.6"/>
    <ellipse cx="116" cy="153" rx="8" ry="4" fill="#5d4037" opacity="0.6"/>
  </g>

  <!-- ══ 閃爍星星（四角） ══ -->
  <!-- 左上星 -->
  <g transform="translate(60, 75)">
    <path d="M 0,-18 L 4,-4 L 18,0 L 4,4 L 0,18 L -4,4 L -18,0 L -4,-4 Z"
          fill="white" opacity="0.9"/>
  </g>
  <!-- 右上星（大） -->
  <g transform="translate(448, 58)">
    <path d="M 0,-22 L 5,-5 L 22,0 L 5,5 L 0,22 L -5,5 L -22,0 L -5,-5 Z"
          fill="white" opacity="0.85"/>
  </g>
  <!-- 右下小星 -->
  <g transform="translate(472, 155)">
    <path d="M 0,-12 L 3,-3 L 12,0 L 3,3 L 0,12 L -3,3 L -12,0 L -3,-3 Z"
          fill="white" opacity="0.7"/>
  </g>
  <!-- 左下小星 -->
  <g transform="translate(48, 390)">
    <path d="M 0,-10 L 2.5,-2.5 L 10,0 L 2.5,2.5 L 0,10 L -2.5,2.5 L -10,0 L -2.5,-2.5 Z"
          fill="white" opacity="0.65"/>
  </g>
  <!-- 地球左側小點 -->
  <circle cx="68"  cy="215" r="5" fill="white" opacity="0.5"/>
  <circle cx="88"  cy="175" r="3" fill="white" opacity="0.4"/>
  <circle cx="460" cy="310" r="4" fill="white" opacity="0.4"/>
</svg>
`

async function generate() {
  const buf = Buffer.from(svg)

  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png',         size: 192 },
    { name: 'icon-512.png',         size: 512 },
    { name: 'favicon.ico',          size: 32  },
    { name: 'icon-preview-final.png', size: 512 },
  ]

  for (const { name, size } of sizes) {
    await sharp(buf).resize(size, size).png().toFile(join(publicDir, name))
    console.log(`✅ ${name} (${size}×${size}px)`)
  }
  console.log('\n🎉 完成！圖示已套用為正式版本。')
  console.log('   預覽：http://localhost:3000/icon-preview-final.png')
}

generate().catch(console.error)
