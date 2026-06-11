import type { Accommodation } from '@/lib/types/itinerary'
import { formatMoney } from '@/lib/utils/currency'
import { mapsNavUrl } from './ActivityCard'

interface AccommodationCardProps {
  accommodation: Accommodation
  canEdit?: boolean
  hasNote?: boolean
  onEdit?: (acc: Accommodation) => void
  onAddNote?: (acc: Accommodation) => void
}

export function AccommodationCard({ accommodation, canEdit, hasNote, onEdit, onAddNote }: AccommodationCardProps) {
  return (
    <div className="mx-0 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 relative">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🏨</span>
        <span className="text-sm font-medium text-indigo-700">住宿</span>

        {/* 編輯 + AI 備註鈕 */}
        {canEdit && (
          <div className="absolute top-3 right-3 flex gap-1">
            {onAddNote && (
              <button
                onClick={() => onAddNote(accommodation)}
                title="AI 備註"
                className="relative w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-gray-400 hover:text-amber-600 hover:bg-white shadow-sm transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5h8M8 14h5m-5 6.5l-3 1.5v-4.5A2.5 2.5 0 014.5 15h-.25A2.25 2.25 0 012 12.75v-6.5A2.25 2.25 0 014.25 4h15.5A2.25 2.25 0 0122 6.25v6.5A2.25 2.25 0 0119.75 15H11l-3 2.5z" />
                </svg>
                {hasNote && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                )}
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(accommodation)}
                title="編輯住宿"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-gray-400 hover:text-purple-600 hover:bg-white shadow-sm transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 mb-1 pr-16">{accommodation.name}</h3>
      {accommodation.location?.address && (
        <a
          href={mapsNavUrl(accommodation.location)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-blue-500 underline decoration-blue-200 underline-offset-2 mb-2 active:text-blue-700"
        >
          📍 {accommodation.location.address}
        </a>
      )}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>入住 {accommodation.checkInTime}</span>
        <span>退房 {accommodation.checkOutTime}</span>
        {accommodation.cost && (
          <span className="ml-auto font-medium">{formatMoney(accommodation.cost)}/晚</span>
        )}
      </div>
      {accommodation.bookingUrl && (
        <a
          href={accommodation.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-600 underline mt-1 block"
        >
          訂房連結
        </a>
      )}
    </div>
  )
}
