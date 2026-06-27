/**
 * 地圖「飛行」平移：從目前相機平滑移動到目標點。
 *
 * 為何不直接用 map.panTo：Google Maps 的 panTo 只有在目標「已在目前視野內」才平滑滑動，
 * 距離遠（超出視野）時會直接瞬移 → 視覺很跳。這裡用 requestAnimationFrame 逐幀
 * 以 moveCamera 內插 center＋zoom：遠距離時中途自動「拉遠再拉近」（拋物線 zoom），
 * 營造像 Google Earth 飛過去的感覺；近距離則近似平順滑動。
 *
 * @returns 取消動畫的函式（連續點擊時用來中止前一段，避免疊加）
 */
export function flyTo(
  map: google.maps.Map,
  dest: { lat: number; lng: number },
  opts: { zoom?: number; duration?: number } = {},
): (() => void) | undefined {
  const duration = opts.duration ?? 750
  const startCenter = map.getCenter()
  const startZoom = map.getZoom() ?? 13
  const destZoom = opts.zoom ?? Math.max(startZoom, 15)

  // 不支援 moveCamera 或拿不到目前中心 → 退回原生（至少會到位）
  if (!startCenter || typeof map.moveCamera !== 'function') {
    map.panTo(dest)
    map.setZoom(destZoom)
    return undefined
  }

  const startLat = startCenter.lat()
  const startLng = startCenter.lng()
  const dLat = dest.lat - startLat
  const dLng = dest.lng - startLng

  // 中途拉遠幅度：依移動距離（粗估公里）決定；約 >4km 才開始拉遠，最多拉 4 級
  const approxKm = Math.hypot(dLat, dLng) * 111
  const dip = Math.min(4, Math.max(0, Math.log2(Math.max(approxKm, 1)) - 2))

  // easeInOutCubic：起步與收尾都緩
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

  let raf = 0
  const t0 = performance.now()
  function step(now: number) {
    const t = Math.min(1, (now - t0) / duration)
    const e = ease(t)
    map.moveCamera({
      center: { lat: startLat + dLat * e, lng: startLng + dLng * e },
      // 主插值用 eased 進度；dip 用線性進度的 sin → 中途最低（拉遠）、兩端回到目標
      zoom: startZoom + (destZoom - startZoom) * e - dip * Math.sin(Math.PI * t),
    })
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
