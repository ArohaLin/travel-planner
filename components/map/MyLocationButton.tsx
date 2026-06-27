'use client'

import { useState } from 'react'
import { MapControl, ControlPosition, useMap, Marker } from '@vis.gl/react-google-maps'

interface Props {
  /** 按鈕在地圖上的位置（預設右側中間，避開頂部 chips 與底部卡片） */
  position?: ControlPosition
}

/**
 * 「回到我的位置」控制鈕——所有互動地圖共用（行程地圖、美食地圖）。
 * 點擊用瀏覽器 Geolocation 取得目前位置 → 平移地圖並放一個藍點 marker。
 * 需 HTTPS（正式站）＋使用者授權；失敗（拒絕/逾時/不支援）按鈕轉灰並以 title 提示。
 * 必須放在 @vis.gl `<Map>` 內（用到 useMap / MapControl / Marker）。
 */
export function MyLocationButton({ position = ControlPosition.RIGHT_CENTER }: Props) {
  const map = useMap()
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)

  function locate() {
    if (!map || typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true)
      return
    }
    setLocating(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPos(c)
        map.panTo(c)
        map.setZoom(Math.max(map.getZoom() ?? 14, 15))
        setLocating(false)
      },
      () => {
        setLocating(false)
        setDenied(true)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  return (
    <>
      <MapControl position={position}>
        <button
          onClick={locate}
          title={denied ? '無法取得定位（請確認瀏覽器已允許位置權限）' : '回到我的位置'}
          aria-label="回到我的位置"
          className="m-2.5 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:bg-gray-50"
        >
          {locating ? (
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              className={`w-5 h-5 ${denied ? 'text-gray-300' : 'text-blue-600'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="3.5" />
              <path strokeLinecap="round" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
            </svg>
          )}
        </button>
      </MapControl>

      {pos && (
        <Marker
          position={pos}
          zIndex={9999}
          title="我的位置"
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#1a73e8',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
        />
      )}
    </>
  )
}
