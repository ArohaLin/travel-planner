// PWA icon v4：使用者提供的手繪風圖（地球+飛機+行李箱）
// 原圖（scripts/icon-source-v4.png，208×208）帶有白色外框與預先做好的圓角，
// iPhone 桌面 icon 必須是「全出血正方形」（iOS 會自動套圓角遮罩），
// 故先裁掉白框與圓角區，再放大輸出三種尺寸。
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, 'icon-source-v4.png')
const publicDir = join(__dirname, '..', 'public')

// 每邊裁掉的比例：蓋過白框 + 圓角弧線（208px 原圖約裁 14px/邊）
const CROP_RATIO = 0.068

const meta = await sharp(src).metadata()
const cut = Math.round(meta.width * CROP_RATIO)
const size = meta.width - cut * 2

const base = sharp(src)
  .extract({ left: cut, top: cut, width: size, height: meta.height - cut * 2 })
  .flatten({ background: '#ffffff' })

for (const [file, px] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await base
    .clone()
    .resize(px, px, { kernel: 'lanczos3' })
    .png()
    .toFile(join(publicDir, file))
  console.log(`✅ ${file} (${px}×${px})`)
}
console.log('完成。來源：scripts/icon-source-v4.png，每邊裁切', cut, 'px')
