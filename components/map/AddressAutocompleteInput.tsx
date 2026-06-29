'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * 文字輸入框，內建 Google Places Autocomplete 地址建議。
 * 必須在 <APIProvider> 的後代元件中使用（useMapsLibrary 需要 context）。
 */
export function AddressAutocompleteInput({ value, onChange, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const places = useMapsLibrary('places')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!places || !inputRef.current) return

    const autocomplete = new places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'tw' },
      fields: ['formatted_address'],
    })

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (place.formatted_address) {
        onChangeRef.current(place.formatted_address)
      }
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [places])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  )

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      autoComplete="off"
      className={className}
    />
  )
}
