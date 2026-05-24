import type { ItineraryDay } from '@/lib/types/itinerary'
import { formatAmount } from '@/lib/utils/currency'

interface CostSummaryProps {
  day: ItineraryDay
  currency: string
}

export function CostSummary({ day, currency }: CostSummaryProps) {
  const activityTotal = day.activities.reduce((sum, a) => {
    if (!a.cost) return sum
    // Simple currency conversion — only sums same currency
    if (a.cost.currency === currency) return sum + a.cost.amount
    return sum
  }, 0)

  const accommodationTotal = day.accommodation?.cost?.currency === currency
    ? (day.accommodation?.cost?.amount ?? 0)
    : 0

  const total = activityTotal + accommodationTotal
  if (total === 0) return null

  return (
    <div className="mx-0 mb-4 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">今日小計（{currency}）</span>
        <span className="font-semibold text-gray-900">{formatAmount(total, currency)}</span>
      </div>
    </div>
  )
}
