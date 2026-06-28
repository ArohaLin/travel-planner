'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { nanoid } from 'nanoid'
import { useItinerary } from '@/lib/hooks/useItinerary'
import { usePresence } from '@/lib/hooks/usePresence'
import { useChat } from '@/lib/hooks/useChat'
import type { AssistantLock } from '@/lib/hooks/useChat'
import { canChat, canEdit } from '@/lib/utils/permissions'
import {
  computeInsertShiftOps,
  computeEditShiftOps,
  detectOverlaps,
  type ShiftWarning,
} from '@/lib/utils/activityTime'
import { deletePlace, changedTimeIds, setDepartureTime, toMin, fromMin } from '@/lib/itinerary/reschedule'
import type { Itinerary, TripMetadata, Activity, Accommodation } from '@/lib/types/itinerary'
import type { ItineraryPatch, PatchOp } from '@/lib/types/patch'
import type { MemberRole, GlobalRole } from '@/lib/types/collaboration'
import { ItineraryHeader } from '@/components/itinerary/ItineraryHeader'
import { DayTabs } from '@/components/itinerary/DayTabs'
import { DayView } from '@/components/itinerary/DayView'
import { DragSortView } from '@/components/itinerary/DragSortView'
import { SummaryView } from '@/components/itinerary/SummaryView'
import { TripInfoCard } from '@/components/itinerary/TripInfoCard'
import { ChatSheet } from '@/components/ai/ChatSheet'
import { ExploreSheet } from '@/components/explore/ExploreSheet'
import type { WishlistItem } from '@/lib/types/recommendation'
import { AINotesSheet } from '@/components/ai/AINotesSheet'
import { AddNoteModal } from '@/components/ai/AddNoteModal'
import { ActivityEditModal } from '@/components/itinerary/ActivityEditModal'
import { ActivityDetailModal } from '@/components/itinerary/ActivityDetailModal'
import { AccommodationEditModal } from '@/components/itinerary/AccommodationEditModal'
import { AccommodationDetailModal } from '@/components/itinerary/AccommodationDetailModal'
import { ThemeEditModal } from '@/components/itinerary/ThemeEditModal'
import { DepartureEditModal } from '@/components/itinerary/DepartureEditModal'
import { TodoSheet } from '@/components/itinerary/TodoSheet'
import { useTodos } from '@/lib/hooks/useTodos'
import { useShopping } from '@/lib/hooks/useShopping'
import { ShoppingSheet, type ScheduleStore } from '@/components/shopping/ShoppingSheet'
import { deriveAutoTodos } from '@/lib/todo/deriveTodos'
import { MapView } from '@/components/map/MapView'
import { RoutePrefetcher } from '@/components/map/RoutePrefetcher'
import { WeatherPrefetcher } from '@/components/weather/WeatherPrefetcher'
import { scanBufferWarnings } from '@/lib/maps/bufferScan'
import { useToast } from '@/components/ui/Toast'
import { APIProvider } from '@vis.gl/react-google-maps'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
import { useAINotes, composeNotesMessage } from '@/lib/hooks/useAINotes'
import { useModelPreference } from '@/lib/hooks/useModelPreference'
import { daysBetweenInclusive, getDaysInRange } from '@/lib/utils/date'
import { fileToCompressedBase64 } from '@/lib/utils/image'

type ViewMode = 'list' | 'map' | 'summary'

