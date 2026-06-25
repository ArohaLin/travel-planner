'use client'

import { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { nanoid } from 'nanoid'
import type { Activity, ActivityType } from '@/lib/types/itinerary'
import { ActivityTypeValues } from '@/lib/types/itinerary'
import { timeToMinutes, minutesToTime } from '@/lib/utils/activityTime'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'

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
  /** 上傳卡片照片（壓縮＋傳 Storage），回傳公開 URL；提供時表單最上方顯示照片區 */
  onUploadPhoto?: (activityId: string, file: File) => Promise<string | null>
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

export function ActivityEditModal({ mode, initial, onSave, onClose, onUploadPhoto }: ActivityEditModalProps) {
  const [form, setForm] = useState<Activity>(() => ({
    ...emptyActivity(),
    ...initial,
    // ensure ID is set (for edit mode keep existing; for add mode generate new)
    id: initial?.id ?? nanoid(8),
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  // 卡片照片上傳狀態
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // 預覽：使用者上傳照片優先，其次 Google Places 代表照
  const previewSrc = form.userPhotoUrl ?? (form.photoRef ? `/api/photo?ref=${encodeURIComponent(form.photoRef)}` : null)

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadPhoto) return
    setUploadingPhoto(true); setPhotoError(null)
    try {
      const url = await onUploadPhoto(form.id, file)
      if (url) set('userPhotoUrl', url)
      else setPhotoError('上傳失敗，請換一張再試')
    } catch {
      setPhotoError('照片處理失敗，請換一張再試')
    } finally {
      setUploadingPhoto(false)
    }
  }
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

          {/* 卡片照片（最上方）：預覽 ＋ 上傳/換/移除 */}
          {onUploadPhoto && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">卡片照片</label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200 flex items-center justify-center">
                  {previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewSrc} alt="卡片照片預覽" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-4 4 3 3-2 6 4" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white active:scale-[0.98] transition disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <><span className="w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />上傳中…</>
                    ) : (previewSrc ? '換一張照片' : '上傳照片')}
                  </button>
                  {form.userPhotoUrl && !uploadingPhoto && (
                    <button type="button" onClick={() => set('userPhotoUrl', undefined)} className="text-xs text-gray-400 hover:text-red-500 self-start">
                      移除我的照片{form.photoRef ? '（改用系統圖）' : ''}
                    </button>
                  )}
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
              {photoError
                ? <p className="text-[11px] text-red-500 mt-1">{photoError}</p>
                : <p className="text-[11px] text-gray-400 mt-1">上傳後即可預覽；按下方「{mode === 'edit' ? '儲存' : '新增'}」才正式套用。</p>}
            </div>
          )}

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

          {/* 卡片精簡欄位（依類型顯示）*/}
          {form.type === 'transport' ? (
            <div className="space-y-3 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500">交通資訊（用於卡片精簡顯示）</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">起點</label>
                  <input type="text" value={form.fromLabel ?? ''} onChange={(e) => set('fromLabel', e.target.value || undefined)}
                    placeholder="例：台東市" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">終點</label>
                  <input type="text" value={form.toLabel ?? ''} onChange={(e) => set('toLabel', e.target.value || undefined)}
                    placeholder="例：富岡漁港" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">交通方式</label>
                <input type="text" value={form.transportMode ?? ''} onChange={(e) => set('transportMode', e.target.value || undefined)}
                  placeholder="例：自駕、步行、船" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>
          ) : form.type === 'food' ? (
            <div className="space-y-3 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500">餐飲資訊（用於卡片精簡顯示）</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">餐別</label>
                  <input type="text" value={form.mealType ?? ''} onChange={(e) => set('mealType', e.target.value || undefined)}
                    placeholder="例：午餐" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">地點</label>
                  <input type="text" value={form.placeLabel ?? ''} onChange={(e) => set('placeLabel', e.target.value || undefined)}
                    placeholder="例：台東市" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">飲食項目</label>
                <input type="text" value={form.foodItems ?? ''} onChange={(e) => set('foodItems', e.target.value || undefined)}
                  placeholder="例：臭豆腐、米苔目" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">地點簡稱（用於卡片顯示）</label>
              <input type="text" value={form.placeLabel ?? ''} onChange={(e) => set('placeLabel', e.target.value || undefined)}
                placeholder="例：太魯閣、台東市" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          )}

          {/* 特別強調（卡片下一行）*/}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">特別提醒（卡片強調，選填）</label>
            <input type="text" value={form.highlight ?? ''} onChange={(e) => set('highlight', e.target.value || undefined)}
              placeholder="例：山路18:30前需下山" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
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
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              placeholder="搜尋地點或輸入地址（可省略）"
              initialValue={initialAddress}
            />
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

          {/* 預約狀態（3 態，同步 bookingRequired）*/}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">預約狀態</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([['none', '無需預訂'], ['needed', '📅 需要預訂'], ['reserved', '✅ 已經預訂']] as const).map(([v, lbl]) => {
                const cur = form.reservationStatus ?? (form.bookingRequired ? 'needed' : 'none')
                return (
                  <button
                    key={v}
                    onClick={() => setForm((prev) => ({ ...prev, reservationStatus: v, bookingRequired: v !== 'none' }))}
                    className={clsx(
                      'text-sm py-2 px-1 rounded-xl border text-center transition-all leading-snug',
                      cur === v ? 'bg-purple-600 text-white border-purple-600 font-medium' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300',
                    )}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Booking URL (only when 需要/已預訂) */}
          {(form.reservationStatus ?? (form.bookingRequired ? 'needed' : 'none')) !== 'none' && (
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
