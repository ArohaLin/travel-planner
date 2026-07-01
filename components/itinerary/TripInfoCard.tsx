'use client'

import { useState } from 'react'
import type { TripMetadata, MemberProfile } from '@/lib/types/itinerary'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { AddressAutocompleteInput } from '@/components/map/AddressAutocompleteInput'

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
  // #39：預設收合，只顯示地點與日期；點開才看詳細
  const [expanded, setExpanded] = useState(false)
  const { showToast } = useToast()

  // Edit form state — initialized from metadata
  const [form, setForm] = useState({
    title: metadata.title,
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    originCity: metadata.originCity,
    originAddress: metadata.originAddress ?? '',
    returnCity: metadata.returnCity ?? metadata.originCity,
    returnAddress: metadata.returnAddress ?? '',
    transitCities: metadata.transitCities ?? [],
    preferredTransport: metadata.preferredTransport ?? [],
    memberProfiles: metadata.memberProfiles ?? ([] as MemberProfile[]),
    userNotes: metadata.userNotes ?? '',
    aiMemory: metadata.aiMemory ?? '',
  })

  function openEdit() {
    setForm({
      title: metadata.title,
      startDate: metadata.startDate,
      endDate: metadata.endDate,
      originCity: metadata.originCity,
      originAddress: metadata.originAddress ?? '',
      returnCity: metadata.returnCity ?? metadata.originCity,
      returnAddress: metadata.returnAddress ?? '',
      transitCities: metadata.transitCities ?? [],
      preferredTransport: metadata.preferredTransport ?? [],
      memberProfiles: metadata.memberProfiles ?? [],
      userNotes: metadata.userNotes ?? '',
      aiMemory: metadata.aiMemory ?? '',
    })
    setEditing(true)
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
        originAddress: form.originAddress.trim() || undefined,
        returnCity: form.returnCity.trim() || form.originCity.trim() || metadata.originCity,
        returnAddress: form.returnAddress.trim() || undefined,
        transitCities: form.transitCities.length > 0 ? form.transitCities : undefined,
        preferredTransport: form.preferredTransport.length > 0 ? form.preferredTransport : undefined,
        memberProfiles: form.memberProfiles.some((m) => m.age || m.gender) ? form.memberProfiles : undefined,
        userNotes: form.userNotes.trim() || undefined,
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
    // 收合列摘要：地點（路線）＋日期
    const fmtMD = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`
    const routeSummary = [
      metadata.originCity,
      ...(metadata.transitCities ?? []),
      metadata.destination,
      ...(metadata.returnCity && metadata.returnCity !== metadata.originCity ? [metadata.returnCity] : []),
    ].join(' → ')

    return (
      <div className="mx-4 mt-3 mb-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* 收合列（#39 預設只顯示地點與日期，點擊展開詳細） */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left min-h-[44px]"
        >
          <span className="flex-shrink-0">📍</span>
          <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{routeSummary}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {fmtMD(metadata.startDate)} – {fmtMD(metadata.endDate)}
          </span>
          <svg
            className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {expanded && (
        <>
        <div className="px-4 pt-1 pb-1 flex items-center justify-between border-t border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 py-2">行程資訊</h2>
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

        <div className="px-4 pb-3 space-y-2 text-sm">
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

          {/* 精確地址（若有設定）*/}
          {(metadata.originAddress || metadata.returnAddress) && (
            <InfoRow label="地址">
              <div className="space-y-0.5">
                {metadata.originAddress && (
                  <div className="text-xs text-gray-600">起：{metadata.originAddress}</div>
                )}
                {metadata.returnAddress && (
                  <div className="text-xs text-gray-600">終：{metadata.returnAddress}</div>
                )}
              </div>
            </InfoRow>
          )}

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

          {/* 旅遊風格已移除顯示（#22）*/}

          {/* Budget */}
          {metadata.totalBudget && (
            <InfoRow label="預算">
              <span className="text-gray-800">
                {metadata.totalBudget.amount.toLocaleString()} {metadata.totalBudget.currency}
              </span>
            </InfoRow>
          )}

          {/* 人工補充（#48）：使用者親手寫、AI 唯讀，優先於 AI 記憶 */}
          {metadata.userNotes && metadata.userNotes.trim() && (
            <div className="pt-2 mt-1 border-t border-gray-50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">📌</span>
                <span className="text-xs font-medium text-amber-600">人工補充</span>
                <span className="text-[10px] text-gray-400">（你親自寫的固定須知，AI 只會遵守、不會改動）</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-amber-50/60 rounded-xl px-3 py-2">
                {metadata.userNotes}
              </p>
            </div>
          )}

          {/* AI 記憶（#15；#48 收斂為只存偏好）*/}
          {metadata.aiMemory && metadata.aiMemory.trim() && (
            <div className="pt-2 mt-1 border-t border-gray-50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-medium text-purple-600">AI 記憶</span>
                <span className="text-[10px] text-gray-400">（只存偏好，AI 每次討論自動維護，可手動編輯）</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-purple-50/50 rounded-xl px-3 py-2">
                {metadata.aiMemory}
              </p>
            </div>
          )}
        </div>
        </>
        )}
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

        {/* 起點／終點精確地址（地圖用）*/}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              起點地址
              <span className="text-[10px] text-gray-400 font-normal ml-1">（選填，地圖第一段路線更精確）</span>
            </label>
            <AddressAutocompleteInput
              value={form.originAddress}
              onChange={(v) => setForm((p) => ({ ...p, originAddress: v }))}
              placeholder="例：新竹縣竹北市光明六路東二段..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              終點地址
              <span className="text-[10px] text-gray-400 font-normal ml-1">（選填，空白沿用起點地址）</span>
            </label>
            <AddressAutocompleteInput
              value={form.returnAddress}
              onChange={(v) => setForm((p) => ({ ...p, returnAddress: v }))}
              placeholder="同起點可留空"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* 中途城市編輯已移除（#23）*/}

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

        {/* 人工補充（#48）：使用者親手維護、AI 唯讀，放「一定要／一定不要」的具體安排 */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1 flex items-center gap-1 flex-wrap">
            📌 人工補充
            <span className="text-[10px] text-gray-400 font-normal">（你親自寫、AI 只會遵守不會改動；放「一定要／一定不要」的具體安排）</span>
          </label>
          <textarea
            value={form.userNotes}
            onChange={(e) => setForm((p) => ({ ...p, userNotes: e.target.value }))}
            rows={4}
            placeholder="例：・第2晚一定要住海景房　・絕對不要安排水上活動（怕水）　・回程班機 18:30，當天下午請預留時間別排太滿"
            className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30"
          />
        </div>

        {/* AI 記憶（#15；#48 收斂為只存偏好）*/}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1 flex items-center gap-1 flex-wrap">
            🧠 AI 記憶
            <span className="text-[10px] text-gray-400 font-normal">（只存偏好，AI 每次討論自動維護；具體「一定要／一定不要」請寫上面人工補充）</span>
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
