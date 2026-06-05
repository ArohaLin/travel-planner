'use client'

import { useState } from 'react'
import type { TripMetadata, MemberProfile } from '@/lib/types/itinerary'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

const TRANSPORT_OPTIONS = [
  { value: '飛機', emoji: '✈️' },
  { value: '高鐵', emoji: '🚄' },
  { value: '火車', emoji: '🚂' },
  { value: '客運', emoji: '🚌' },
  { value: '自駕', emoji: '🚗' },
  { value: '渡輪', emoji: '⛴️' },
]

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女', other: '不指定' }

interface TripInfoCardProps {
  metadata: TripMetadata
  itineraryId: string
  canEdit: boolean
  onMetadataUpdated?: (newMetadata: TripMetadata) => void
  /** 日期變更時交由父層處理（可能涉及天數增減）；回傳 true 表示已處理（不需自行存 metadata 的日期） */
  onDatesChange?: (startDate: string, endDate: string) => void
}

export function TripInfoCard({ metadata, itineraryId, canEdit, onMetadataUpdated, onDatesChange }: TripInfoCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  // Edit form state — initialized from metadata
  const [form, setForm] = useState({
    title: metadata.title,
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    originCity: metadata.originCity,
    returnCity: metadata.returnCity ?? metadata.originCity,
    transitCities: metadata.transitCities ?? [],
    preferredTransport: metadata.preferredTransport ?? [],
    memberProfiles: metadata.memberProfiles ?? ([] as MemberProfile[]),
    aiMemory: metadata.aiMemory ?? '',
  })
  const [transitInput, setTransitInput] = useState('')

  function openEdit() {
    setForm({
      title: metadata.title,
      startDate: metadata.startDate,
      endDate: metadata.endDate,
      originCity: metadata.originCity,
      returnCity: metadata.returnCity ?? metadata.originCity,
      transitCities: metadata.transitCities ?? [],
      preferredTransport: metadata.preferredTransport ?? [],
      memberProfiles: metadata.memberProfiles ?? [],
      aiMemory: metadata.aiMemory ?? '',
    })
    setTransitInput('')
    setEditing(true)
  }

  function addTransitCity() {
    const city = transitInput.trim()
    if (city && !form.transitCities.includes(city)) {
      setForm((prev) => ({ ...prev, transitCities: [...prev.transitCities, city] }))
    }
    setTransitInput('')
  }

  function removeTransitCity(city: string) {
    setForm((prev) => ({ ...prev, transitCities: prev.transitCities.filter((c) => c !== city) }))
  }

  function toggleTransport(value: string) {
    setForm((prev) => ({
      ...prev,
      preferredTransport: prev.preferredTransport.includes(value)
        ? prev.preferredTransport.filter((t) => t !== value)
        : [...prev.preferredTransport, value],
    }))
  }

  function updateMemberProfile(index: number, field: keyof MemberProfile, value: unknown) {
    setForm((prev) => {
      const profiles = [...prev.memberProfiles]
      profiles[index] = { ...profiles[index], [field]: value }
      return { ...prev, memberProfiles: profiles }
    })
  }

  async function handleSave() {
    // 日期有變更 → 交給父層處理（可能涉及天數增減的提示與選項）
    const datesChanged =
      form.startDate !== metadata.startDate || form.endDate !== metadata.endDate
    if (datesChanged) {
      if (form.endDate < form.startDate) {
        showToast('回程日期不能早於出發日期', 'error')
        return
      }
      setEditing(false)
      onDatesChange?.(form.startDate, form.endDate)
      return
    }

    setSaving(true)
    try {
      const patchedMetadata: Partial<TripMetadata> = {
        title: form.title.trim() || metadata.title,
        originCity: form.originCity.trim() || metadata.originCity,
        returnCity: form.returnCity.trim() || form.originCity.trim() || metadata.originCity,
        transitCities: form.transitCities.length > 0 ? form.transitCities : undefined,
        preferredTransport: form.preferredTransport.length > 0 ? form.preferredTransport : undefined,
        memberProfiles: form.memberProfiles.some((m) => m.age || m.gender) ? form.memberProfiles : undefined,
        aiMemory: form.aiMemory.trim() || undefined,
      }

      const res = await fetch(`/api/itinerary/${itineraryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: patchedMetadata }),
      })

      if (res.ok) {
        const data = await res.json()
        showToast('行程資訊已更新', 'success')
        setEditing(false)
        onMetadataUpdated?.({ ...metadata, ...patchedMetadata, ...data.metadata })
      } else {
        const d = await res.json()
        showToast(d.error ?? '更新失敗', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Read-only view ───────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="mx-4 mt-3 mb-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">行程資訊</h2>
          {canEdit && (
            <button
              onClick={openEdit}
              className="text-xs text-purple-600 font-medium flex items-center gap-1 tap-target"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              編輯
            </button>
          )}
        </div>

        <div className="px-4 py-3 space-y-2 text-sm">
          {/* Route */}
          <InfoRow label="路線">
            <span className="text-gray-800">
              {metadata.originCity}
              {metadata.transitCities && metadata.transitCities.length > 0 && (
                <> → {metadata.transitCities.join(' → ')}</>
              )}
              {' → '}{metadata.destination}
              {metadata.returnCity && metadata.returnCity !== metadata.originCity && (
                <> → {metadata.returnCity}</>
              )}
            </span>
          </InfoRow>

          {/* Transport */}
          {metadata.preferredTransport && metadata.preferredTransport.length > 0 && (
            <InfoRow label="交通方式">
              <span className="text-gray-800">
                {metadata.preferredTransport.map((t) => {
                  const opt = TRANSPORT_OPTIONS.find((o) => o.value === t)
                  return opt ? `${opt.emoji} ${opt.value}` : t
                }).join('　')}
              </span>
            </InfoRow>
          )}

          {/* Travelers */}
          <InfoRow label="出行人數">
            <span className="text-gray-800">{metadata.travelers} 人</span>
          </InfoRow>

          {/* Member profiles */}
          {metadata.memberProfiles && metadata.memberProfiles.some((m) => m.age || m.gender) && (
            <InfoRow label="成員資訊">
              <div className="flex flex-wrap gap-1.5">
                {metadata.memberProfiles.map((m, i) => (
                  <span key={i} className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                    {i === 0 ? '本人' : `成員${i + 1}`}
                    {m.age ? ` ${m.age}歲` : ''}
                    {m.gender ? ` ${GENDER_LABELS[m.gender] ?? ''}` : ''}
                  </span>
                ))}
              </div>
            </InfoRow>
          )}

          {/* Style */}
          {metadata.style && metadata.style.length > 0 && (
            <InfoRow label="旅遊風格">
              <div className="flex flex-wrap gap-1">
                {metadata.style.map((s) => (
                  <span key={s} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </InfoRow>
          )}

          {/* Budget */}
          {metadata.totalBudget && (
            <InfoRow label="預算">
              <span className="text-gray-800">
                {metadata.totalBudget.amount.toLocaleString()} {metadata.totalBudget.currency}
              </span>
            </InfoRow>
          )}

          {/* AI 記憶（#15）*/}
          {metadata.aiMemory && metadata.aiMemory.trim() && (
            <div className="pt-2 mt-1 border-t border-gray-50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-medium text-purple-600">AI 記憶</span>
                <span className="text-[10px] text-gray-400">（AI 會在每次討論時參考，可點編輯修改）</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-purple-50/50 rounded-xl px-3 py-2">
                {metadata.aiMemory}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Edit form ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-4 mt-3 mb-1 bg-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">編輯行程資訊</h2>
        <button onClick={() => setEditing(false)} className="text-gray-400 tap-target">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">行程名稱</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* 日期 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">出發日期</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">回程日期</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {(form.startDate !== metadata.startDate || form.endDate !== metadata.endDate) && (
            <p className="col-span-2 text-xs text-amber-600">📅 日期有變更，儲存後若天數改變會提供處理選項</p>
          )}
        </div>

        {/* Origin / Return */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">出發城市</label>
            <input
              type="text"
              value={form.originCity}
              onChange={(e) => setForm((p) => ({ ...p, originCity: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">返回城市</label>
            <input
              type="text"
              value={form.returnCity}
              onChange={(e) => setForm((p) => ({ ...p, returnCity: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Transit cities */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">中途城市</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={transitInput}
              onChange={(e) => setTransitInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTransitCity() } }}
              placeholder="輸入城市後按 Enter"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={addTransitCity}
              className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium"
            >
              新增
            </button>
          </div>
          {form.transitCities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.transitCities.map((city) => (
                <span
                  key={city}
                  className="flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full"
                >
                  {city}
                  <button onClick={() => removeTransitCity(city)} className="hover:text-purple-900">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Transport */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-2">偏好交通方式</label>
          <div className="flex flex-wrap gap-2">
            {TRANSPORT_OPTIONS.map((opt) => {
              const selected = form.preferredTransport.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleTransport(opt.value)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  {opt.emoji} {opt.value}
                </button>
              )
            })}
          </div>
        </div>

        {/* Member profiles */}
        {form.memberProfiles.length > 0 && (
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">成員資訊</label>
            <div className="space-y-2">
              {form.memberProfiles.map((member, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12 flex-shrink-0">
                    {i === 0 ? '本人' : `成員${i + 1}`}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={member.age ?? ''}
                    onChange={(e) => updateMemberProfile(i, 'age', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="年齡"
                    className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="flex gap-1">
                    {(['male', 'female', 'other'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updateMemberProfile(i, 'gender', member.gender === g ? undefined : g)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          member.gender === g
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'bg-white border-gray-200 text-gray-500'
                        }`}
                      >
                        {GENDER_LABELS[g]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI 記憶（#15）*/}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1 flex items-center gap-1">
            🧠 AI 記憶
            <span className="text-[10px] text-gray-400 font-normal">（AI 每次討論會參考並自動更新；你也可手動編輯）</span>
          </label>
          <textarea
            value={form.aiMemory}
            onChange={(e) => setForm((p) => ({ ...p, aiMemory: e.target.value }))}
            rows={4}
            placeholder="例：・偏好步調輕鬆，不要太早起　・小孩會暈船，避免長時間搭船　・喜歡在地小吃勝過餐廳"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="px-4 pb-4 flex gap-3">
        <button
          onClick={() => setEditing(false)}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          取消
        </button>
        <Button onClick={handleSave} loading={saving} className="flex-1">
          儲存
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-16 flex-shrink-0 text-xs pt-0.5">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
