'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { nanoid } from 'nanoid'
import { useItinerary } from '@/lib/hooks/useItinerary'
import { usePresence } from '@/lib/hooks/usePresence'
import { useChat } from '@/lib/hooks/useChat'
import { canChat, canEdit } from '@/lib/utils/permissions'
import {
  computeDeleteShiftOps,
  computeInsertShiftOps,
  computeEditShiftOps,
  detectOverlaps,
  type ShiftWarning,
} from '@/lib/utils/activityTime'
import type { Itinerary, TripMetadata, Activity } from '@/lib/types/itinerary'
import type { ItineraryPatch, PatchOp } from '@/lib/types/patch'
import type { MemberRole, GlobalRole } from '@/lib/types/collaboration'
import { ItineraryHeader } from '@/components/itinerary/ItineraryHeader'
import { DayTabs } from '@/components/itinerary/DayTabs'
import { DayView } from '@/components/itinerary/DayView'
import { TripInfoCard } from '@/components/itinerary/TripInfoCard'
import { ChatSheet } from '@/components/ai/ChatSheet'
import { ActivityEditModal } from '@/components/itinerary/ActivityEditModal'
import { ActivityDetailModal } from '@/components/itinerary/ActivityDetailModal'
import { MapView } from '@/components/map/MapView'
import { useToast } from '@/components/ui/Toast'

type ViewMode = 'list' | 'map'

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
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [mapSelectedDays, setMapSelectedDays] = useState<number[]>([0])
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null)
  const [localMetadata, setLocalMetadata] = useState<TripMetadata | null>(null)
  const [modal, setModal] = useState<ModalState>({ open: false })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Activity | null>(null)
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null)

  const { itinerary, refresh: refreshItinerary } = useItinerary(itineraryId)
  const liveItinerary = itinerary ?? initialItinerary
  const displayItinerary = localMetadata
    ? { ...liveItinerary, metadata: localMetadata }
    : liveItinerary

  const onlineUsers = usePresence(itineraryId, currentUser, activeDay)
  const chat = useChat(itineraryId)
  const { showToast } = useToast()

  const currentDayData = displayItinerary.days[activeDay]
  const userCanEdit = canEdit(role)

  const handleMetadataUpdated = useCallback((newMetadata: TripMetadata) => {
    setLocalMetadata(newMetadata)
  }, [])

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

  // ── Delete activity ───────────────────────────────────────────────────────
  function handleDeleteActivity(activity: Activity) {
    setDeleteConfirm(activity)
  }

  async function confirmDelete() {
    if (!deleteConfirm || !currentDayData) return
    const dayIndex = activeDay
    const activities = currentDayData.activities
    const deletedIdx = activities.findIndex((a) => a.id === deleteConfirm.id)
    if (deletedIdx === -1) { setDeleteConfirm(null); return }
    const target = deleteConfirm

    const mainOp: PatchOp = {
      op: 'remove_activity', dayIndex, activityId: target.id, _before: target,
    }

    const plan = computeDeleteShiftOps(activities, deletedIdx, dayIndex)

    if (plan.outOfRangeWarnings.length > 0) {
      setConflictDialog({
        actionLabel: `刪除：${target.title}`,
        warnings: plan.outOfRangeWarnings,
        onForce: async () => {
          const forcePatch: ItineraryPatch = {
            patchId: nanoid(8),
            description: `手動刪除（強制）：${target.title}`,
            proposedBy: 'user',
            ops: [mainOp],
          }
          const ok = await submitPatch(forcePatch)
          if (ok) {
            setDeleteConfirm(null)
            const simulated = activities.filter((a) => a.id !== target.id)
            notifyForceSaveResult(simulated, `已刪除「${target.title}」`)
          }
        },
      })
      return
    }

    const patch: ItineraryPatch = {
      patchId: nanoid(8),
      description: `手動刪除：${target.title}`,
      proposedBy: 'user',
      ops: [mainOp, ...plan.ops],
    }

    const ok = await submitPatch(patch)
    if (ok) {
      setDeleteConfirm(null)
      showToast(
        plan.ops.length > 0
          ? `已刪除「${target.title}」，後方 ${plan.ops.length} 個活動時間已自動調整`
          : `已刪除「${target.title}」`,
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

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <ItineraryHeader
        itinerary={displayItinerary}
        itineraryId={itineraryId}
        role={role}
        onlineUsers={onlineUsers}
        currentUser={{ displayName: currentUser.displayName, avatarUrl: currentUser.avatarUrl, globalRole: currentUser.globalRole }}
      />

      <TripInfoCard
        metadata={displayItinerary.metadata}
        itineraryId={itineraryId}
        canEdit={userCanEdit}
        onMetadataUpdated={handleMetadataUpdated}
      />

      {/* 行程 / 地圖 切換（sticky 置頂） */}
      <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur px-4 pt-3 pb-2">
        <div className="flex gap-1 bg-gray-100 rounded-full p-1 w-max">
          <button
            onClick={() => {
              // 地圖 → 行程：聚焦到地圖目前選取的最早一天
              if (viewMode === 'map' && mapSelectedDays.length > 0) {
                setActiveDay(Math.min(...mapSelectedDays))
              }
              setViewMode('list')
            }}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
              viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            行程
          </button>
          <button
            onClick={() => {
              // 行程 → 地圖：同步到目前檢視的那一天
              setMapSelectedDays([activeDay])
              setViewMode('map')
            }}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
              viewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            地圖
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          <DayTabs
            days={displayItinerary.days}
            activeDay={activeDay}
            onDayChange={setActiveDay}
          />

          {currentDayData && (
            <DayView
              day={currentDayData}
              currency={displayItinerary.metadata.currency}
              canEdit={userCanEdit}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onAddActivity={handleAddActivity}
              onActivityClick={setDetailActivity}
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

      {/* Chat FAB */}
      {canChat(role) && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed z-30 bg-purple-600 text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3 font-medium text-sm active:scale-95 transition-transform"
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom))',
            right: '16px',
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          和 AI 說
        </button>
      )}

      {/* Chat bottom sheet */}
      {chatOpen && canChat(role) && (
        <ChatSheet
          itineraryId={itineraryId}
          chat={chat}
          onClose={() => setChatOpen(false)}
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
        />
      )}

      {/* Activity detail modal（點擊卡片開啟） */}
      {detailActivity && (
        <ActivityDetailModal
          activity={detailActivity}
          dayNumber={activeDay + 1}
          onClose={() => setDetailActivity(null)}
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
    </div>
  )
}
