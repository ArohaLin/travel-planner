'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { COMMON_CURRENCIES, getCurrencyName } from '@/lib/utils/currency'
import type { MemberProfile } from '@/lib/types/itinerary'
import { useModelPreference } from '@/lib/hooks/useModelPreference'
import clsx from 'clsx'

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLES = [
  '文青', '美食', '親子', '購物', '自然', '歷史文化',
  '小資省錢', '奢華享受', '冒險體驗', '放鬆慢遊',
]

const TRANSPORT_OPTIONS = [
  { value: '飛機', emoji: '✈️' },
  { value: '高鐵', emoji: '🚄' },
  { value: '火車', emoji: '🚂' },
  { value: '客運', emoji: '🚌' },
  { value: '自駕', emoji: '🚗' },
  { value: '渡輪', emoji: '⛴️' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '不指定' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewItineraryPage() {
  const router = useRouter()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [tripTitle, setTripTitle]         = useState('')
  const [destination, setDestination]     = useState('')
  const [startDate, setStartDate]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [originCity, setOriginCity]       = useState('台北')
  const [returnCity, setReturnCity]       = useState('')
  const [transitCities, setTransitCities] = useState<string[]>([])
  const [transitInput, setTransitInput]   = useState('')
  const [selectedTransport, setSelectedTransport] = useState<string[]>([])
  const [travelers, setTravelers]         = useState(2)
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([
    { age: undefined, gender: undefined },
    { age: undefined, gender: undefined },
  ])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [currency, setCurrency]           = useState('TWD')
  const [budget, setBudget]               = useState('')
  const [specialRequests, setSpecialRequests] = useState('')

  // ── Page state ──────────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [validationError, setValidationError] = useState('')

  // ── Model preference ─────────────────────────────────────────────────────────
  const { modelProvider, setModelProvider } = useModelPreference()

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function totalDays(): number {
    if (!startDate || !endDate) return 0
    const diff = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
    ) + 1
    return diff > 0 ? diff : 0
  }

  function toggleStyle(s: string) {
    setSelectedStyles((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])
  }

  function toggleTransport(t: string) {
    setSelectedTransport((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])
  }

  function addTransitCity() {
    const city = transitInput.trim()
    if (city && !transitCities.includes(city)) setTransitCities((p) => [...p, city])
    setTransitInput('')
  }

  function removeTransitCity(city: string) {
    setTransitCities((p) => p.filter((c) => c !== city))
  }

  function updateTravelers(n: number) {
    const clamped = Math.max(1, Math.min(20, n))
    setTravelers(clamped)
    setMemberProfiles((prev) => {
      if (clamped > prev.length)
        return [...prev, ...Array(clamped - prev.length).fill(null).map(() => ({ age: undefined, gender: undefined }))]
      return prev.slice(0, clamped)
    })
  }

  function updateMember(idx: number, field: keyof MemberProfile, value: unknown) {
    setMemberProfiles((p) => p.map((m, i) => i === idx ? { ...m, [field]: value || undefined } : m))
  }

  // ── Validation & confirm ─────────────────────────────────────────────────────

  function handleConfirm() {
    setValidationError('')
    if (!destination.trim())    return setValidationError('請填寫目的地')
    if (!startDate)             return setValidationError('請選擇出發日期')
    if (!endDate)               return setValidationError('請選擇回程日期')
    if (totalDays() <= 0)       return setValidationError('回程日期必須晚於出發日期')
    if (!originCity.trim())     return setValidationError('請填寫出發城市')
    if (selectedStyles.length === 0) return setValidationError('請至少選擇一種旅遊風格')
    setShowConfirm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripTitle: tripTitle.trim() || undefined,
          destination,
          originCity,
          returnCity: returnCity.trim() || originCity,
          transitCities: transitCities.length > 0 ? transitCities : undefined,
          preferredTransport: selectedTransport.length > 0 ? selectedTransport : undefined,
          startDate,
          endDate,
          totalDays: totalDays(),
          travelers,
          memberProfiles: memberProfiles.some((m) => m.age || m.gender) ? memberProfiles : undefined,
          currency,
          style: selectedStyles,
          totalBudget: budget ? parseInt(budget) : undefined,
          specialRequests: specialRequests.trim() || undefined,
          modelProvider,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '生成失敗，請再試一次'); setLoading(false); return }
      router.push(`/itinerary/${data.itineraryId}`)
    } catch {
      setError('網路錯誤，請再試一次')
      setLoading(false)
    }
  }

  // ── Section divider ──────────────────────────────────────────────────────────

  function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
      <h2 className="text-sm font-semibold text-purple-700 uppercase tracking-wide pt-2 pb-1 border-b border-purple-100">
        {children}
      </h2>
    )
  }

  // ── Confirm view ─────────────────────────────────────────────────────────────

  if (showConfirm) {
    const routeParts = [originCity, ...transitCities, destination]
    if (returnCity && returnCity !== originCity) routeParts.push(returnCity)

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div
          className="bg-white border-b border-gray-100 px-4 pb-4 sticky top-0 z-10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="tap-target flex items-center text-gray-500 -ml-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h1 className="font-semibold text-gray-900">確認行程資訊</h1>
              <p className="text-xs text-gray-400">確認後 AI 將開始規劃行程</p>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-4 pb-8 flex flex-col gap-4">
          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Destination banner */}
            <div className="bg-purple-600 px-5 py-4">
              <p className="text-purple-200 text-xs font-medium mb-0.5">目的地</p>
              <h2 className="text-white text-xl font-bold">{destination}</h2>
              {tripTitle && <p className="text-purple-200 text-sm mt-1">「{tripTitle}」</p>}
            </div>

            <div className="p-5 flex flex-col gap-4 text-sm">
              {/* Date */}
              <ConfirmRow icon="📅" label="日期">
                {startDate} ～ {endDate}
                <span className="ml-2 text-purple-600 font-medium">（共 {totalDays()} 天）</span>
              </ConfirmRow>

              {/* Route */}
              <ConfirmRow icon="🗺️" label="路線">
                <span className="font-medium">{routeParts.join(' → ')}</span>
              </ConfirmRow>

              {/* Transport */}
              {selectedTransport.length > 0 && (
                <ConfirmRow icon="🚀" label="交通方式">
                  {selectedTransport.map((t) => {
                    const opt = TRANSPORT_OPTIONS.find((o) => o.value === t)
                    return opt ? `${opt.emoji} ${opt.value}` : t
                  }).join('　')}
                </ConfirmRow>
              )}

              {/* Travelers */}
              <ConfirmRow icon="👥" label="出行人數">
                {travelers} 人
                {memberProfiles.some((m) => m.age || m.gender) && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {memberProfiles.map((m, i) => {
                      const gLabel = m.gender === 'male' ? '男' : m.gender === 'female' ? '女' : m.gender === 'other' ? '不指定' : ''
                      if (!m.age && !m.gender) return null
                      return (
                        <span key={i} className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                          {i === 0 ? '本人' : `成員${i + 1}`}{m.age ? ` ${m.age}歲` : ''}{gLabel ? ` ${gLabel}` : ''}
                        </span>
                      )
                    })}
                  </div>
                )}
              </ConfirmRow>

              {/* Style */}
              <ConfirmRow icon="🎨" label="旅遊風格">
                <div className="flex flex-wrap gap-1.5">
                  {selectedStyles.map((s) => (
                    <span key={s} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </ConfirmRow>

              {/* Budget */}
              {(budget || currency !== 'TWD') && (
                <ConfirmRow icon="💰" label="預算">
                  {budget ? `${parseInt(budget).toLocaleString()} ${currency}` : currency}
                  {!budget && <span className="text-gray-400 ml-1">（由 AI 合理估算）</span>}
                </ConfirmRow>
              )}

              {/* Special requests */}
              {specialRequests.trim() && (
                <ConfirmRow icon="📝" label="特殊需求">
                  <span className="text-gray-600">{specialRequests}</span>
                </ConfirmRow>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-6 bg-white rounded-2xl border border-gray-100">
              <div className="text-4xl mb-3 animate-bounce">✈️</div>
              <p className="text-gray-700 font-medium">AI 正在為你規劃行程...</p>
              <p className="text-sm text-gray-400 mt-1">通常需要 30–60 秒</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* 模型選擇 */}
          {!loading && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">AI 模型</p>
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setModelProvider('claude')}
                  className={clsx(
                    'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                    modelProvider === 'claude'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  ✦ Claude
                </button>
                <button
                  onClick={() => setModelProvider('gemini')}
                  className={clsx(
                    'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                    modelProvider === 'gemini'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  ✦ Gemini
                </button>
                <button
                  onClick={() => setModelProvider('minimax')}
                  className={clsx(
                    'flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                    modelProvider === 'minimax'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  ⚡ MiniMax
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 px-1">建立行程與對話調整均使用所選模型</p>
            </div>
          )}

          {!loading && (
            <Button size="lg" className="w-full" onClick={handleGenerate}>
              ✨ 開始 AI 規劃
            </Button>
          )}

          {!loading && (
            <button
              onClick={() => setShowConfirm(false)}
              className="text-sm text-gray-400 text-center py-2"
            >
              返回修改
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Form view ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="bg-white border-b border-gray-100 px-4 pb-3 sticky top-0 z-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="tap-target flex items-center text-gray-500 -ml-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="font-semibold text-gray-900">建立新行程</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-10 flex flex-col gap-5">

        {/* ── 基本資訊 ─────────────────────────────────────────────────────────── */}
        <SectionTitle>基本資訊</SectionTitle>

        <Input
          label="行程名稱（選填）"
          placeholder="例：東京5天美食之旅（不填由 AI 命名）"
          value={tripTitle}
          onChange={(e) => setTripTitle(e.target.value)}
        />

        <Input
          label="目的地 *"
          placeholder="例：日本東京、泰國曼谷、多個城市皆可"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="出發日期 *"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
          <Input
            label="回程日期 *"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || new Date().toISOString().split('T')[0]}
          />
        </div>

        {totalDays() > 0 && (
          <p className="text-sm text-purple-600 font-medium text-center bg-purple-50 rounded-xl py-2 -mt-2">
            共 {totalDays()} 天的旅程 🎉
          </p>
        )}

        {/* ── 路線規劃 ─────────────────────────────────────────────────────────── */}
        <SectionTitle>路線規劃</SectionTitle>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="出發城市 *"
            placeholder="例：台北"
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
          />
          <Input
            label="返回城市"
            placeholder="預設同出發城市"
            value={returnCity}
            onChange={(e) => setReturnCity(e.target.value)}
          />
        </div>

        {/* Transit cities */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            中途經過城市
            <span className="text-gray-400 font-normal ml-1">（選填，可多個）</span>
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              placeholder="例：大阪（輸入後按 Enter 或點新增）"
              value={transitInput}
              onChange={(e) => setTransitInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTransitCity() } }}
            />
            <button
              type="button"
              onClick={addTransitCity}
              className="px-4 py-2.5 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-200 transition-colors"
            >
              新增
            </button>
          </div>
          {transitCities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {transitCities.map((city) => (
                <span key={city} className="flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full text-sm">
                  📍 {city}
                  <button type="button" onClick={() => removeTransitCity(city)} className="ml-1 text-purple-400 hover:text-purple-700">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Transport */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            交通方式
            <span className="text-gray-400 font-normal ml-1">（可多選）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TRANSPORT_OPTIONS.map(({ value, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleTransport(value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors tap-target ${
                  selectedTransport.includes(value)
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                {emoji} {value}
              </button>
            ))}
          </div>
        </div>

        {/* ── 旅伴設定 ─────────────────────────────────────────────────────────── */}
        <SectionTitle>旅伴設定</SectionTitle>

        {/* Traveler count */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">成員人數（含本人）*</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => updateTravelers(travelers - 1)}
              className="tap-target w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-xl font-medium text-gray-700"
            >−</button>
            <span className="text-2xl font-bold text-gray-900 w-8 text-center">{travelers}</span>
            <button
              type="button"
              onClick={() => updateTravelers(travelers + 1)}
              className="tap-target w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-xl font-medium text-gray-700"
            >＋</button>
            <span className="text-sm text-gray-400">位旅伴</span>
          </div>
        </div>

        {/* Member profiles */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            成員年齡與性別
            <span className="text-gray-400 font-normal ml-1">（選填，幫助 AI 推薦適合活動）</span>
          </label>
          <div className="flex flex-col gap-2">
            {memberProfiles.map((member, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">
                  {idx === 0 ? '👤 本人' : `👤 成員${idx + 1}`}
                </span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="年齡"
                  value={member.age ?? ''}
                  onChange={(e) => updateMember(idx, 'age', e.target.value ? parseInt(e.target.value) : undefined)}
                />
                <div className="flex gap-1 flex-1">
                  {GENDER_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateMember(idx, 'gender', member.gender === value ? undefined : value)}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                        member.gender === value
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 旅遊偏好 ─────────────────────────────────────────────────────────── */}
        <SectionTitle>旅遊偏好</SectionTitle>

        {/* Style */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            旅遊風格 *
            <span className="text-gray-400 font-normal ml-1">（可多選）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStyle(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors tap-target ${
                  selectedStyles.includes(s)
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Currency & Budget */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">幣別 *</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors tap-target ${
                  currency === c ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                {c} <span className="opacity-75 text-xs">{getCurrencyName(c)}</span>
              </button>
            ))}
          </div>
        </div>

        <Input
          label={`預算上限（${currency}，選填）`}
          type="number"
          placeholder="例：50000（不填由 AI 合理估算）"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />

        {/* ── 特殊需求 ─────────────────────────────────────────────────────────── */}
        <SectionTitle>特殊需求</SectionTitle>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            告訴 AI 你的特別需求
            <span className="text-gray-400 font-normal ml-1">（選填）</span>
          </label>
          <textarea
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base"
            rows={4}
            placeholder="例：不吃牛肉、需要輪椅友善景點、帶小孩避免太累、對清酒與傳統工藝有興趣..."
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
          />
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{validationError}</p>
        )}

        {/* Confirm button */}
        <Button size="lg" className="w-full mt-2" onClick={handleConfirm}>
          查看行程摘要 →
        </Button>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-purple-700 uppercase tracking-widest pt-1 pb-1 border-b border-purple-100">
      {children}
    </h2>
  )
}

function ConfirmRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 text-center">{icon}</span>
      <div className="flex-1">
        <span className="text-gray-400 text-xs block mb-0.5">{label}</span>
        <div className="text-gray-800">{children}</div>
      </div>
    </div>
  )
}
