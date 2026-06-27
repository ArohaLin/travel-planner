'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { useToast } from '@/components/ui/Toast'
import type { ItineraryDay } from '@/lib/types/itinerary'
import type { ShoppingItem } from '@/lib/types/shopping'
import type { ShoppingFields } from '@/lib/hooks/useShopping'
import { suggestSlots } from '@/lib/explore/placement'

interface PlaceResult {
  placeId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
}

export interface ScheduleStore {
  placeName: string
  lat: number
  lng: number
  itemNames: string[]
}

interface Props {
  days: ItineraryDay[]
  destination: string
  items: ShoppingItem[]
  canEdit: boolean
  onAdd: (f: ShoppingFields) => Promise<boolean>
  onEdit: (id: string, f: ShoppingFields) => Promise<boolean>
  onToggle: (id: string, isDone: boolean) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  /** 綁店整家排進某天 → 生成購物活動卡 */
  onSchedule: (store: ScheduleStore, dayIndex: number, startTime: string) => Promise<boolean>
  onClose: () => void
}

const dayLabel = (idxs: number[]) =>
  idxs.length ? `第 ${[...idxs].sort((a, b) => a - b).map((i) => i + 1).join('、')} 天` : ''

export function ShoppingSheet({ days, destination, items, canEdit, onAdd, onEdit, onToggle, onDelete, onSchedule, onClose }: Props) {
  const { showToast } = useToast()

  // 新增表單
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [bindStore, setBindStore] = useState(false)
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [storeQ, setStoreQ] = useState('')
  const [storeRes, setStoreRes] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pickDays, setPickDays] = useState(false)
  const [selDays, setSelDays] = useState<number[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [schedulingKey, setSchedulingKey] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  // 店家搜尋（debounce）
  useEffect(() => {
    const q = storeQ.trim()
    if (!bindStore || q.length < 2) { setStoreRes([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}&near=${encodeURIComponent(destination)}`)
        const data = res.ok ? await res.json() : { places: [] }
        setStoreRes((data.places ?? []) as PlaceResult[])
      } catch { setStoreRes([]) } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [storeQ, bindStore, destination])

  function resetForm() {
    setName(''); setQuantity(''); setNote('')
    setBindStore(false); setPlaces([]); setStoreQ(''); setStoreRes([])
    setPickDays(false); setSelDays([])
    setEditingId(null)
  }

  async function submitForm() {
    if (!name.trim()) return
    setAdding(true)
    const f: ShoppingFields = {
      name: name.trim(),
      quantity: quantity.trim() || null,
      note: note.trim() || null,
      stores: places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ placeId: p.placeId, name: p.name, lat: p.lat as number, lng: p.lng as number })),
      dayIndexes: selDays,
    }
    const ok = editingId ? await onEdit(editingId, f) : await onAdd(f)
    setAdding(false)
    if (ok) { resetForm(); showToast(editingId ? '已更新' : '已加入採購清單', 'success') }
    else showToast(editingId ? '更新失敗' : '加入失敗', 'error')
  }

  function loadForEdit(it: ShoppingItem) {
    setEditingId(it.id)
    setName(it.name)
    setQuantity(it.quantity ?? '')
    setNote(it.note ?? '')
    if (it.stores.length) {
      setBindStore(true)
      setPlaces(it.stores.map((s) => ({ placeId: s.placeId, name: s.name, address: null, lat: s.lat, lng: s.lng })))
      setStoreQ('')
    } else {
      setBindStore(false)
      setPlaces([])
    }
    setSelDays(it.dayIndexes)
    setPickDays(it.dayIndexes.length > 0)
  }

  // 分組
  const open = items.filter((i) => !i.isDone)
  const done = items.filter((i) => i.isDone)
  const storeGroups = useMemo(() => {
    const m = new globalThis.Map<string, { placeName: string; lat: number | null; lng: number | null; items: ShoppingItem[] }>()
    for (const it of open) {
      for (const s of it.stores) {
        const g = m.get(s.placeId) ?? { placeName: s.name, lat: s.lat, lng: s.lng, items: [] }
        g.items.push(it)
        m.set(s.placeId, g)
      }
    }
    return Array.from(m.entries())
  }, [open])
  const dayItems = open.filter((i) => i.stores.length === 0 && i.dayIndexes.length > 0)
  const anywhere = open.filter((i) => i.stores.length === 0 && i.dayIndexes.length === 0)

  async function handleToggle(it: ShoppingItem) {
    setBusyId(it.id)
    await onToggle(it.id, !it.isDone)
    setBusyId(null)
  }
  async function handleDelete(it: ShoppingItem) {
    setBusyId(it.id)
    await onDelete(it.id)
    setBusyId(null)
  }

  function ItemRow({ it }: { it: ShoppingItem }) {
    return (
      <div className="flex items-center gap-2.5 py-1.5">
        <button onClick={() => handleToggle(it)} disabled={!canEdit || busyId === it.id} className="flex-shrink-0 tap-target -m-1.5 p-1.5">
          {it.isDone
            ? <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
            : <span className="block w-5 h-5 rounded border-2 border-gray-300" />}
        </button>
        <div className={clsx('flex-1 min-w-0', it.isDone && 'line-through text-gray-400')}>
          <span className="text-sm text-gray-800">{it.name}</span>
          {it.quantity && <span className="text-xs text-gray-400 ml-1.5">× {it.quantity}</span>}
          {it.note && <p className="text-[11px] text-gray-400 leading-snug">{it.note}</p>}
        </div>
        {canEdit && (
          <>
            <button onClick={() => loadForEdit(it)} className="flex-shrink-0 text-gray-300 hover:text-amber-600 p-1" aria-label="編輯">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            </button>
            <button onClick={() => handleDelete(it)} disabled={busyId === it.id} className="flex-shrink-0 text-gray-300 hover:text-red-500 p-1" aria-label="刪除">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl sheet-enter flex flex-col" style={{ height: 'calc(96dvh - env(safe-area-inset-top))' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">🛍 採購清單</h2>
          <button onClick={onClose} className="tap-target text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-touch px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {/* 新增 */}
          {canEdit && (
            <div className="bg-gray-50 rounded-2xl p-3 mb-4 space-y-2">
              {editingId && (
                <div className="flex items-center justify-between text-xs text-amber-700 bg-amber-100 rounded-lg px-2.5 py-1.5">
                  <span>✏️ 編輯中</span>
                  <button onClick={resetForm} className="text-gray-500 underline">取消</button>
                </div>
              )}
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="買什麼…" className="flex-1 bg-white rounded-lg px-3 py-2 text-base text-gray-800 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200" style={{ fontSize: 16 }} />
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="數量" className="w-16 bg-white rounded-lg px-2 py-2 text-base text-gray-800 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200" style={{ fontSize: 16 }} />
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（選填，如指定品牌）" className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-700 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200" style={{ fontSize: 16 }} />
              <div className="flex gap-2">
                <button onClick={() => setBindStore((v) => !v)} className={clsx('flex-1 text-xs rounded-lg py-2 border flex items-center justify-center gap-1', places.length || bindStore ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-gray-200 text-gray-500')}>
                  📍 {places.length ? `${places.length} 家店` : bindStore ? '搜尋店家…' : '在哪買：隨處'}
                </button>
                <button onClick={() => setPickDays((v) => !v)} className={clsx('flex-1 text-xs rounded-lg py-2 border flex items-center justify-center gap-1', selDays.length ? 'border-purple-300 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-500')}>
                  📅 {selDays.length ? dayLabel(selDays) : '哪天：隨時'}
                </button>
              </div>
              {bindStore && (
                <div>
                  {places.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {places.map((p) => (
                        <span key={p.placeId} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 rounded-full pl-2.5 pr-1.5 py-1">
                          {p.name}
                          <button onClick={() => setPlaces((ps) => ps.filter((x) => x.placeId !== p.placeId))} className="text-amber-500" aria-label="移除">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input value={storeQ} onChange={(e) => setStoreQ(e.target.value)} placeholder={`搜尋店家加入（可加多家，${destination} 附近）`} className="w-full bg-white rounded-lg px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-200" style={{ fontSize: 16 }} />
                  {searching && <p className="text-xs text-gray-400 py-2 text-center">搜尋中…</p>}
                  {storeRes.filter((p) => !places.some((x) => x.placeId === p.placeId)).map((p) => (
                    <button key={p.placeId} onClick={() => { setPlaces((ps) => [...ps, p]); setStoreQ(''); setStoreRes([]) }} className="w-full text-left px-2 py-2 border-b border-gray-100 active:bg-gray-50">
                      <p className="text-sm text-gray-800">{p.name}</p>
                      {p.address && <p className="text-[11px] text-gray-400 line-clamp-1">{p.address}</p>}
                    </button>
                  ))}
                </div>
              )}
              {pickDays && (
                <div className="flex flex-wrap gap-1.5">
                  {days.map((d) => {
                    const on = selDays.includes(d.dayIndex)
                    return (
                      <button key={d.dayIndex} onClick={() => setSelDays((s) => on ? s.filter((x) => x !== d.dayIndex) : [...s, d.dayIndex])} className={clsx('text-xs rounded-full px-2.5 py-1 border', on ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500')}>
                        第 {d.dayIndex + 1} 天
                      </button>
                    )
                  })}
                </div>
              )}
              <button onClick={submitForm} disabled={!name.trim() || adding} className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium disabled:opacity-40 active:bg-amber-600">
                {adding ? (editingId ? '更新中…' : '加入中…') : editingId ? '儲存修改' : '＋ 加入採購清單'}
              </button>
            </div>
          )}

          {open.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10 px-6">還沒有採購項目。{canEdit ? '在上面輸入想買的東西。' : ''}</p>
          )}

          {/* 區1：專程要去的店 */}
          {storeGroups.length > 0 && (
            <Section icon="🏪" title="專程要去的店">
              {storeGroups.map(([placeId, g]) => (
                <div key={placeId} className="border border-gray-100 rounded-xl p-3 mb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 min-w-0">{g.placeName}</p>
                    {canEdit && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        {g.lat != null && g.lng != null && (
                          <button onClick={() => setSchedulingKey(schedulingKey === placeId ? null : placeId)} className="text-[11px] text-blue-600 border border-blue-200 rounded-full px-2 py-1 active:bg-blue-50">📅 排程</button>
                        )}
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.placeName)}&query_place_id=${encodeURIComponent(placeId)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-gray-500 border border-gray-200 rounded-full px-2 py-1 active:bg-gray-50">🗺 地圖</a>
                      </div>
                    )}
                  </div>
                  {schedulingKey === placeId && g.lat != null && g.lng != null && (
                    <SchedulePicker
                      days={days}
                      lat={g.lat}
                      lng={g.lng}
                      onPick={async (dayIndex, startTime) => {
                        const ok = await onSchedule({ placeName: g.placeName, lat: g.lat!, lng: g.lng!, itemNames: g.items.map((i) => i.name) }, dayIndex, startTime)
                        setSchedulingKey(null)
                        showToast(ok ? `已排進第 ${dayIndex + 1} 天行程` : '排程失敗', ok ? 'success' : 'error')
                      }}
                    />
                  )}
                  <div className="border-t border-gray-50 mt-2 pt-1">
                    {g.items.map((it) => <ItemRow key={it.id} it={it} />)}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* 區2：指定某天買 */}
          {dayItems.length > 0 && (
            <Section icon="📅" title="指定某天買">
              <div className="border border-gray-100 rounded-xl px-3 py-1.5 mb-2.5">
                {dayItems.map((it) => (
                  <div key={it.id}>
                    <ItemRow it={it} />
                    <span className="inline-block text-[10px] text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 mb-1.5 ml-7">{dayLabel(it.dayIndexes)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 區3：隨處・看到就買 */}
          {anywhere.length > 0 && (
            <Section icon="🛒" title="隨處・看到就買">
              <div className="border border-gray-100 rounded-xl px-3 py-1.5 mb-2.5">
                {anywhere.map((it) => <ItemRow key={it.id} it={it} />)}
              </div>
            </Section>
          )}

          {/* 已買收合 */}
          {done.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowDone((v) => !v)} className="text-xs text-gray-400 flex items-center gap-1 py-1">
                {showDone ? '▴' : '▾'} 已買（{done.length}）
              </button>
              {showDone && (
                <div className="border border-gray-100 rounded-xl px-3 py-1.5">
                  {done.map((it) => <ItemRow key={it.id} it={it} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[13px] font-medium text-gray-700 mb-2 flex items-center gap-1.5">{icon} {title}</p>
      {children}
    </div>
  )
}

/** 排程小選天器：用 suggestSlots 依離各天遠近排序給建議。 */
function SchedulePicker({ days, lat, lng, onPick }: { days: ItineraryDay[]; lat: number; lng: number; onPick: (dayIndex: number, startTime: string) => void }) {
  const slots = useMemo(() => suggestSlots({ lat, lng }, days), [lat, lng, days])
  return (
    <div className="mt-2 bg-blue-50 rounded-xl p-2.5">
      <p className="text-[11px] text-blue-700 mb-1.5">排進哪一天？（生成購物活動卡）</p>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <button key={s.dayIndex} onClick={() => onPick(s.dayIndex, s.startTime)} className="text-xs border border-blue-200 text-blue-700 bg-white rounded-full px-2.5 py-1 active:bg-blue-100">
            第 {s.dayIndex + 1} 天 {s.startTime}{s.distanceKm != null ? `（${s.distanceKm.toFixed(0)}km）` : ''}
          </button>
        ))}
      </div>
    </div>
  )
}
