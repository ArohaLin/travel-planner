'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { LodgingResearch, ProCon } from '@/lib/types/lodging'

const photoUrl = (ref: string | null) => (ref ? `/api/photo?ref=${encodeURIComponent(ref)}` : null)
const rateColor = (r: number | null) =>
  r == null ? 'text-gray-400' : r >= 4.7 ? 'text-emerald-600' : r >= 4.3 ? 'text-amber-500' : 'text-orange-500'
// 去掉地址前段的郵遞區號＋縣市區里，只留街路門牌（避免與 city/district 重複）
const shortAddr = (a: string | null) => {
  const s = (a ?? '').replace(/^\d+/, '').replace(/^[一-龥]{2,3}縣/, '').replace(/^[一-龥]{2,3}市/, '').replace(/^[一-龥]{1,3}[區鄉鎮市]/, '').replace(/^[一-龥]{1,3}[里村]/, '')
  return s || a || '—'
}

/** 商家評價：列表（單選看詳情／多選比較）。資料來自離線研究 lodging_research。
 *  kind='lodging'（住宿評價）或 'shop'（店家評價，如台東衝浪）；category 指定要讀的類別。
 *  inWishlist / onAddToWishlist / busyWishlistId：由 ExploreSheet 傳入，讓每張卡顯示「加入願望清單」按鈕。 */
