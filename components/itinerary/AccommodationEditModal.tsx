'use client'

import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import type { Accommodation, Money } from '@/lib/types/itinerary'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'

interface AccommodationEditModalProps {
  accommodation: Accommodation
  onSave: (updated: Accommodation) => void
  onClose: () => void
  /** 上傳卡片照片（壓縮＋傳 Storage），回傳公開 URL；提供時表單最上方顯示照片區 */
  onUploadPhoto?: (id: string, file: File) => Promise<string | null>
  /** 行程幣別（金額/訂金輸入用），預設 TWD */
  currency?: string
}

export function AccommodationEditModal({ accommodation, onSave, onClose, onUploadPhoto, currency = 'TWD' }: AccommodationEditModalProps) {
  const [name, setName] = useState(accommodation.name)
  const [address, setAddress] = useState(accommodation.location?.address ?? '')
  const [checkIn, setCheckIn] = useState(accommodation.checkInTime)
  const [checkOut, setCheckOut] = useState(accommodation.checkOutTime)
  const [bookingUrl, setBookingUrl] = useState(accommodation.bookingUrl ?? '')
  const [reservation, setReservation] = useState<'none' | 'needed' | 'reserved'>(accommodation.reservationStatus ?? 'needed')
  // 金額（每晚）/ 已付訂金
  const [costAmount, setCostAmount] = useState(accommodation.cost?.amount != null ? String(accommodation.cost.amount) : '')
  const [depositAmount, setDepositAmount] = useState(accommodation.depositPaid?.amount != null ? String(accommodation.depositPaid.amount) : '')
  // 詳情欄位
  const [intro, setIntro] = useState(accommodation.intro ?? '')
  const [tips, setTips] = useState(accommodation.tips ?? '')
  const [contact, setContact] = useState(accommodation.contact ?? '')
  const [notes, setNotes] = useState(accommodation.notes ?? '')
  // 訂房資訊
  const [bookingPlatform, setBookingPlatform] = useState(accommodation.bookingPlatform ?? '')
  const [orderNumber, setOrderNumber] = useState(accommodation.orderNumber ?? '')
  const [freeCancelBy, setFreeCancelBy] = useState(accommodation.freeCancelBy ?? '')
  // 照片
  const [userPhotoUrl, setUserPhotoUrl] = useState(accommodation.userPhotoUrl)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const initialAddress = accommodation.location?.address ?? ''
  const costCurrency = accommodation.cost?.currency ?? currency
  const depositCurrency = accommodation.depositPaid?.currency ?? currency
  const previewSrc = userPhotoUrl ?? (accommodation.photoRef ? `/api/photo?ref=${encodeURIComponent(accommodation.photoRef)}` : null)

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadPhoto) return
    setUploadingPhoto(true); setPhotoError(null)
    try {
      const url = await onUploadPhoto(accommodation.id, file)
      if (url) setUserPhotoUrl(url)
      else setPhotoError('上傳失敗，請換一張再試')
    } catch {
      setPhotoError('照片處理失敗，請換一張再試')
    } finally {
      setUploadingPhoto(false)
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = '請填入住宿名稱'
    if (!checkIn.match(/^\d{2}:\d{2}$/)) errs.checkIn = '格式為 HH:MM'
    if (!checkOut.match(/^\d{2}:\d{2}$/)) errs.checkOut = '格式為 HH:MM'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function parseMoney(amountStr: string, cur: string, prev?: Money): Money | undefined {
    const n = Number(amountStr.replace(/[, ]/g, ''))
    if (!amountStr.trim() || !Number.isFinite(n) || n < 0) return undefined
    return { amount: n, currency: cur, isEstimate: prev?.isEstimate ?? false }
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
      reservationStatus: reservation,
      cost: parseMoney(costAmount, costCurrency, accommodation.cost),
      bookingUrl: bookingUrl.trim() || undefined,
      bookingPlatform: bookingPlatform.trim() || undefined,
      orderNumber: orderNumber.trim() || undefined,
      depositPaid: parseMoney(depositAmount, depositCurrency, accommodation.depositPaid),
      freeCancelBy: freeCancelBy.trim() || undefined,
      intro: intro.trim() || undefined,
      tips: tips.trim() || undefined,
      contact: contact.trim() || undefined,
      notes: notes.trim() || undefined,
      userPhotoUrl: userPhotoUrl || undefined,
    }
    onSave(updated)
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500'
  const labelCls = 'text-xs font-semibold text-gray-500 mb-1 block'

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
          {/* 卡片照片（最上方）：上傳/換/移除 ＋ 兩種裁切預覽（行程列縮圖＋點開大圖）*/}
          {onUploadPhoto && (
            <div>
              <label className={labelCls}>住宿照片</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white active:scale-[0.98] transition disabled:opacity-60"
                >
                  {uploadingPhoto ? (
                    <><span className="w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />上傳中…</>
                  ) : (previewSrc ? '換一張照片' : '上傳照片')}
                </button>
                {userPhotoUrl && !uploadingPhoto && (
                  <button type="button" onClick={() => setUserPhotoUrl(undefined)} className="text-xs text-gray-400 hover:text-red-500">
                    移除{accommodation.photoRef ? '（改用系統圖）' : ''}
                  </button>
                )}
              </div>
              {previewSrc ? (
                <div className="flex gap-3 mt-2.5">
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="行程列縮圖預覽" className="w-14 h-14 rounded-xl object-cover bg-gray-100 border border-gray-200" />
                    <span className="text-[10px] text-gray-400 mt-1">行程列縮圖</span>
                  </div>
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="點開卡片大圖預覽" className="w-full h-24 rounded-xl object-cover bg-gray-100 border border-gray-200" />
                    <span className="text-[10px] text-gray-400 mt-1 text-center">點開卡片的大圖</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1.5">尚未設定照片</p>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
              {photoError
                ? <p className="text-[11px] text-red-500 mt-1">{photoError}</p>
                : <p className="text-[11px] text-gray-400 mt-1.5">兩種裁切都會用到；按下方「儲存」才正式套用。</p>}
            </div>
          )}

          {/* Name */}
          <div>
            <label className={labelCls}>住宿名稱 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              placeholder="例：台東知本老爺酒店"
              className={clsx('w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500', errors.name ? 'border-red-400' : 'border-gray-200')}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>地址</label>
            <AddressAutocomplete value={address} onChange={setAddress} placeholder="搜尋飯店地址（可省略）" initialValue={initialAddress} />
          </div>

          {/* Check-in / Check-out */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>入住時間 *</label>
              <input type="time" value={checkIn} onChange={(e) => { setCheckIn(e.target.value); setErrors(p => ({ ...p, checkIn: '' })) }}
                className={clsx('w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500', errors.checkIn ? 'border-red-400' : 'border-gray-200')} />
              {errors.checkIn && <p className="text-xs text-red-500 mt-1">{errors.checkIn}</p>}
            </div>
            <div className="flex-1">
              <label className={labelCls}>退房時間 *</label>
              <input type="time" value={checkOut} onChange={(e) => { setCheckOut(e.target.value); setErrors(p => ({ ...p, checkOut: '' })) }}
                className={clsx('w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500', errors.checkOut ? 'border-red-400' : 'border-gray-200')} />
              {errors.checkOut && <p className="text-xs text-red-500 mt-1">{errors.checkOut}</p>}
            </div>
          </div>

          {/* 每晚金額 */}
          <div>
            <label className={labelCls}>每晚金額（{costCurrency}）</label>
            <input type="number" inputMode="numeric" min={0} value={costAmount} onChange={(e) => setCostAmount(e.target.value)}
              placeholder="例：5200" className={inputCls} />
          </div>

          {/* 預約狀態 */}
          <div>
            <label className={labelCls}>預約狀態</label>
            <div className="grid grid-cols-3 gap-2">
              {([['none', '無需預訂'], ['needed', '📅 需要預訂'], ['reserved', '✅ 已經預訂']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setReservation(v)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${reservation === v ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 訂房資訊（需要/已預訂才顯示）*/}
          {reservation !== 'none' && (
            <div className="space-y-3 bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700">訂房資訊</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">訂房平台</label>
                  <input type="text" value={bookingPlatform} onChange={(e) => setBookingPlatform(e.target.value)} placeholder="例：Agoda / 官網" className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">訂單編號</label>
                  <input type="text" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="例：A1234567" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">訂房連結</label>
                <input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">訂金（{depositCurrency}）</label>
                  <input type="number" inputMode="numeric" min={0} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="例：1000" className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">最晚免費取消</label>
                  <input type="text" value={freeCancelBy} onChange={(e) => setFreeCancelBy(e.target.value)} placeholder="例：2026-06-20 23:59 前" className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {/* 說明 */}
          <div>
            <label className={labelCls}>說明 / 介紹</label>
            <textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="住宿介紹、特色（可省略）" className={clsx(inputCls, 'resize-none')} />
          </div>
          {/* 重要事項 */}
          <div>
            <label className={labelCls}>重要事項</label>
            <textarea rows={2} value={tips} onChange={(e) => setTips(e.target.value)} placeholder="入住須知、停車、早餐時間等（可省略）" className={clsx(inputCls, 'resize-none')} />
          </div>
          {/* 聯絡資訊 */}
          <div>
            <label className={labelCls}>聯絡資訊</label>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="電話 / Email / 訂房人（可省略）" className={inputCls} />
          </div>
          {/* 備註 */}
          <div>
            <label className={labelCls}>備註</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="備忘事項（可省略）" className={clsx(inputCls, 'resize-none')} />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 px-5 pt-3 flex gap-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <button onClick={onClose} className="flex-1 py-3 text-sm text-gray-600 border border-gray-200 rounded-2xl">取消</button>
          <button onClick={handleSave} className="flex-1 py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl active:scale-95 transition-all">儲存</button>
        </div>
      </div>
    </>
  )
}