/** YYYY-MM-DD → 「M/D（週X）」 */
function fmtDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（${w}）`
}

interface ItineraryClientProps {
  itineraryId: string
  initialItinerary: Itinerary
  initialVersion: number
  role: MemberRole
  currentUser: { userId: string; displayName: string; avatarUrl: string | null; globalRole: GlobalRole }
}

type ModalState =
  | { open: false }
  | { open: true; mode: 'edit'; activity: Activity; dayIndex: number }
  | { open: true; mode: 'add'; insertAfterIndex: number; dayIndex: number }

/** 衝突 dialog state — 當 shift 會把活動推到 06:00 之前或 23:59 之後時出現 */
interface ConflictDialogState {
  /** 主要動作說明，例如「修改：xxx」「新增：xxx」「刪除：xxx」*/
  actionLabel: string
  /** 超出範圍的活動列表 */
  warnings: ShiftWarning[]
  /** 「強制修改」按下時呼叫 — 應只送主 op，不送 shift ops */
  onForce: () => Promise<void>
}

export function ItineraryClient({
  itineraryId, initialItinerary, initialVersion, role, currentUser,
}: ItineraryClientProps) {
  const [activeDay, setActiveDay] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const [exploreTargetDay, setExploreTargetDay] = useState<number | null>(null)
  // 拖拉排序模式（長按景點卡進入）
  const [dragMode, setDragMode] = useState(false)
  const [departureEditOpen, setDepartureEditOpen] = useState(false)
  const [todoOpen, setTodoOpen] = useState(false)
  const [shoppingOpen, setShoppingOpen] = useState(false)
  const [dragHasChanges, setDragHasChanges] = useState(false)
  // 拖拉未套用時、切到哪個檢視的待確認目標（map / summary）
  const [dragSwitchConfirm, setDragSwitchConfirm] = useState<'map' | 'summary' | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [mapSelectedDays, setMapSelectedDays] = useState<number[]>([0])
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null)
  // 小幫手「用資料更新這張卡」鎖定目標（從卡片詳情開啟）
  const [assistantLock, setAssistantLock] = useState<AssistantLock | null>(null)
  const [editAccommodation, setEditAccommodation] = useState<Accommodation | null>(null)
  const [detailAccommodation, setDetailAccommodation] = useState<Accommodation | null>(null)
  const [editThemeOpen, setEditThemeOpen] = useState(false)
  // 日期變更導致天數變化的處理對話
  const [dateChange, setDateChange] = useState<{
    startDate: string
    endDate: string
    oldCount: number
    newCount: number
  } | null>(null)
  // #24：天數變化時，使用者補充給 AI 的說明
  const [dateChangeNote, setDateChangeNote] = useState('')
  const [notesSheetOpen, setNotesSheetOpen] = useState(false)
  const [addNoteFor, setAddNoteFor] = useState<Activity | null>(null)
  const [submittingNotes, setSubmittingNotes] = useState(false)
  const [localMetadata, setLocalMetadata] = useState<TripMetadata | null>(null)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [saving, setSaving] = useState(false)
  const [fixingTravel, setFixingTravel] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Activity | null>(null)
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null)

  const { itinerary, refresh: refreshItinerary } = useItinerary(itineraryId)
  const liveItinerary = itinerary ?? initialItinerary
  const displayItinerary = localMetadata
    ? { ...liveItinerary, metadata: localMetadata }
    : liveItinerary

  const onlineUsers = usePresence(itineraryId, currentUser, activeDay)
  const chat = useChat(itineraryId)
  const aiNotes = useAINotes(itineraryId)
  const { modelProvider } = useModelPreference()
  const { showToast } = useToast()

  // ── 待辦事項：手動待辦（DB）＋ 自動提醒（即時從行程算）────────────────────────
  const todoState = useTodos(itineraryId)
  const todayISO = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const { autoTodosActive, resolvedAutoTodos } = useMemo(() => {
    const doneKeys = new Set(todoState.todos.filter((t) => t.kind === 'auto' && t.isDone).map((t) => t.autoKey))
    const all = deriveAutoTodos(displayItinerary, todayISO)
    return {
      autoTodosActive: all.filter((t) => !doneKeys.has(t.key)),
      resolvedAutoTodos: all.filter((t) => doneKeys.has(t.key)),
    }
  }, [displayItinerary, todayISO, todoState.todos])
  const manualTodos = useMemo(() => todoState.todos.filter((t) => t.kind === 'manual'), [todoState.todos])
  const todoBadge = autoTodosActive.length + manualTodos.filter((t) => !t.isDone).length

  // ── 採購清單（手動清單，Realtime 協作）────────────────────────────────────
  const shopping = useShopping(itineraryId)
  const shoppingBadge = shopping.items.filter((s) => !s.isDone).length

  const currentDayData = displayItinerary.days[activeDay]
  const userCanEdit = canEdit(role)

  // ── 全行程移動緩衝掃描（紅燈/黃燈段數）→ 一鍵請 AI 修正時間 ─────────────────
  const bufferWarnings = useMemo(() => scanBufferWarnings(displayItinerary), [displayItinerary])

  // ── 背景補景點「照片＋座標」（舊行程或缺座標時）：偵測到缺就觸發一次，只補缺的 ──
  // 缺座標會讓路程時間算錯（中途點被跳過），所以照片或座標任一缺就補。
  const photoBackfillRef = useRef(false)
  useEffect(() => {
    if (photoBackfillRef.current || !userCanEdit) return
    const noCoords = (loc?: { lat: number; lng: number } | null) => !loc || (loc.lat === 0 && loc.lng === 0)
    const missing = liveItinerary.days.some((d) =>
      d.activities.some((a) => a.type !== 'transport' && (!a.photoRef || noCoords(a.location)))
      || (!!d.accommodation && noCoords(d.accommodation.location)),
    )
    if (!missing) return
    photoBackfillRef.current = true
    fetch(`/api/itinerary/${itineraryId}/photos`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => { if (res?.updated > 0) refreshItinerary() })
      .catch(() => {})
  }, [liveItinerary, userCanEdit, itineraryId, refreshItinerary])

  // ── 回前景自動重抓行程 ─────────────────────────────────────────────────────
  // 手機背景化會切斷 Realtime websocket：背景期間伺服器套用的修改（一鍵修正路程、
  // 協作者編輯、AI 方案於他處套用…）其 UPDATE 事件會被漏接、且不補播 → 回前景畫面停在舊資料。
  // 這裡在頁面回到前景時無條件從 DB 重抓，補上漏接的更新。拖拉模式中略過（不蓋掉預覽）。
  const refreshRef = useRef(refreshItinerary)
  useEffect(() => { refreshRef.current = refreshItinerary })
  const dragModeRef = useRef(dragMode)
  useEffect(() => { dragModeRef.current = dragMode }, [dragMode])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (dragModeRef.current) return // 拖拉預覽進行中 → 不重抓
      refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // 只裝一次，透過 ref 取最新 refresh / dragMode

  // 切換檢視（行程/地圖/簡表）時捲回頂端：避免行程捲到下面後切地圖，地圖頂端被擋住看不到
  useEffect(() => { window.scrollTo({ top: 0 }) }, [viewMode])

  // 一鍵「自動修正路程時間」：伺服器端跑 AI 並直接套用（背景切走也會完成、完成會推播）。
  // 仍是快照式可還原；套用後靠 Realtime 自動更新畫面。
  async function handleFixTravelTimes() {
    if (fixingTravel) return
    setFixingTravel(true)
    showToast('AI 正在自動修正路程時間，可先離開 App，完成會通知並自動更新', 'info')
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/fix-travel-times`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.noChange) {
          showToast('目前沒有需要修正的移動時間', 'info')
        } else {
          await refreshItinerary()
          showToast('已自動修正路程時間 ✅', 'success')
        }
      } else if (res.status === 409) {
        showToast('行程剛被更新，請再試一次', 'error')
      } else if (res.status === 422) {
        showToast(data.error ?? 'AI 沒有提供可套用的修正，請改用聊天微調', 'error')
      } else {
        showToast(data.error ?? '修正失敗，請再試一次', 'error')
      }
    } catch {
      // 可能是切到背景使請求中斷；伺服器仍會完成並推播，回前景時 Realtime 會更新
      showToast('已在背景處理，完成會通知並自動更新', 'info')
    } finally {
      setFixingTravel(false)
    }
  }

  const handleMetadataUpdated = useCallback((newMetadata: TripMetadata) => {
    setLocalMetadata(newMetadata)
  }, [])

  // ── 住宿編輯 ─────────────────────────────────────────────────────────────────
  async function handleSaveAccommodation(updated: Accommodation) {
    // 同一筆訂房常跨多晚（各天的 accommodation 共用同一 id）→ 一併套用到所有「同 id」的天，
    // 避免「改一天、其它晚沒跟上」的分歧（同間飯店應一致）。找不到同 id 時只更新當前天。
    const sameIdDays = displayItinerary.days
      .filter((d) => d.accommodation?.id === updated.id)
      .map((d) => d.dayIndex)
    const targetDays = sameIdDays.length > 0 ? sameIdDays : [activeDay]
    const multi = targetDays.length > 1
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: multi ? `手動編輯住宿：${updated.name}（同步 ${targetDays.length} 晚）` : `手動編輯住宿：${updated.name}`,
      proposedBy: 'user',
      ops: targetDays.map((dayIndex) => ({ op: 'set_day_accommodation', dayIndex, payload: updated })),
    }
    const ok = await submitPatch(patch)
    if (ok) {
      setEditAccommodation(null)
      showToast(multi ? `住宿「${updated.name}」已更新（同步 ${targetDays.length} 晚）` : `住宿「${updated.name}」已更新`, 'success')
    }
  }

  // ── 每日簡介（theme）手動編輯 ──────────────────────────────────────────────
  async function handleSaveTheme(theme: string) {
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `編輯第 ${activeDay + 1} 天簡介`,
      proposedBy: 'user',
      ops: [{ op: 'update_day', dayIndex: activeDay, payload: { theme } }],
    }
    const ok = await submitPatch(patch)
    if (ok) {
      setEditThemeOpen(false)
      showToast('每日簡介已更新', 'success')
    }
  }

  // ── 日期變更處理（#19）────────────────────────────────────────────────────
  // 用新的 PATCH（含 days）整批更新日期 + days 陣列
  async function patchDatesAndDays(startDate: string, endDate: string, newDays: Itinerary['days']) {
    const totalDays = newDays.length
    setSaving(true)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: { startDate, endDate, totalDays },
          days: newDays,
        }),
      })
      if (res.ok) {
        refreshItinerary()
        return true
      }
      const d = await res.json().catch(() => ({}))
      showToast(d.error ?? '更新失敗', 'error')
      return false
    } catch {
      showToast('網路錯誤，請再試一次', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  // 重算每天的 date（以新出發日為基準），可指定要保留幾天 / 補幾天空白
  function rebuildDays(startDate: string, targetCount: number): Itinerary['days'] {
    const dates = getDaysInRange(startDate, targetCount)
    const src = liveItinerary.days
    return dates.map((date, i) => {
      if (i < src.length) {
        // 保留原本那天的活動/住宿，只更新 date 與 dayIndex
        return { ...src[i], dayIndex: i, date }
      }
      // 新增的空白天
      return {
        dayIndex: i,
        date,
        city: liveItinerary.metadata.destination,
        theme: '',
        activities: [],
        accommodation: undefined,
      }
    })
  }

  // TripInfoCard 日期變更入口
  function handleDatesChange(startDate: string, endDate: string) {
    const oldCount = liveItinerary.days.length
    const newCount = daysBetweenInclusive(startDate, endDate)
    if (newCount === oldCount) {
      // 天數不變 → 只平移日期，直接套用
      const newDays = rebuildDays(startDate, newCount)
      patchDatesAndDays(startDate, endDate, newDays).then((ok) => {
        if (ok) showToast('日期已更新', 'success')
      })
      return
    }
    // 天數變化 → 跳對話讓使用者決定
    setDateChange({ startDate, endDate, oldCount, newCount })
  }

  // 對話選項：在尾端補空白天（天數變多時）/ 刪除最後幾天（天數變少時）
  async function applyDateChangeKeepOrTrim() {
    if (!dateChange) return
    const { startDate, endDate, newCount } = dateChange
    const newDays = rebuildDays(startDate, newCount)
    const ok = await patchDatesAndDays(startDate, endDate, newDays)
    setDateChange(null)
    if (ok) {
      showToast(newCount > dateChange.oldCount ? `已新增空白天，共 ${newCount} 天` : `已調整為 ${newCount} 天`, 'success')
      setActiveDay((d) => Math.min(d, newCount - 1))
    }
  }

  // 對話選項：請 AI 補齊/調整（先更新日期+天數，再帶訊息給 AI）
  async function applyDateChangeWithAI() {
    if (!dateChange) return
    const { startDate, endDate, oldCount, newCount } = dateChange
    const newDays = rebuildDays(startDate, newCount)
    const ok = await patchDatesAndDays(startDate, endDate, newDays)
    if (!ok) { setDateChange(null); return }
    setActiveDay((d) => Math.min(d, newCount - 1))
    const note = dateChangeNote.trim()
    const noteLine = note ? `\n\n我的補充說明：${note}` : ''
    const msg = newCount > oldCount
      ? `我把行程天數從 ${oldCount} 天改為 ${newCount} 天（日期 ${startDate} ~ ${endDate}），新增的第 ${oldCount + 1}~${newCount} 天目前是空白的，請依整體行程風格與動線幫我補齊這幾天的完整規劃。${noteLine}`
      : `我把行程天數從 ${oldCount} 天改為 ${newCount} 天（日期 ${startDate} ~ ${endDate}），請幫我把行程重新濃縮調整成 ${newCount} 天，保留最精華的景點與合理動線。${noteLine}`
    setDateChange(null)
    setDateChangeNote('')
    setChatOpen(true)
    chat.queueMessage(msg, modelProvider)
  }

  // ── AI 備註：送出 → 走現有 adjust 對話 → 開啟 ChatSheet 看方案 ──────────────
  function handleSubmitNotes(overallThought: string) {
    if (aiNotes.notes.length === 0) return
    const message = composeNotesMessage(aiNotes.notes, overallThought)
    // 關閉備註 Sheet、打開對話 Sheet（讓使用者看到 AI 方案）
    setNotesSheetOpen(false)
    setChatOpen(true)
    // 用佇列送出：不論 threadId 是否已就緒，ready 後會自動送出（避免時機問題導致沒下文）
    chat.queueMessage(message, modelProvider)
    // 清空備註籃（方案套用與否由使用者在 ChatSheet 決定）
    aiNotes.clearNotes()
    showToast('已送出給 AI，請在對話視窗查看方案', 'success')
  }

  // ── Submit a patch to the server ──────────────────────────────────────────
  async function submitPatch(patch: ItineraryPatch): Promise<boolean> {
    setSaving(true)
    try {
      const res = await fetch(`/api/itinerary/${itineraryId}/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      })
      if (res.ok) {
        refreshItinerary()
        return true
      }
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '操作失敗，請再試一次', 'error')
      return false
    } catch {
      showToast('網路錯誤，請再試一次', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  // ── 拖拉排序：套用重排（規則自動重算時間，整批一筆歷程、可還原）─────────────
  async function handleApplyReorder(ops: PatchOp[], changedCount: number) {
    if (ops.length === 0) { setDragMode(false); return }
    const dayList = ops.map((o) => (o.op === 'update_day' ? o.dayIndex + 1 : 0)).filter(Boolean)
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `拖拉重排：調整第 ${dayList.join('、')} 天順序與時間（${changedCount} 項）`,
      proposedBy: 'user',
      ops,
    }
    const ok = await submitPatch(patch)
    if (ok) {
      setDragMode(false)
      setDragHasChanges(false)
      showToast('已套用新順序，路程時間將自動重算', 'success')
    }
  }

  // ── 願望清單 → 加入某一天（#103；時段由 ExploreSheet 智慧建議傳入）─────────────
  // 用既有 add_activity patch 把願望清單項目變成當天活動（沿用歷程/還原機制）。
  // 插入後 RoutePrefetcher 會重算路程、太趕會亮燈、可一鍵修正。
  async function handleAddWishlistToDay(item: WishlistItem, dayIndex: number, startTime: string): Promise<boolean> {
    const typeMap: Record<string, Activity['type']> = {
      景點: 'sightseeing', 美食: 'food', 住宿: 'other', 親子: 'experience',
    }
    const activity: Activity = {
      id: nanoid(8),
      type: typeMap[item.category ?? ''] ?? 'other',
      title: item.name,
      startTime: startTime || '10:00',
      placeLabel: item.name,
      ...(item.lat != null && item.lng != null ? { location: { lat: item.lat, lng: item.lng } } : {}),
      ...(item.photoRef ? { photoRef: item.photoRef } : {}),
    }
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `從願望清單加入：${item.name}（第 ${dayIndex + 1} 天 ${activity.startTime}）`,
      proposedBy: 'user',
      ops: [{ op: 'add_activity', dayIndex, payload: activity }],
    }
    const ok = await submitPatch(patch)
    if (ok) {
      fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, status: 'added' }),
      }).catch(() => {})
    }
    return ok
  }

  // 採購：綁店整家排進某天 → 生成一張購物活動卡（要買清單放 notes）
  async function handleScheduleShopping(store: ScheduleStore, dayIndex: number, startTime: string): Promise<boolean> {
    const activity: Activity = {
      id: nanoid(8),
      type: 'shopping',
      title: store.placeName,
      startTime: startTime || '10:00',
      placeLabel: store.placeName,
      location: { lat: store.lat, lng: store.lng },
      ...(store.itemNames.length ? { notes: `要買：${store.itemNames.join('、')}` } : {}),
    }
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `採購排程：${store.placeName}（第 ${dayIndex + 1} 天 ${activity.startTime}）`,
      proposedBy: 'user',
      ops: [{ op: 'add_activity', dayIndex, payload: activity }],
    }
    return submitPatch(patch)
  }

  async function handleReplaceAccommodation(item: WishlistItem, dayIndex: number): Promise<boolean> {
    const accommodation: Accommodation = {
      id: nanoid(8),
      name: item.name,
      location: item.lat != null && item.lng != null
        ? { lat: item.lat, lng: item.lng }
        : { lat: 0, lng: 0 },
      checkInTime: '15:00',
      checkOutTime: '11:00',
      reservationStatus: 'needed',
      ...(item.photoRef ? { photoRef: item.photoRef } : {}),
    }
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `從願望清單設為住宿：${item.name}（第 ${dayIndex + 1} 天）`,
      proposedBy: 'user',
      ops: [{ op: 'set_day_accommodation', dayIndex, payload: accommodation }],
    }
    const ok = await submitPatch(patch)
    if (ok) {
      fetch(`/api/itinerary/${itineraryId}/wishlist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, status: 'added' }),
      }).catch(() => {})
    }
    return ok
  }

  // ── C：交給 AI 一次把願望清單排進行程（adjust → 方案 → 確認）─────────────────
  function handleAiArrangeWishlist(items: WishlistItem[]) {
    if (items.length === 0) return
    const list = items
      .map((w) => `・${w.name}${w.category ? `（${w.category}）` : ''}`)
      .join('\n')
    const msg =
      `請把以下「願望清單」景點安排進現有行程最合適的天與時段：\n${list}\n\n` +
      `安排原則：同一天就近順路、避免來回繞路、控制每天行程不要太趕；` +
      `若某景點明顯不適合任何一天，可說明原因不排入。只新增這些景點，不要刪除或更換既有行程。`
    setChatOpen(true)
    chat.queueMessage(msg, modelProvider)
  }

  // ── Helper: 偵測「強制修改」後的時間衝突，並顯示 toast ─────────────────────
  function notifyForceSaveResult(simulated: Activity[], action: string) {
    const overlaps = detectOverlaps(simulated)
    if (overlaps.length === 0) {
      showToast(`${action}（已強制套用，未連動調整）`, 'success')
      return
    }
    const sample = overlaps
      .slice(0, 2)
      .map((o) => `「${o.titleA}」與「${o.titleB}」重疊 ${o.overlapMin} 分鐘`)
      .join('；')
    const more = overlaps.length > 2 ? `等共 ${overlaps.length} 處` : ''
    showToast(`${action}，但出現時間衝突：${sample}${more}，請手動調整`, 'error')
  }

  // ── Edit activity ─────────────────────────────────────────────────────────
  function handleEditActivity(activity: Activity) {
    setModal({ open: true, mode: 'edit', activity, dayIndex: activeDay })
  }

  // 小幫手「用資料更新這張卡」：關詳情、鎖定此卡、切小幫手模式、開聊天
  function handleAssistantUpdate(activity: Activity) {
    setDetailActivity(null)
    setAssistantLock({ kind: 'activity', activityId: activity.id, dayIndex: activeDay, title: activity.title })
    chat.setChatMode('assistant')
    setChatOpen(true)
  }

  // 同上，但鎖定「住宿」（AI 只產 set_day_accommodation）
  function handleAssistantUpdateAccommodation(acc: Accommodation) {
    setDetailAccommodation(null)
    setAssistantLock({ kind: 'accommodation', dayIndex: activeDay, title: acc.name })
    chat.setChatMode('assistant')
    setChatOpen(true)
  }

  // 上傳卡片照片：壓縮 → 上傳 Storage → 回傳公開 URL（不發 patch；寫入 userPhotoUrl 由編輯視窗「儲存」統一處理）
  async function uploadActivityPhoto(activityId: string, file: File): Promise<string | null> {
    const img = await fileToCompressedBase64(file, 1280, 0.82)
    const res = await fetch(`/api/itinerary/${itineraryId}/upload-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, mimeType: img.mimeType, data: img.data }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return null
    return data.url ?? null
  }

  async function handleSaveEdit(updated: Activity) {
    if (modal.open === false || modal.mode !== 'edit') return
    const dayIndex = modal.dayIndex
    const before = modal.activity
    const activities = currentDayData?.activities ?? []

    const mainOp: PatchOp = {
      op: 'update_activity',
      dayIndex,
      activityId: updated.id,
      payload: updated,
      _before: before,
    }

    // 計算連動 shift plan
    const plan = computeEditShiftOps(before, updated, activities, dayIndex)

    // 若有超出範圍的活動 → 跳出衝突 dialog
    if (plan.outOfRangeWarnings.length > 0) {
      setConflictDialog({
        actionLabel: `修改：${updated.title}`,
        warnings: plan.outOfRangeWarnings,
        onForce: async () => {
          // 強制：只送主 op，不送 shift
          const forcePatch: ItineraryPatch = {
            patchId: nanoid(8),
            description: `手動編輯（強制）：${updated.title}`,
            proposedBy: 'user',
            ops: [mainOp],
          }
          const ok = await submitPatch(forcePatch)
          if (ok) {
            setModal({ open: false })
            const simulated = activities.map((a) => (a.id === updated.id ? updated : a))
            notifyForceSaveResult(simulated, `已修改「${updated.title}」`)
          }
        },
      })
      return
    }

    // 正常情境：套用主 op + shift ops
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `手動編輯：${updated.title}`,
      proposedBy: 'user',
      ops: [mainOp, ...plan.ops],
    }

    const ok = await submitPatch(patch)
    if (ok) {
      setModal({ open: false })
      showToast(
        plan.ops.length > 0
          ? `已更新「${updated.title}」，前後 ${plan.ops.length} 個活動時間已連動調整`
          : `已更新「${updated.title}」`,
        'success',
      )
    }
  }

  // ── 出發地時間編輯視窗（按編輯鈕開啟，確認才生效）：一次套用「整理行李開始」＋「出發時間」 ──
  //    出發時間＝第一活動開始 → setDepartureTime 整天順移；整理行李開始＝prepStartTime（純記錄）。
  //    兩者合成同一筆 update_day patch（一次歷程、一次確認）。
  async function handleSaveDeparture(prepStart: string, departure: string) {
    if (!currentDayData) { setDepartureEditOpen(false); return }
    const activities = currentDayData.activities
    const payload: { prepStartTime?: string; activities?: Activity[] } = {}
    if (prepStart && prepStart !== currentDayData.prepStartTime) payload.prepStartTime = prepStart
    const m = toMin(departure)
    if (m != null && activities.length) {
      const next = setDepartureTime(activities, m)
      if (next !== activities && changedTimeIds(activities, next).size > 0) payload.activities = next
    }
    if (payload.prepStartTime === undefined && payload.activities === undefined) {
      setDepartureEditOpen(false)
      return
    }
    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: '調整出發地時間',
      proposedBy: 'user',
      ops: [{ op: 'update_day', dayIndex: activeDay, payload }],
    }
    const ok = await submitPatch(patch)
    if (ok) { setDepartureEditOpen(false); showToast('已更新出發地時間', 'success') }
  }

  // ── 待辦動作：前往那天 / 一鍵標已預訂（活動、住宿）──────────────────────────
  function handleTodoGoDay(dayIndex: number) {
    setViewMode('list')
    setActiveDay(dayIndex)
  }
  async function handleTodoReserveActivity(dayIndex: number, activityId: string) {
    const day = displayItinerary.days.find((d) => d.dayIndex === dayIndex)
    const act = day?.activities.find((a) => a.id === activityId)
    if (!act) return
    const updated: Activity = { ...act, reservationStatus: 'reserved' }
    await submitPatch({
      patchId: nanoid(8),
      description: `標記已預訂：${act.title}`,
      proposedBy: 'user',
      ops: [{ op: 'update_activity', dayIndex, activityId, payload: updated, _before: act }],
    })
  }
  async function handleTodoReserveLodging(dayIndex: number) {
    const day = displayItinerary.days.find((d) => d.dayIndex === dayIndex)
    const acc = day?.accommodation
    if (!acc) return
    const updated: Accommodation = { ...acc, reservationStatus: 'reserved' }
    await submitPatch({
      patchId: nanoid(8),
      description: `標記住宿已預訂：${acc.name}`,
      proposedBy: 'user',
      ops: [{ op: 'set_day_accommodation', dayIndex, payload: updated }],
    })
  }

  // ── Delete activity ───────────────────────────────────────────────────────
  function handleDeleteActivity(activity: Activity) {
    setDeleteConfirm(activity)
  }

  async function confirmDelete() {
    if (!deleteConfirm || !currentDayData) return
    const dayIndex = activeDay
    const activities = currentDayData.activities
    const target = deleteConfirm
    if (!activities.some((a) => a.id === target.id)) { setDeleteConfirm(null); return }

    // 用 block 模型刪除：刪景點會連同其「前置交通卡」一起移除，並重排後面時間
    // （後續活動往前接、剩餘交通卡標籤對齊正確下一站）。景點消失→路線指紋變→
    // RoutePrefetcher 會自動重算 travelLegs，移動資訊隨之更新。
    const newActivities = deletePlace(activities, target.id)
    if (newActivities === activities) { setDeleteConfirm(null); return }

    const removedExtra = activities.length - newActivities.length - 1 // 除目標外另刪的（前置交通卡）
    const shiftedCount = changedTimeIds(activities, newActivities).size

    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `手動刪除：${target.title}`,
      proposedBy: 'user',
      ops: [{ op: 'update_day', dayIndex, payload: { activities: newActivities } }],
    }

    const ok = await submitPatch(patch)
    if (ok) {
      setDeleteConfirm(null)
      const extra = removedExtra > 0 ? '（含前置交通）' : ''
      showToast(
        shiftedCount > 0
          ? `已刪除「${target.title}」${extra}，後續時間已自動調整`
          : `已刪除「${target.title}」${extra}`,
        'success',
      )
    }
  }

  // ── Add activity ──────────────────────────────────────────────────────────
  function handleAddActivity(insertAfterIndex: number) {
    setModal({ open: true, mode: 'add', insertAfterIndex, dayIndex: activeDay })
  }

  async function handleSaveAdd(newActivity: Activity) {
    if (modal.open === false || modal.mode !== 'add') return
    const dayIndex = modal.dayIndex
    const activities = currentDayData?.activities ?? []

    const simulatedActivities = [...activities, newActivity].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    )
    const plan = computeInsertShiftOps(simulatedActivities, newActivity.id, dayIndex)

    const mainOp: PatchOp = { op: 'add_activity', dayIndex, payload: newActivity }

    if (plan.outOfRangeWarnings.length > 0) {
      setConflictDialog({
        actionLabel: `新增：${newActivity.title}`,
        warnings: plan.outOfRangeWarnings,
        onForce: async () => {
          const forcePatch: ItineraryPatch = {
            patchId: nanoid(8),
            description: `手動新增（強制）：${newActivity.title}`,
            proposedBy: 'user',
            ops: [mainOp],
          }
          const ok = await submitPatch(forcePatch)
          if (ok) {
            setModal({ open: false })
            notifyForceSaveResult(simulatedActivities, `已新增「${newActivity.title}」`)
          }
        },
      })
      return
    }

    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `手動新增：${newActivity.title}`,
      proposedBy: 'user',
      ops: [mainOp, ...plan.ops],
    }

    const ok = await submitPatch(patch)
    if (ok) {
      setModal({ open: false })
      showToast(
        plan.ops.length > 0
          ? `已新增「${newActivity.title}」，${plan.ops.length} 個活動時間已自動調整`
          : `已新增「${newActivity.title}」`,
        'success',
      )
    }
  }

  // ── Default startTime suggestion for "add" modal ───────────────────────────
  function getDefaultStartTime(): string {
    if (modal.open === false || modal.mode !== 'add') return '09:00'
    const activities = currentDayData?.activities ?? []
    const insertAfterIndex = modal.insertAfterIndex

    if (insertAfterIndex === -1) {
      // Inserting before everything: suggest 30 min before first activity
      const first = activities[0]
      if (first) {
        const [h, m] = first.startTime.split(':').map(Number)
        const total = Math.max(360, h * 60 + m - 30)
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
      }
      return '08:00'
    }

    const prev = activities[insertAfterIndex]
    if (prev?.endTime) return prev.endTime
    return '12:00'
  }

  const inner = (
    <div className="min-h-screen bg-[#FBFAF7]" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
      {/* 儲存中提示（#30）：所有儲存/刪除操作進行時顯示，避免使用者以為沒反應 */}
      {saving && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 bg-gray-900/90 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          儲存中...
        </div>
      )}
      {/* 背景路線預抓（在 APIProvider 內才能用 useMapsLibrary）：開行程即檢查並更新距離/時間 */}
      {MAPS_KEY && (
        <RoutePrefetcher
          itinerary={liveItinerary}
          itineraryId={itineraryId}
          onSaved={refreshItinerary}
        />
      )}
      {/* 一進行程就背景預抓所有天的天氣（不必等點到某天）*/}
      <WeatherPrefetcher itinerary={displayItinerary} />
      <ItineraryHeader
        itinerary={displayItinerary}
        itineraryId={itineraryId}
        role={role}
        onlineUsers={onlineUsers}
        currentUser={{ displayName: currentUser.displayName, avatarUrl: currentUser.avatarUrl, globalRole: currentUser.globalRole }}
        todoCount={todoBadge}
        onOpenTodos={() => setTodoOpen(true)}
        shoppingCount={shoppingBadge}
        onOpenShopping={() => setShoppingOpen(true)}
      />

      <TripInfoCard
        metadata={displayItinerary.metadata}
        itineraryId={itineraryId}
        canEdit={userCanEdit}
        onMetadataUpdated={handleMetadataUpdated}
        onDatesChange={handleDatesChange}
      />

      {/* 行程 / 地圖 切換（sticky 黏在 ItineraryHeader 下方，z-20 低於 header z-50 不影響 BugReportSheet） */}
      <div
        className="sticky z-20 bg-[#FBFAF7] px-4 pt-3 pb-2"
        style={{ top: 'calc(69px + env(safe-area-inset-top))' }}
      >
        <div className="flex gap-1 bg-stone-200/70 rounded-xl p-1">
          <button
            onClick={() => {
              // 地圖 → 行程：聚焦到地圖目前選取的最早一天
              if (viewMode === 'map' && mapSelectedDays.length > 0) {
                setActiveDay(Math.min(...mapSelectedDays))
              }
              setViewMode('list')
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
              viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            行程
          </button>
          <button
            onClick={() => {
              // 行程 → 地圖：有未套用的拖拉調整時先確認
              if (dragMode && dragHasChanges) {
                setDragSwitchConfirm('map')
                return
              }
              setMapSelectedDays([activeDay])
              setDragMode(false)
              setDragHasChanges(false)
              setViewMode('map')
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
              viewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            地圖
          </button>
          <button
            onClick={() => {
              // 行程 → 簡表：有未套用的拖拉調整時先確認
              if (dragMode && dragHasChanges) {
                setDragSwitchConfirm('summary')
                return
              }
              setDragMode(false)
              setDragHasChanges(false)
              setViewMode('summary')
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
              viewMode === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            簡表
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        dragMode ? (
          <DragSortView
            days={displayItinerary.days}
            initialDayIndex={activeDay}
            saving={saving}
            onApply={handleApplyReorder}
            onCancel={() => { setDragMode(false); setDragHasChanges(false) }}
            onDirtyChange={setDragHasChanges}
          />
        ) : (
        <>
          <DayTabs
            days={displayItinerary.days}
            activeDay={activeDay}
            onDayChange={setActiveDay}
          />

          {userCanEdit && (currentDayData?.activities.some((a) => a.type !== 'transport')) && (
            <div className="px-4 pt-2 flex items-center justify-end">
              <button
                onClick={() => { setDragMode(true); if (navigator.vibrate) navigator.vibrate(15) }}
                className="text-xs text-gray-500 active:text-gray-800 flex items-center gap-1 flex-shrink-0"
                title="長按卡片也可進入"
              >
                ⇅ 拖拉排序
              </button>
            </div>
          )}

          {/* 一鍵自動修正路程時間（有偏緊/超時路段才出現）：放天數列下方、行程內容最上方，明顯可見 */}
          {bufferWarnings.total > 0 && userCanEdit && canChat(role) && (
            <div className="px-4 pt-3">
              <button
                onClick={handleFixTravelTimes}
                disabled={fixingTravel}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm text-left transition-colors min-h-[44px] ${
                  bufferWarnings.red > 0
                    ? 'bg-red-50 border-red-100 text-red-700 active:bg-red-100'
                    : 'bg-amber-50 border-amber-100 text-amber-700 active:bg-amber-100'
                } disabled:opacity-50`}
              >
                <span className="flex-shrink-0">
                  {fixingTravel ? (
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]" />
                  ) : bufferWarnings.red > 0 ? '⚠️' : '🟡'}
                </span>
                <span className="flex-1">
                  {bufferWarnings.red > 0 && `${bufferWarnings.red} 段移動時間不足`}
                  {bufferWarnings.red > 0 && bufferWarnings.amber > 0 && '、'}
                  {bufferWarnings.amber > 0 && `${bufferWarnings.amber} 段偏緊`}
                </span>
                <span className="flex-shrink-0 font-semibold">
                  {fixingTravel ? 'AI 自動修正中…' : '一鍵自動修正 →'}
                </span>
              </button>
            </div>
          )}

          {currentDayData && (
            <DayView
              day={currentDayData}
              departure={(() => {
                // 每天的出發地：前一晚住宿；第 1 天用出發城市
                const prevAcc = displayItinerary.days.find((d) => d.dayIndex === activeDay - 1)?.accommodation
                if (prevAcc) return { name: prevAcc.name, location: prevAcc.location }
                const origin = displayItinerary.metadata.originCity
                if (activeDay === 0 && origin) return { name: origin, isHome: true }
                return undefined
              })()}
              arrival={(() => {
                // 旅程終點（#41）：最後一天顯示返回城市（沒填則用出發城市）
                if (activeDay !== displayItinerary.days.length - 1) return undefined
                const name = displayItinerary.metadata.returnCity ?? displayItinerary.metadata.originCity
                return name ? { name } : undefined
              })()}
              currency={displayItinerary.metadata.currency}
              canEdit={userCanEdit}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onAddActivity={handleAddActivity}
              onActivityClick={setDetailActivity}
              onAddNote={userCanEdit ? setAddNoteFor : undefined}
              hasNoteFor={aiNotes.hasNoteFor}
              onEditAccommodation={userCanEdit ? setEditAccommodation : undefined}
              onAddNoteAccommodation={userCanEdit ? (acc) => setAddNoteFor({ id: `acc-${activeDay}`, title: acc.name, type: 'other', startTime: acc.checkInTime }) : undefined}
              onOpenAccommodation={setDetailAccommodation}
              hasNoteForAccommodation={aiNotes.notes.some(n => n.activityId === `acc-${activeDay}`)}
              onEditTheme={() => setEditThemeOpen(true)}
              onEditDeparture={userCanEdit ? () => setDepartureEditOpen(true) : undefined}
              onLongPressActivity={userCanEdit ? () => { setDragMode(true); if (navigator.vibrate) navigator.vibrate(15) } : undefined}
            />
          )}
        </>
        )
      ) : viewMode === 'summary' ? (
        <>
          <DayTabs
            days={displayItinerary.days}
            activeDay={activeDay}
            onDayChange={setActiveDay}
          />
          {currentDayData && (
            <SummaryView
              day={currentDayData}
              dateLabel={fmtDateLabel(currentDayData.date)}
              departure={(() => {
                const prevAcc = displayItinerary.days.find((d) => d.dayIndex === activeDay - 1)?.accommodation
                if (prevAcc) return { name: prevAcc.name }
                const origin = displayItinerary.metadata.originCity
                if (activeDay === 0 && origin) return { name: origin }
                return null
              })()}
              arrival={(() => {
                if (activeDay !== displayItinerary.days.length - 1) return null
                const name = displayItinerary.metadata.returnCity ?? displayItinerary.metadata.originCity
                return name ? { name } : null
              })()}
            />
          )}
        </>
      ) : (
        <div className="mt-3" style={{ height: 'calc(100dvh - 240px)' }}>
          <MapView
            itinerary={displayItinerary}
            itineraryId={itineraryId}
            selectedDays={mapSelectedDays}
            onSelectedDaysChange={setMapSelectedDays}
            onLegsSaved={refreshItinerary}
          />
        </div>
      )}

      {/* History link */}
      <div className="px-4 mt-2 mb-8">
        <Link
          href={`/itinerary/${itineraryId}/history`}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          查看修改歷程
        </Link>
      </div>

      {/* 備註籃 FAB（在「和 AI 說」上方，有備註時才顯示）*/}
      {canChat(role) && aiNotes.notes.length > 0 && (
        <button
          onClick={() => setNotesSheetOpen(true)}
          className="fixed z-30 bg-amber-500 text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3 font-medium text-sm active:scale-95 transition-transform"
          style={{
            bottom: 'calc(128px + env(safe-area-inset-bottom))',
            right: '16px',
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14v5a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h5" />
          </svg>
          備註籃 {aiNotes.notes.length}
        </button>
      )}

      {/* Chat FAB */}
      {canChat(role) && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed z-30 bg-purple-600 text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3 font-medium text-sm active:scale-95 transition-transform"
          style={{
            bottom: 'calc(68px + env(safe-area-inset-bottom))',
            right: '16px',
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          和 AI 說
        </button>
      )}

      {/* 單景點備註輸入框 */}
      {addNoteFor && (
        <AddNoteModal
          activityTitle={addNoteFor.title}
          onSave={(note) => {
            aiNotes.addNote({
              activityId: addNoteFor.id,
              dayIndex: activeDay,
              activityTitle: addNoteFor.title,
              note,
            })
            setAddNoteFor(null)
            showToast('已加入備註籃', 'success')
          }}
          onClose={() => setAddNoteFor(null)}
        />
      )}

      {/* 備註管理 Sheet */}
      {notesSheetOpen && canChat(role) && (
        <AINotesSheet
          notes={aiNotes.notes}
          isSubmitting={submittingNotes}
          onUpdateNote={aiNotes.updateNote}
          onRemoveNote={aiNotes.removeNote}
          onClearAll={aiNotes.clearNotes}
          onSubmit={handleSubmitNotes}
          onClose={() => setNotesSheetOpen(false)}
        />
      )}

      {/* Chat bottom sheet */}
      {chatOpen && canChat(role) && (
        <ChatSheet
          itineraryId={itineraryId}
          chat={chat}
          onClose={() => setChatOpen(false)}
          onPatchApplied={refreshItinerary}
          assistantLock={assistantLock}
          onClearAssistantLock={() => setAssistantLock(null)}
        />
      )}

      {exploreOpen && (
        <ExploreSheet
          itineraryId={itineraryId}
          destination={[displayItinerary.metadata.destination, displayItinerary.metadata.title].filter(Boolean).join(' ')}
          days={displayItinerary.days}
          targetDayIndex={exploreTargetDay}
          onClose={() => setExploreOpen(false)}
          onAddToDay={handleAddWishlistToDay}
          onReplaceAccommodation={userCanEdit ? handleReplaceAccommodation : undefined}
          onAiArrange={handleAiArrangeWishlist}
          shoppingItems={shopping.items}
          onToggleShopping={shopping.toggleItem}
          onScheduleShopping={handleScheduleShopping}
        />
      )}

      {/* Activity edit/add modal */}
      {modal.open && (
        <ActivityEditModal
          mode={modal.mode}
          initial={
            modal.mode === 'edit'
              ? modal.activity
              : { startTime: getDefaultStartTime(), endTime: undefined }
          }
          onSave={modal.mode === 'edit' ? handleSaveEdit : handleSaveAdd}
          onClose={() => setModal({ open: false })}
          onUploadPhoto={userCanEdit ? uploadActivityPhoto : undefined}
        />
      )}

      {/* Accommodation detail modal（點卡片開）*/}
      {detailAccommodation && (
        <AccommodationDetailModal
          accommodation={detailAccommodation}
          dayNumber={activeDay + 1}
          onClose={() => setDetailAccommodation(null)}
          canEdit={userCanEdit}
          onEdit={userCanEdit ? setEditAccommodation : undefined}
          onAddNote={userCanEdit ? (acc) => setAddNoteFor({ id: `acc-${activeDay}`, title: acc.name, type: 'other', startTime: acc.checkInTime }) : undefined}
          onAssistantUpdate={userCanEdit && canChat(role) ? handleAssistantUpdateAccommodation : undefined}
          hasNote={aiNotes.notes.some(n => n.activityId === `acc-${activeDay}`)}
        />
      )}

      {/* Accommodation edit modal */}
      {editAccommodation && (
        <AccommodationEditModal
          accommodation={editAccommodation}
          onSave={handleSaveAccommodation}
          onClose={() => setEditAccommodation(null)}
          onUploadPhoto={userCanEdit ? uploadActivityPhoto : undefined}
          currency={displayItinerary.metadata.currency}
        />
      )}

      {/* 每日簡介編輯 modal */}
      {editThemeOpen && currentDayData && (
        <ThemeEditModal
          dayNumber={activeDay + 1}
          initialTheme={currentDayData.theme ?? ''}
          onSave={handleSaveTheme}
          onClose={() => setEditThemeOpen(false)}
        />
      )}

      <TodoSheet
        open={todoOpen}
        onClose={() => setTodoOpen(false)}
        autoTodos={autoTodosActive}
        resolvedAutoTodos={resolvedAutoTodos}
        manualTodos={manualTodos}
        canEdit={userCanEdit}
        onAddTodo={todoState.addTodo}
        onToggleTodo={todoState.toggleTodo}
        onEditTodo={todoState.editTodo}
        onDeleteTodo={todoState.deleteTodo}
        onResolveAuto={todoState.resolveAuto}
        onGoDay={handleTodoGoDay}
        onReserveActivity={handleTodoReserveActivity}
        onReserveLodging={handleTodoReserveLodging}
      />

      {shoppingOpen && (
        <ShoppingSheet
          days={displayItinerary.days}
          destination={[displayItinerary.metadata.destination, displayItinerary.metadata.title].filter(Boolean).join(' ')}
          items={shopping.items}
          canEdit={userCanEdit}
          onAdd={shopping.addItem}
          onEdit={shopping.editItem}
          onToggle={shopping.toggleItem}
          onDelete={shopping.deleteItem}
          onSchedule={handleScheduleShopping}
          onClose={() => setShoppingOpen(false)}
        />
      )}

      {currentDayData && (
        <DepartureEditModal
          open={departureEditOpen}
          prepStart={
            currentDayData.prepStartTime ??
            (() => {
              const m = toMin(currentDayData.activities[0]?.startTime)
              return m != null ? fromMin(Math.max(0, m - 90)) : ''
            })()
          }
          departTime={currentDayData.activities[0]?.startTime ?? ''}
          onClose={() => setDepartureEditOpen(false)}
          onSave={handleSaveDeparture}
        />
      )}

      {/* 日期變更 → 天數變化處理對話（#19）*/}
      {dateChange && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setDateChange(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
              <div className="text-3xl text-center mb-3">📅</div>
              {dateChange.newCount > dateChange.oldCount ? (
                <>
                  <h3 className="font-semibold text-gray-900 text-center mb-2">天數變多了</h3>
                  <p className="text-sm text-gray-600 text-center mb-5">
                    行程從 <span className="font-medium">{dateChange.oldCount}</span> 天增加為{' '}
                    <span className="font-medium text-purple-700">{dateChange.newCount}</span> 天，
                    新增的第 {dateChange.oldCount + 1}~{dateChange.newCount} 天目前是空白的，要如何處理？
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={applyDateChangeWithAI} disabled={saving}
                      className="w-full py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl disabled:opacity-60">
                      ✨ 請 AI 幫我補齊新增的天數
                    </button>
                    <button onClick={applyDateChangeKeepOrTrim} disabled={saving}
                      className="w-full py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl disabled:opacity-60">
                      新增空白天，我自己排
                    </button>
                    <button onClick={() => setDateChange(null)}
                      className="w-full py-2.5 text-sm text-gray-400">取消</button>
                  </div>
                  {/* #24 給 AI 的補充說明 */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <label className="text-xs text-gray-500 mb-1 block">給 AI 的補充說明（選填，選「請 AI」時一起送出）</label>
                    <textarea
                      value={dateChangeNote}
                      onChange={(e) => setDateChangeNote(e.target.value)}
                      rows={2}
                      placeholder="例：新增的天想去都蘭、東河一帶，住台東市區"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-900 text-center mb-2">天數變少了</h3>
                  <p className="text-sm text-gray-600 text-center mb-5">
                    行程從 <span className="font-medium">{dateChange.oldCount}</span> 天減少為{' '}
                    <span className="font-medium text-amber-700">{dateChange.newCount}</span> 天，
                    第 {dateChange.newCount + 1}~{dateChange.oldCount} 天（含活動）將被移除，要如何處理？
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={applyDateChangeWithAI} disabled={saving}
                      className="w-full py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl disabled:opacity-60">
                      ✨ 請 AI 幫我重新濃縮調整
                    </button>
                    <button onClick={applyDateChangeKeepOrTrim} disabled={saving}
                      className="w-full py-3 text-sm font-semibold text-white bg-amber-500 rounded-2xl disabled:opacity-60">
                      直接刪除最後 {dateChange.oldCount - dateChange.newCount} 天
                    </button>
                    <button onClick={() => setDateChange(null)}
                      className="w-full py-2.5 text-sm text-gray-400">取消</button>
                  </div>
                  {/* #24 給 AI 的補充說明 */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <label className="text-xs text-gray-500 mb-1 block">給 AI 的補充說明（選填，選「請 AI」時一起送出）</label>
                    <textarea
                      value={dateChangeNote}
                      onChange={(e) => setDateChangeNote(e.target.value)}
                      rows={2}
                      placeholder="例：保留綠島兩天，刪掉嘉義那兩天"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* 拖拉排序未套用時切換檢視的確認 dialog（地圖／簡表共用） */}
      {dragSwitchConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setDragSwitchConfirm(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
              <div className="text-3xl text-center mb-3">⇅</div>
              <h3 className="font-semibold text-gray-900 text-center mb-2">拖拉排序尚未套用</h3>
              <p className="text-sm text-gray-500 text-center mb-5">
                切換到{dragSwitchConfirm === 'map' ? '地圖' : '簡表'}後，目前的排序調整將會消失。
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setDragSwitchConfirm(null)}
                  className="w-full py-3 text-sm font-semibold text-white bg-purple-600 rounded-2xl"
                >
                  繼續編輯
                </button>
                <button
                  onClick={() => {
                    const target = dragSwitchConfirm
                    setDragSwitchConfirm(null)
                    setDragMode(false)
                    setDragHasChanges(false)
                    if (target === 'map') setMapSelectedDays([activeDay])
                    setViewMode(target)
                  }}
                  className="w-full py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl"
                >
                  放棄調整，切換{dragSwitchConfirm === 'map' ? '地圖' : '簡表'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Activity detail modal（點擊卡片開啟；編輯/刪除/備註收在此） */}
      {detailActivity && (
        <ActivityDetailModal
          activity={detailActivity}
          dayNumber={activeDay + 1}
          onClose={() => setDetailActivity(null)}
          canEdit={userCanEdit}
          onEdit={handleEditActivity}
          onDelete={handleDeleteActivity}
          onAddNote={userCanEdit ? setAddNoteFor : undefined}
          hasNote={aiNotes.hasNoteFor(detailActivity.id)}
          onAssistantUpdate={userCanEdit && canChat(role) ? handleAssistantUpdate : undefined}
        />
      )}

      {/* Conflict dialog (時間調整超出範圍) */}
      {conflictDialog && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
            onClick={() => setConflictDialog(null)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
              <div className="text-3xl text-center mb-3">⚠️</div>
              <h3 className="font-semibold text-gray-900 text-center mb-2">時間調整超出合理範圍</h3>
              <p className="text-sm text-gray-600 text-center mb-3">
                套用「<span className="font-medium text-gray-900">{conflictDialog.actionLabel}</span>」後，
                以下活動會被推到不合理的時間（早於 06:00 或晚於 23:59）：
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-4 max-h-56 overflow-y-auto">
                <ul className="text-sm text-amber-800 flex flex-col gap-1.5">
                  {conflictDialog.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 flex-shrink-0">•</span>
                      <span>
                        「{w.activityTitle}」會被
                        {w.bound === 'too-early' ? '提前' : '延後'}到{' '}
                        <span className="font-semibold">{w.computedTime}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setConflictDialog(null)}
                  className="w-full py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50"
                >
                  維持現況（取消修改）
                </button>
                <button
                  onClick={async () => {
                    const fn = conflictDialog.onForce
                    setConflictDialog(null)
                    await fn()
                  }}
                  disabled={saving}
                  className="w-full py-3 text-sm font-semibold text-white bg-amber-500 rounded-2xl hover:bg-amber-600 disabled:opacity-60"
                >
                  強制修改（不調整其他活動）
                </button>
                <p className="text-xs text-gray-400 text-center mt-1">
                  ⚠️ 強制修改後可能會造成時間衝突，系統會在套用後提示
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
              <div className="text-3xl text-center mb-3">🗑️</div>
              <h3 className="font-semibold text-gray-900 text-center mb-2">確認刪除</h3>
              <p className="text-sm text-gray-500 text-center mb-1">
                確定要刪除「<span className="font-medium text-gray-900">{deleteConfirm.title}</span>」嗎？
              </p>
              <p className="text-xs text-gray-400 text-center mb-5">後續活動的時間將自動往前調整</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-2xl hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={saving}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-2xl hover:bg-red-600 disabled:opacity-60"
                >
                  {saving ? '刪除中...' : '確認刪除'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 底部操作列：探索 / 願望清單 / 新增（行程檢視，可編輯者）*/}
      {viewMode === 'list' && !dragMode && userCanEdit && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-black/5 flex items-stretch"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            onClick={() => { setExploreTargetDay(null); setExploreOpen(true) }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-500 active:bg-gray-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.8 9.2 11 11 9.2 14.8 13 13Z" />
            </svg>
            <span className="text-[11px]">探索</span>
          </button>
          <button
            onClick={() => { setExploreTargetDay(activeDay); setExploreOpen(true) }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-500 active:bg-gray-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5C6 16.5 3.5 13 3.5 9.5 3.5 7 5.5 5.2 7.8 5.2c1.6 0 3 .9 4.2 2.6 1.2-1.7 2.6-2.6 4.2-2.6 2.3 0 4.3 1.8 4.3 4.3 0 3.5-2.5 7-8.5 11Z" />
            </svg>
            <span className="text-[11px]">願望清單</span>
          </button>
          <button
            onClick={() => handleAddActivity((currentDayData?.activities.length ?? 0) - 1)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-purple-600 active:bg-purple-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-[11px] font-medium">新增</span>
          </button>
        </div>
      )}
    </div>
  )
  // APIProvider 包裹全頁，讓 AddressAutocomplete / MapView 都能用 useMapsLibrary
  return MAPS_KEY ? (
    <APIProvider apiKey={MAPS_KEY} language="zh-TW" region="TW">{inner}</APIProvider>
  ) : inner
}
