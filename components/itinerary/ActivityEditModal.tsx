'use client'

import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { nanoid } from 'nanoid'
import type { Activity, ActivityType } from '@/lib/types/itinerary'
import { ActivityTypeValues } from '@/lib/types/itinerary'
import { timeToMinutes, minutesToTime } from '@/lib/utils/activityTime'

const TYPE_LABELS: Record<ActivityType, string> = {
  sightseeing: '🏛️ 觀光',
  food: '🍽️ 餐飲',
  shopping: '🛍️ 購物',
  transport: '🚌 交通',
  experience: '🎯 體驗',
  nature: '🌿 自然',
  rest: '😌 休息',
  other: '📌 其他',
}

interface ActivityEditModalProps {
  mode: 'edit' | 'add'
  initial?: Partial<Activity>
  onSave: (activity: Activity) => void
  onClose: () => void
}

function emptyActivity(): Activity {
  return {
    id: nanoid(8),
    type: 'sightseeing',
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    bookingRequired: false,
  }
}

export function ActivityEditModal({ mode, initial, onSave, onClose }: ActivityEditModalProps) {
  const [form, setForm] = useState<Activity>(() => ({
    ...emptyActivity(),
    ...initial,
    // ensure ID is set (for edit mode keep existing; for add mode generate new)
    id: initial?.id ?? nanoid(8),
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  // 地址欄位（對應 location.address），與座標一起管理
  const [address, setAddress] = useState<string>(initial?.location?.address ?? '')
  // 記住初始地址，用以判斷使用者是否真的改了地址 → 改了則清空座標以重新定位
  const initialAddress = initial?.location?.address ?? ''

  // Sync if initial changes (shouldn't in normal usage, but just in case)
  useEffect(() => {
    if (initial) {
      setForm((prev) => ({ ...prev, ...initial, id: initial.id ?? prev.id }))
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof Activity>(key: K, value: Activity[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => { const next = { ...prev }; delete next[key as string]; return next })
  }

  /**
   * 調整開始時間時，自動保持活動時長不變（同步 shift 結束時間）。
   * 如果目前有 endTime 且格式合法，計算舊的 duration 並加到新的 startTime 上。
   */
  function handleStartTimeChange(value: string) {
    const isValidTime = /^\d{2}:\d{2}$/.test(value)
    if (!isValidTime || !form.endTime) {
      set('startTime', value)
      return
    }
    const oldStartMin = timeToMinutes(form.startTime)
    const oldEndMin = timeToMinutes(form.endTime)
    const duration = oldEndMin - oldStartMin
    if (duration > 0) {
      const newStartMin = timeToMinutes(value)
      const newEndMin = Math.min(newStartMin + duration, 23 * 60 + 59)
      setForm((prev) => ({
        ...prev,
        startTime: value,
        endTime: minutesToTime(newEndMin),
      }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next.startTime
        delete next.endTime
        return next
      })
    } else {
      set('startTime', value)
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = '請填入名稱'
    if (!form.startTime.match(/^\d{2}:\d{2}$/)) errs.startTime = '格式為 HH:MM'
    if (form.endTime && !form.endTime.match(/^\d{2}:\d{2}$/)) errs.endTime = '格式為 HH:MM'
    if (form.endTime && form.endTime <= form.startTime) errs.endTime = '結束時間需晚於開始時間'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSave() {
    if (!validate()) return

    // 處理地址 / 座標：
    // - 地址有改 → 清空舊座標，留下新地址，讓地圖下次自動重新 geocode
    // - 地址沒改 → 保留原本的 location（含座標）
    const trimmedAddress = address.trim()
    const addressChanged = trimmedAddress !== initialAddress.trim()
    let location = form.location
    if (addressChanged) {
      location = trimmedAddress
        ? { lat: 0, lng: 0, address: trimmedAddress } // 座標歸零 → 觸發重新定位
        : undefined
    }

    // Clean up empty optional fields
    const cleaned: Activity = {
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      endTime: form.endTime?.trim() || undefined,
      intro: form.intro?.trim() || undefined,
      transport: form.transport?.trim() || undefined,
      recommendation: form.recommendation?.trim() || undefined,
      tips: form.tips?.trim() || undefined,
      location,
    }
    onSave(cleaned)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-base">
            {mode === 'edit' ? '編輯活動' : '新增活動'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Type selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">類別</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(ActivityTypeValues as readonly ActivityType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={clsx(
                    'text-xs py-1.5 px-1 rounded-xl border text-center transition-all leading-snug',
                    form.type === t
                      ? 'bg-purple-600 text-white border-purple-600 font-medium'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300',
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">名稱 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="例：築地市場散步"
              className={clsx(
                'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                errors.title ? 'border-red-400' : 'border-gray-200',
              )}
            />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          {/* Time range */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">開始時間 *</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className={clsx(
                  'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                  errors.startTime ? 'border-red-400' : 'border-gray-200',
                )}
              />
              {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">結束時間</label>
              <input
                type="time"
                value={form.endTime ?? ''}
                onChange={(e) => set('endTime', e.target.value || undefined)}
                className={clsx(
                  'w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500',
                  errors.endTime ? 'border-red-400' : 'border-gray-200',
                )}
              />
              {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">說明</label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value || undefined)}
              placeholder="活動說明（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* 詳情欄位 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">介紹 / 安排理由</label>
            <textarea
              rows={2}
              value={form.intro ?? ''}
              onChange={(e) => set('intro', e.target.value || undefined)}
              placeholder="景點介紹或為何這樣安排（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">交通方式</label>
            <textarea
              rows={2}
              value={form.transport ?? ''}
              onChange={(e) => set('transport', e.target.value || undefined)}
              placeholder="如何前往、交通時間（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">推薦 / 名產</label>
            <textarea
              rows={2}
              value={form.recommendation ?? ''}
              onChange={(e) => set('recommendation', e.target.value || undefined)}
              placeholder="推薦活動、飲食或當地名產（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">貼心提醒</label>
            <textarea
              rows={2}
              value={form.tips ?? ''}
              onChange={(e) => set('tips', e.target.value || undefined)}
              placeholder="注意事項、最佳時段或小撇步（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">地點 / 地址</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例：台東縣台東市中山路 100 號（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {address.trim() !== initialAddress.trim() && (
              <p className="text-xs text-amber-600 mt-1">📍 地址已變更，地圖將自動重新定位</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">備註</label>
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || undefined)}
              placeholder="備忘事項（可省略）"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Booking required */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set('bookingRequired', !form.bookingRequired)}
              className={clsx(
                'w-10 h-6 rounded-full relative transition-colors flex-shrink-0',
                form.bookingRequired ? 'bg-purple-600' : 'bg-gray-200',
              )}
            >
              <span
                className={clsx(
                  'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  form.bookingRequired ? 'translate-x-5' : 'translate-x-1',
                )}
              />
            </div>
            <span className="text-sm text-gray-700">需要預訂</span>
          </label>

          {/* Booking URL (only when bookingRequired) */}
          {form.bookingRequired && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">預訂連結</label>
              <input
                type="url"
                value={form.bookingUrl ?? ''}
                onChange={(e) => set('bookingUrl', e.target.value || undefined)}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div
          className="flex-shrink-0 border-t border-gray-100 px-5 pt-3 flex gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm text-gray-600 border border-gray-200 rounded-2xl hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl hover:bg-purple-700 active:scale-95 transition-all"
          >
            {mode === 'edit' ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </>
  )
}
