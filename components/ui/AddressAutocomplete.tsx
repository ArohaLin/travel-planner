'use client'

import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** 初始地址（用來判斷是否有改動） */
  initialValue?: string
}

/**
 * 地址輸入框（含 Google Places Autocomplete 預測）
 * 必須在 APIProvider 內使用（由 ItineraryClient 提供）。
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = '搜尋地址或地點名稱...',
  className = '',
  initialValue,
}: AddressAutocompleteProps) {
  const placesLib = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [internalValue, setInternalValue] = useState(value)

  // Sync internal value when prop changes from outside (e.g. initial load)
  useEffect(() => {
    setInternalValue(value)
  }, [value])

  useEffect(() => {
    if (!placesLib || !inputRef.current) return
    if (autocompleteRef.current) return // already init

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'tw' }, // 台灣優先
      fields: ['formatted_address', 'name', 'geometry'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const addr = place.formatted_address || place.name || ''
      setInternalValue(addr)
      onChange(addr)
    })

    autocompleteRef.current = autocomplete

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib])

  const hasChanged = internalValue.trim() !== (initialValue ?? '').trim()

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={(e) => {
          setInternalValue(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
          className || 'border-gray-200'
        }`}
        autoComplete="off"
      />
      {hasChanged && (
        <p className="text-xs text-amber-600 mt-1">📍 地址已變更，地圖將自動重新定位</p>
      )}
    </div>
  )
}
