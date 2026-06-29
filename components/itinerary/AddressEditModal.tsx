'use client'

import { useEffect, useState } from 'react'
import { AddressAutocompleteInput } from '@/components/map/AddressAutocompleteInput'

export function AddressEditModal({
  open,
  title,
  description,
  value,
  onClose,
  onSave,
  saving,
}: {
  open: boolean
  title: string
  description?: string
  value: string
  onClose: () => void
  onSave: (address: string) => void
  saving?: boolean
}) {
  const [addr, setAddr] = useState(value)
  useEffect(() => {
    if (open) setAddr(value)
  }, [open, value])

  if (!open) return null

  const inputCls =
    'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-purple-400'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 -mr-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {description && (
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">{description}</p>
        )}

        <label className="block mb-5">
          <span className="text-sm text-gray-600 block mb-1">地址</span>
          <AddressAutocompleteInput
            value={addr}
            onChange={setAddr}
            placeholder="輸入地址或地名..."
            className={inputCls}
          />
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium active:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onSave(addr)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-500 text-white font-semibold active:bg-purple-600 disabled:opacity-60"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
