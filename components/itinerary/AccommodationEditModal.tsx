'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import type { Accommodation } from '@/lib/types/itinerary'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'

interface AccommodationEditModalProps {
  accommodation: Accommodation
  onSave: (updated: Accommodation) => void
  onClose: () => void
}

export function AccommodationEditModal({ accommodation, onSave, onClose }: AccommodationEditModalProps) {
  const [name, setName] = useState(accommodation.name)
  const [address, setAddress] = useState(accommodation.location?.address ?? '')
  const [checkIn, setCheckIn] = useState(accommodation.checkInTime)
  const [checkOut, setCheckOut] = useState(accommodation.checkOutTime)
  const [bookingUrl, setBookingUrl] = useState(accommodation.bookingUrl ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialAddress = accommodation.location?.address ?? ''

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = '請填入住宿名稱'
    if (!checkIn.match(/^\d{2}:\d{2}$/)) errs.checkIn = '格式為 HH:MM'
    if (!checkOut.match(/^\d{2}:\d{2}$/)) errs.checkOut = '格式為 HH:MM'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSave() {
    if (!validate()) return
    const addressChanged = address.trim() !== initialAddress.trim()
    const newLocation = address.trim()
      ? addressChanged
        ? { lat: 0, lng: 0, address: address.trim() } // 清座標，等地圖重新定位
        : accommodation.location
      : { lat: 0, lng: 0 }
    const updated: Accommodation = {
      ...accommodation,
      name: name.trim(),
      location: newLocation ?? { lat: 0, lng: 0 },
      checkInTime: checkIn,
      checkOutTime: checkOut,
      bookingUrl: bookingUrl.trim() || undefined,
    }
    onSave(updated)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90dvh' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-base">編輯住宿</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">住宿名稱 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              placeholder="例：台東知本老爺酒店"
              className={clsx(
                'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                errors.name ? 'border-red-400' : 'border-gray-200',
              )}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">地址</label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              placeholder="搜尋飯店地址（可省略）"
              initialValue={initialAddress}
            />
          </div>

          {/* Check-in / Check-out */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">入住時間 *</label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => { setCheckIn(e.target.value); setErrors(p => ({ ...p, checkIn: '' })) }}
                className={clsx(
                  'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                  errors.checkIn ? 'border-red-400' : 'border-gray-200',
                )}
              />
              {errors.checkIn && <p className="text-xs text-red-500 mt-1">{errors.checkIn}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">退房時間 *</label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => { setCheckOut(e.target.value); setErrors(p => ({ ...p, checkOut: '' })) }}
                className={clsx(
                  'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                  errors.checkOut ? 'border-red-400' : 'border-gray-200',
                )}
              />
              {errors.checkOut && <p className="text-xs text-red-500 mt-1">{errors.checkOut}</p>}
            </div>
          </div>

          {/* Booking URL */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">訂房連結</label>
            <input
              type="url"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div
          className="flex-shrink-0 border-t border-gray-100 px-5 pt-3 flex gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <button onClick={onClose} className="flex-1 py-3 text-sm text-gray-600 border border-gray-200 rounded-2xl">
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl active:scale-95 transition-all"
          >
            儲存
          </button>
        </div>
      </div>
    </>
  )
}