export function LodgingTab({ initialItems, category, kind = 'lodging', inWishlist, onAddToWishlist, busyWishlistId }: {
  initialItems?: LodgingResearch[]
  category?: string
  kind?: 'lodging' | 'shop'
  inWishlist?: Set<string>
  onAddToWishlist?: (item: LodgingResearch) => Promise<void>
  busyWishlistId?: string | null
} = {}) {
  const L = kind === 'shop'
    ? { noun: '店家', icon: '🏄', emptyHint: '深入研究店家後會出現在這裡', tapHint: '點店家看完整介紹', regionEmpty: '此地區目前沒有店家資料。', noCon: '評論與文章中未見明顯負評。', reviewTitle: '真實評論分析' }
    : { noun: '住宿', icon: '🏨', emptyHint: '離線用 lodging-review 技能研究後會出現在這裡', tapHint: '點住宿看完整介紹', regionEmpty: '此地區目前沒有住宿資料。', noCon: '近一年幾乎無負評。', reviewTitle: '近一年評價' }
  const [items, setItems] = useState<LodgingResearch[] | null>(initialItems ?? null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [compareMode, setCompareMode] = useState(false)
  const [cat, setCat] = useState<string | null>(null)   // 店家模式：選中的類別（台東衝浪…）
  const [region, setRegion] = useState('全部')
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'compare' }>({ kind: 'list' })

  useEffect(() => {
    if (initialItems) return
    const url = category ? `?category=${encodeURIComponent(category)}` : kind === 'shop' ? '?kind=shop' : ''
    fetch(`/api/lodging${url}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
  }, [initialItems, category, kind])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  if (items === null)
    return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
  if (items.length === 0)
    return <p className="text-center text-gray-400 text-sm py-16 px-6">目前還沒有深入研究過的{L.noun}。<br />（{L.emptyHint}）</p>

  if (view.kind === 'detail') {
    const item = items.find((i) => i.id === view.id)
    if (item) return (
      <Detail
        item={item}
        onBack={() => setView({ kind: 'list' })}
        L={L}
        onAddToWishlist={onAddToWishlist ? () => onAddToWishlist(item) : undefined}
        wishlistAdded={!!item.googlePlaceId && (inWishlist?.has(item.googlePlaceId) ?? false)}
        busyWishlist={busyWishlistId === item.googlePlaceId}
      />
    )
  }
  if (view.kind === 'compare') {
    const list = items.filter((i) => selected.has(i.id))
    return <Compare items={list} onBack={() => setView({ kind: 'list' })} L={L} />
  }

  const sel = items.filter((i) => selected.has(i.id))
  // 店家模式：類別（台東衝浪…）為主篩選；先依類別過濾，再算地區
  const categories = kind === 'shop' ? Array.from(new Set(items.map((i) => i.category))).sort() : []
  const activeCat = categories.length ? (cat && categories.includes(cat) ? cat : categories[0]) : null
  const catItems = activeCat ? items.filter((i) => i.category === activeCat) : items
  const regionOf = (it: LodgingResearch) => (it.district || '其他').replace('臺', '台')
  const regionCounts = new Map<string, number>()
  for (const it of catItems) regionCounts.set(regionOf(it), (regionCounts.get(regionOf(it)) || 0) + 1)
  const regions = Array.from(regionCounts.entries()).sort((a, b) => b[1] - a[1])
  const visible = region === '全部' ? catItems : catItems.filter((it) => regionOf(it) === region)
  return (
    <div className="flex flex-col">
      {/* 類別篩選（店家模式主篩選：台東衝浪…） */}
      {kind === 'shop' && categories.length >= 1 && (
        <div className="flex gap-1.5 px-4 pt-3 pb-0.5 overflow-x-auto no-scrollbar">
          {categories.map((c) => (
            <button key={c} onClick={() => { setCat(c); setRegion('全部') }}
              className={clsx('flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition active:scale-95',
                c === activeCat ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-100')}>{c}</button>
          ))}
        </div>
      )}
      {/* 鄉鎮市區篩選（次篩選） */}
      {regions.length > 1 && (
        <div className="flex gap-1.5 px-4 pt-2 pb-1 overflow-x-auto no-scrollbar">
          <RegionPill label="全部" count={catItems.length} active={region === '全部'} onClick={() => setRegion('全部')} />
          {regions.map(([rg, c]) => (
            <RegionPill key={rg} label={rg} count={c} active={region === rg} onClick={() => setRegion(rg)} />
          ))}
        </div>
      )}
      {/* 模式列：預設點卡片看介紹；開「比較」才啟用勾選 */}
      <div className="px-4 pt-1 pb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-gray-400 min-w-0">{compareMode ? '勾選 2 間以上互相比較' : L.tapHint}</p>
        <button
          onClick={() => { setCompareMode((m) => !m); setSelected(new Set()) }}
          className={clsx('text-[14px] font-semibold rounded-full px-3.5 py-2 flex items-center gap-1 flex-shrink-0 active:scale-95 transition',
            compareMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600')}
        >
          {compareMode ? '✓ 比較模式' : '⇄ 比較'}
        </button>
      </div>
      <div className="px-4 pb-2 space-y-2.5">
        {visible.map((it) => (
          <LodgingCard
            key={it.id} item={it} compareMode={compareMode} checked={selected.has(it.id)} icon={L.icon}
            onTap={() => (compareMode ? toggle(it.id) : setView({ kind: 'detail', id: it.id }))}
            onAddToWishlist={onAddToWishlist ? () => onAddToWishlist(it) : undefined}
            wishlistAdded={!!it.googlePlaceId && (inWishlist?.has(it.googlePlaceId) ?? false)}
            busyWishlist={busyWishlistId === it.googlePlaceId}
          />
        ))}
        {visible.length === 0 && <p className="text-center text-[13px] text-gray-400 py-10">{L.regionEmpty}</p>}
      </div>

      {/* 底部操作列：只有比較模式才出現 */}
      {compareMode && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          {sel.length < 2 ? (
            <p className="text-center text-[13px] text-gray-400">再勾選 {Math.max(0, 2 - sel.length)} 間即可比較（已選 {sel.length} 間）</p>
          ) : (
            <button onClick={() => setView({ kind: 'compare' })} className="w-full py-3 rounded-2xl bg-purple-600 text-white text-[16px] font-semibold active:bg-purple-700">
              比較這 {sel.length} 間{L.noun}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── 鄉鎮市區篩選 chip ────────────────────────────────────────────────────────
function RegionPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx('flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium border', active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200')}
    >
      {label}<span className={clsx('ml-1', active ? 'text-purple-200' : 'text-gray-400')}>{count}</span>
    </button>
  )
}

// ── 列表卡 ───────────────────────────────────────────────────────────────────
function LodgingCard({ item, compareMode, checked, onTap, icon, onAddToWishlist, wishlistAdded, busyWishlist }: {
  item: LodgingResearch; compareMode: boolean; checked: boolean; onTap: () => void; icon: string
  onAddToWishlist?: () => void; wishlistAdded?: boolean; busyWishlist?: boolean
}) {
  const photo = photoUrl(item.photoRef)
  return (
    <div className={clsx('rounded-2xl border overflow-hidden transition-colors',
      compareMode && checked ? 'border-purple-400 ring-2 ring-purple-200 bg-purple-50/40' : 'border-gray-200 bg-white')}>
      <button
        onClick={onTap}
        className="w-full flex items-center gap-3 p-2.5 text-left active:bg-gray-50"
      >
        {photo ? (
          <img src={photo} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" loading="lazy" />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold text-gray-900 truncate">{item.name}</div>
          <div className="text-[13px] text-gray-500 truncate">
            {[item.city, item.district].filter(Boolean).join('')}・{shortAddr(item.address)}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={clsx('text-[18px] font-bold leading-none', rateColor(item.rating))}>★ {item.rating ?? '—'}</span>
            <span className="text-[12px] text-gray-400">{item.totalReviews != null ? `${item.totalReviews.toLocaleString()} 則` : ''}</span>
            {item.starClass && <span className="text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{item.starClass}</span>}
            {item.confidence === 'med' && <span className="text-[11px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">名稱相近</span>}
          </div>
        </div>
        {/* 比較模式：勾選框；一般模式：箭頭 */}
        {compareMode ? (
          <div className={clsx('w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0',
            checked ? 'bg-purple-600 border-purple-600' : 'border-gray-300')}>
            {checked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
        ) : (
          <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        )}
      </button>
      {/* 加入願望清單（比較模式隱藏；僅當 ExploreSheet 傳入 handler 才出現） */}
      {!compareMode && onAddToWishlist && (
        <button
          onClick={onAddToWishlist}
          disabled={wishlistAdded || busyWishlist}
          className={clsx('w-full py-2 text-[13px] font-medium border-t border-gray-100 flex items-center justify-center gap-1.5',
            wishlistAdded ? 'text-gray-400' : 'text-purple-600 active:bg-purple-50')}
        >
          {busyWishlist ? '加入中…' : wishlistAdded ? '✓ 已加入願望清單' : '♡ 加入願望清單'}
        </button>
      )}
    </div>
  )
}

// ── 共用小元件 ───────────────────────────────────────────────────────────────
function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 py-2.5">
      <button onClick={onBack} className="flex items-center gap-1 text-[15px] font-bold text-purple-700 bg-purple-100 active:bg-purple-200 rounded-full pl-2.5 pr-4 py-2 flex-shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        返回列表
      </button>
      <span className="text-[13px] text-gray-400 truncate min-w-0">{title}</span>
    </div>
  )
}

// 內容底部的大返回鈕（拇指好按，免去碰右上角 X）
function BottomBack({ onBack, noun }: { onBack: () => void; noun: string }) {
  return (
    <button onClick={onBack} className="w-full mt-3 py-3.5 rounded-2xl border-2 border-purple-200 text-purple-700 text-[16px] font-bold active:bg-purple-50 flex items-center justify-center gap-1.5">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      返回{noun}列表
    </button>
  )
}

type TabLabels = { noun: string; icon: string; emptyHint: string; tapHint: string; regionEmpty: string; noCon: string; reviewTitle: string }

function ProConRow({ pc, kind }: { pc: ProCon; kind: 'pro' | 'con' }) {
  const sys = pc.systematic
  return (
    <div className={clsx('rounded-xl border p-3', kind === 'pro' ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-100 bg-rose-50/40')}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-[15px] font-semibold text-gray-800 leading-snug flex-1 min-w-0">
          {kind === 'pro' ? (sys ? '🟢' : '🔵') : sys ? '🔴' : '🟡'} {pc.point}
        </span>
        <span className={clsx('text-[11px] rounded px-1.5 py-0.5 flex-shrink-0', sys ? (kind === 'pro' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700') : 'bg-gray-100 text-gray-500')}>
          {sys ? '系統性' : '個案'}{pc.pct ? `・${pc.pct}%` : ''}
        </span>
      </div>
      {pc.quote && <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">「{pc.quote}」</p>}
    </div>
  )
}

// ── 詳情（單間）──────────────────────────────────────────────────────────────
function Detail({ item, onBack, L, onAddToWishlist, wishlistAdded, busyWishlist }: {
  item: LodgingResearch; onBack: () => void; L: TabLabels
  onAddToWishlist?: () => void; wishlistAdded?: boolean; busyWishlist?: boolean
}) {
  const photo = photoUrl(item.photoRef)
  const sysPros = item.pros.filter((p) => p.systematic)
  const otherPros = item.pros.filter((p) => !p.systematic)
  const sysCons = item.cons.filter((c) => c.systematic)
  const otherCons = item.cons.filter((c) => !c.systematic)
  return (
    <div>
      <BackBar onBack={onBack} title={item.name} />
      <div className="px-4 py-3 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {/* 頭部 */}
        <div className="flex gap-3 items-center">
          {photo ? <img src={photo} alt="" className="w-20 h-20 rounded-2xl object-cover bg-gray-100 flex-shrink-0" /> : <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl">{L.icon}</div>}
          <div className="min-w-0">
            <h3 className="text-[20px] font-bold text-gray-900 leading-tight">{item.name}</h3>
            <div className="text-[13px] text-gray-500 mt-0.5">{[item.city, item.district].filter(Boolean).join('')}・{shortAddr(item.address)}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={clsx('text-[32px] font-extrabold leading-none', rateColor(item.rating))}>★{item.rating ?? '—'}</span>
              <span className="text-[13px] text-gray-400">/ {item.totalReviews?.toLocaleString() ?? '—'} 則</span>
            </div>
          </div>
        </div>

        {/* 加入願望清單 */}
        {onAddToWishlist && (
          <button
            onClick={onAddToWishlist}
            disabled={wishlistAdded || busyWishlist}
            className={clsx('w-full py-3 rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-1.5',
              wishlistAdded ? 'bg-gray-100 text-gray-400' : 'bg-purple-600 text-white active:bg-purple-700 disabled:opacity-60')}
          >
            {busyWishlist ? '加入中…' : wishlistAdded ? '✓ 已在願望清單中' : '♡ 加入願望清單'}
          </button>
        )}

        {/* 官網 / Google 介紹連結 */}
        {(item.features?.official || item.googlePlaceId) && (
          <div className="flex flex-wrap gap-2">
            {item.features?.official && (
              <a href={item.features.official} target="_blank" rel="noreferrer" className="text-[13px] text-purple-700 bg-purple-50 active:bg-purple-100 rounded-full px-3.5 py-2 inline-flex items-center gap-1">🏠 官網</a>
            )}
            {item.googlePlaceId && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}&query_place_id=${item.googlePlaceId}`} target="_blank" rel="noreferrer" className="text-[13px] text-blue-700 bg-blue-50 active:bg-blue-100 rounded-full px-3.5 py-2 inline-flex items-center gap-1">📍 Google 介紹</a>
            )}
          </div>
        )}

        {item.confidence === 'med' && item.queryName && item.queryName !== item.resolvedName && (
          <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">你查的是「{item.queryName}」，找到最接近的「{item.resolvedName}」，已以此分析。</p>
        )}

        {/* 一句總評 */}
        {item.verdict && (
          <div className="rounded-2xl bg-purple-50 border border-purple-100 px-4 py-3">
            <p className="text-[16px] text-purple-900 font-medium leading-relaxed">{item.verdict}</p>
          </div>
        )}

        {/* 特色 / 設施 */}
        {item.features && (item.features.summary || item.features.category || item.features.amenities?.has?.length || item.features.facts.length || item.features.roomTypes.length) ? (
          <section>
            <h4 className="text-[15px] font-bold text-gray-800 mb-2 flex items-center gap-2">
              特色 / 設施
              {item.features.category && <span className="text-[12px] font-normal text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">{item.features.category}</span>}
            </h4>
            {item.features.summary && <p className="text-[14px] text-gray-600 mb-2 leading-relaxed">{item.features.summary}</p>}
            {item.features.amenities?.has?.length ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {item.features.amenities.has.map((a, i) => <span key={i} className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">{a}</span>)}
              </div>
            ) : null}
            {item.features.amenities?.lacks?.length ? <p className="text-[12px] text-gray-400 mb-2">沒有：{item.features.amenities.lacks.join('、')}</p> : null}
            {item.features.roomTypes.length ? <p className="text-[13px] text-gray-600 mb-2"><span className="text-gray-400">房型：</span>{item.features.roomTypes.join('、')}</p> : null}
            {item.features.facts.length ? (
              <ul className="space-y-1.5">
                {item.features.facts.map((f, i) => (
                  <li key={i} className="text-[14px] text-gray-700 leading-snug flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>・{f.text}</span>
                    {f.paid && <span className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">需自費{f.paidNote ? `（${f.paidNote}）` : ''}</span>}
                    {f.seasonal && <span className="text-[11px] text-sky-700 bg-sky-50 rounded px-1.5 py-0.5">{f.seasonal}</span>}
                    {f.sources?.length ? f.sources.map((s, si) => (
                      <a key={si} href={s} target="_blank" rel="noreferrer" className="text-[11px] text-purple-400 underline">來源{f.sources!.length > 1 ? si + 1 : ''}</a>
                    )) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.features.facts.some((f) => f.sources?.length) ? (
              <p className="text-[10px] text-gray-400 mt-1.5">
                特色取自部落客遊記之客觀事實（已濾除主觀評論與一次性活動）
                {item.features.sourceYears ? <span className="text-gray-500">；資料來源年分 {item.features.sourceYears}</span> : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* 近一年 */}
        {item.lastYearDist && (
          <section>
            <h4 className="text-[15px] font-bold text-gray-800 mb-2">{L.reviewTitle}（{item.lastYearCount} 則・平均 {item.lastYearAvg}）</h4>
            <div className="space-y-1">
              {item.lastYearDist.map((d) => (
                <div key={d.star} className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-400 w-7 flex-shrink-0">{d.star}★</span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${d.percent}%` }} />
                  </div>
                  <span className="text-[12px] text-gray-400 w-10 text-right flex-shrink-0">{d.percent}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 優點 */}
        {item.pros.length > 0 && (
          <section>
            <h4 className="text-[15px] font-bold text-gray-800 mb-2">主要優點</h4>
            <div className="space-y-2">
              {sysPros.map((p, i) => <ProConRow key={'sp' + i} pc={p} kind="pro" />)}
              {otherPros.map((p, i) => <ProConRow key={'op' + i} pc={p} kind="pro" />)}
            </div>
          </section>
        )}

        {/* 缺點 */}
        <section>
          <h4 className="text-[15px] font-bold text-gray-800 mb-2">主要缺點</h4>
          {item.cons.length === 0 ? (
            <p className="text-[14px] text-gray-400 px-1">{L.noCon}</p>
          ) : (
            <div className="space-y-2">
              {sysCons.map((c, i) => <ProConRow key={'sc' + i} pc={c} kind="con" />)}
              {otherCons.map((c, i) => <ProConRow key={'oc' + i} pc={c} kind="con" />)}
            </div>
          )}
        </section>

        {/* 適合誰 */}
        {(item.suitableFor || item.notFor) && (
          <section className="grid grid-cols-1 gap-2">
            {item.suitableFor && <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5"><span className="text-[13px] font-semibold text-emerald-700">✓ 適合</span><p className="text-[14px] text-gray-700 mt-0.5">{item.suitableFor}</p></div>}
            {item.notFor && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5"><span className="text-[13px] font-semibold text-rose-700">✕ 不適合</span><p className="text-[14px] text-gray-700 mt-0.5">{item.notFor}</p></div>}
          </section>
        )}

        {item.coverage?.備註 && <p className="text-[11px] text-gray-300 leading-relaxed">資料涵蓋：{item.coverage.備註}</p>}

        <BottomBack onBack={onBack} noun={L.noun} />
      </div>
    </div>
  )
}

// ── 比較（多間）──────────────────────────────────────────────────────────────
function topSys(arr: ProCon[], n = 3) {
  return arr.filter((p) => p.systematic).slice(0, n)
}
function Compare({ items, onBack, L }: { items: LodgingResearch[]; onBack: () => void; L: TabLabels }) {
  const n = items.length
  const ratings = items.map((i) => i.rating ?? -1)
  const lastYears = items.map((i) => i.lastYearAvg ?? -1)
  const best = (arr: number[]) => Math.max(...arr)
  const worst = (arr: number[]) => Math.min(...arr.filter((x) => x >= 0))
  const hi = (v: number | null, arr: number[]) => v != null && v === best(arr) && best(arr) !== worst(arr)
  const lo = (v: number | null, arr: number[]) => v != null && v === worst(arr) && best(arr) !== worst(arr)
  const colTmpl = useMemo(() => `84px repeat(${n}, 150px)`, [n])

  const labelCell = (t: string) => (
    <div className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-100 px-2 py-3 text-[12px] font-semibold text-gray-500 flex items-center">{t}</div>
  )

  return (
    <div>
      <BackBar onBack={onBack} title={`比較 ${n} 間`} />
      {n > 2 && <p className="text-center text-[12px] text-gray-400 py-1.5">← 左右滑動比較更多 →</p>}
      <div className="overflow-x-auto scroll-touch" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <div className="grid text-left" style={{ gridTemplateColumns: colTmpl, width: 'max-content' }}>
          {/* 表頭：計分卡 */}
          <div className="sticky left-0 z-10 bg-white border-b border-r border-gray-100" />
          {items.map((it) => (
            <div key={it.id} className="border-b border-gray-100 p-2 text-center">
              {photoUrl(it.photoRef) ? <img src={photoUrl(it.photoRef)!} alt="" className="w-14 h-14 rounded-xl object-cover mx-auto bg-gray-100" /> : <div className="w-14 h-14 rounded-xl bg-gray-100 mx-auto flex items-center justify-center text-xl">{L.icon}</div>}
              <div className="text-[13px] font-semibold text-gray-800 leading-tight mt-1 line-clamp-2">{it.name}</div>
              <div className={clsx('text-[22px] font-extrabold leading-none mt-1', rateColor(it.rating))}>★{it.rating ?? '—'}</div>
            </div>
          ))}

          {/* 官方評分 */}
          {labelCell('官方評分')}
          {items.map((it) => (
            <div key={it.id} className={clsx('border-b border-gray-100 px-2 py-3 text-center', hi(it.rating, ratings) && 'bg-emerald-50', lo(it.rating, ratings) && 'bg-rose-50')}>
              <span className={clsx('text-[17px] font-bold', rateColor(it.rating))}>★{it.rating ?? '—'}</span>
              <div className="text-[11px] text-gray-400">{it.totalReviews?.toLocaleString() ?? '—'} 則</div>
            </div>
          ))}

          {/* 近一年 */}
          {labelCell('近一年')}
          {items.map((it) => (
            <div key={it.id} className={clsx('border-b border-gray-100 px-2 py-3 text-center', hi(it.lastYearAvg, lastYears) && 'bg-emerald-50', lo(it.lastYearAvg, lastYears) && 'bg-rose-50')}>
              <span className="text-[16px] font-semibold text-gray-700">{it.lastYearAvg ?? '—'}</span>
              <div className="text-[11px] text-gray-400">{it.lastYearCount ?? '—'} 則</div>
            </div>
          ))}

          {/* 系統性優點 */}
          {labelCell('系統性優點')}
          {items.map((it) => (
            <div key={it.id} className="border-b border-gray-100 px-2 py-2.5 space-y-1">
              {topSys(it.pros).map((p, i) => <div key={i} className="text-[12px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-1 leading-snug">🟢 {p.point}</div>)}
              {topSys(it.pros).length === 0 && <span className="text-[12px] text-gray-300">—</span>}
            </div>
          ))}

          {/* 系統性缺點 */}
          {labelCell('系統性缺點')}
          {items.map((it) => (
            <div key={it.id} className="border-b border-gray-100 px-2 py-2.5 space-y-1">
              {topSys(it.cons).map((c, i) => <div key={i} className="text-[12px] text-rose-700 bg-rose-50 rounded px-1.5 py-1 leading-snug">🔴 {c.point}</div>)}
              {topSys(it.cons).length === 0 && <span className="text-[12px] text-emerald-600">幾乎無</span>}
            </div>
          ))}

          {/* 特色 / 設施 */}
          {labelCell('特色/設施')}
          {items.map((it) => (
            <div key={it.id} className="border-b border-gray-100 px-2 py-2.5 space-y-0.5">
              {it.features?.category && <div className="text-[11px] text-purple-600 mb-0.5">{it.features.category}</div>}
              {(it.features?.amenities?.has ?? []).slice(0, 5).map((a, i) => <div key={i} className="text-[12px] text-gray-600 leading-snug">・{a}</div>)}
              {it.features?.roomTypes?.length ? <div className="text-[11px] text-gray-400 mt-1">房型 {it.features.roomTypes.length} 種</div> : null}
              {!it.features?.category && !(it.features?.amenities?.has?.length) ? <span className="text-[12px] text-gray-300">—</span> : null}
            </div>
          ))}

          {/* 適合誰 */}
          {labelCell('適合誰')}
          {items.map((it) => (
            <div key={it.id} className="border-b border-gray-100 px-2 py-2.5 text-[12px] text-gray-600 leading-snug">{it.suitableFor ?? '—'}</div>
          ))}
        </div>
      </div>
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"><BottomBack onBack={onBack} noun={L.noun} /></div>
    </div>
  )
}
