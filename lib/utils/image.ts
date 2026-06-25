/** 小幫手用：上傳前把圖片降尺寸＋JPEG 壓縮 → base64（控制 payload，避免 Vercel body 過大）。 */
export async function fileToCompressedBase64(
  file: File,
  maxDim = 1280,
  quality = 0.72,
): Promise<{ mimeType: string; data: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('讀檔失敗'))
    fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('圖片解碼失敗'))
    i.src = dataUrl
  })
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // 退回原圖（去掉 data url 前綴）
    const base64 = dataUrl.split(',')[1] ?? ''
    return { mimeType: file.type || 'image/jpeg', data: base64 }
  }
  ctx.drawImage(img, 0, 0, width, height)
  const out = canvas.toDataURL('image/jpeg', quality)
  return { mimeType: 'image/jpeg', data: out.split(',')[1] ?? '' }
}
