import type { ChatMessage as ChatMessageType } from '@/lib/types/collaboration'
import { Avatar } from '@/components/ui/Avatar'
import { formatRelativeTime } from '@/lib/utils/date'
import { clsx } from 'clsx'
import type { AIPlan } from '@/lib/types/patch'

interface ChatMessageProps {
  message: ChatMessageType
}

interface AppliedPatchData {
  plans: AIPlan[]
  selectedPlanIndex: number
  selectedPlanTitle: string
}

/**
 * Parse the patch field to determine status and selected plan info.
 * The patch field can be:
 *   - AIPlan[]                  → pending_selection (raw plans array)
 *   - AppliedPatchData object   → applied (plans + selection info)
 *   - null                      → no patch
 */
function parsePatchField(patch: unknown): {
  plans: AIPlan[] | null
  selected: { planIndex: number; title: string } | null
} {
  if (!patch) return { plans: null, selected: null }
  if (Array.isArray(patch)) return { plans: patch as AIPlan[], selected: null }
  const obj = patch as Partial<AppliedPatchData>
  return {
    plans: Array.isArray(obj.plans) ? obj.plans : null,
    selected:
      typeof obj.selectedPlanIndex === 'number'
        ? { planIndex: obj.selectedPlanIndex, title: obj.selectedPlanTitle ?? '' }
        : null,
  }
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const displayName = message.profile?.display_name ?? (isUser ? '你' : 'AI 助手')
  const avatarSrc = message.profile?.avatar_url

  const { plans, selected } = parsePatchField(message.patch)

  const isPending = message.patch_status === 'pending_selection'
  const isApplied = message.patch_status === 'applied'
  const isCancelled = message.patch_status === 'cancelled'
  const hasPendingPlans = isPending && plans && plans.length > 0

  // Strip any legacy <patch>…</patch> or <plans>…</plans> tags.
  // Also strip incomplete <plans> (no closing tag) — these are from truncated old responses.
  const rawContent = message.content
    .replace(/<patch>[\s\S]*?<\/patch>/g, '')
    .replace(/<plans>[\s\S]*?<\/plans>/g, '')
    .replace(/<plans>[\s\S]*/g, '')   // handle truncated <plans> with no closing tag
    .trim()

  // Detect raw JSON accidentally stored in content (old bug: plans JSON stored without <plans> tags)
  const looksLikeRawJson = rawContent.startsWith('[{') || rawContent.startsWith('[\n{') ||
    (rawContent.startsWith('{') && rawContent.includes('"planIndex"'))

  // For pending/applied/cancelled assistant messages: don't show raw content.
  // Also suppress content that looks like raw plan JSON (legacy messages).
  const showRawContent = isUser || (
    (message.patch_status === 'none' || !message.patch_status) && !looksLikeRawJson
  )

  return (
    <div className={clsx('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar
        name={isUser ? displayName : 'AI'}
        src={isUser ? avatarSrc : undefined}
        size="sm"
        className="flex-shrink-0 mt-1"
      />

      <div className={clsx('max-w-[80%] flex flex-col', isUser ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        {showRawContent && rawContent && (
          <div
            className={clsx(
              'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
              isUser
                ? 'bg-purple-600 text-white rounded-tr-sm'
                : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm shadow-sm',
            )}
          >
            {rawContent}
          </div>
        )}

        {/* ── Pending selection badge ── */}
        {hasPendingPlans && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <p className="text-sm font-semibold text-purple-800">
              ✨ AI 提供了 {plans!.length} 個調整方案
            </p>
            <p className="text-xs text-purple-500 mt-0.5">請在下方選擇、取消或重新生成</p>
          </div>
        )}

        {/* ── Applied badge ── */}
        {isApplied && !isUser && (
          <div className="bg-green-50 border border-green-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            {selected ? (
              <>
                <p className="text-sm font-semibold text-green-800">
                  ✓ 已套用方案 {selected.planIndex}
                </p>
                {selected.title && (
                  <p className="text-xs text-green-600 mt-0.5">「{selected.title}」</p>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold text-green-800">✓ 方案已套用</p>
            )}
          </div>
        )}

        {/* ── Cancelled badge ── */}
        {isCancelled && !isUser && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
            <p className="text-sm text-gray-500">已取消調整</p>
          </div>
        )}

        <span className="text-[10px] text-gray-400 mt-1">
          {formatRelativeTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
