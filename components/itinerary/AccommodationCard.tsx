import type { Accommodation } from '@/lib/types/itinerary'
import { formatMoney } from '@/lib/utils/currency'

interface AccommodationCardProps {
  accommodation: Accommodation
}

export function AccommodationCard({ accommodation }: AccommodationCardProps) {
  return (
    <div className="mx-0 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🏨</span>
        <span className="text-sm font-medium text-indigo-700">住宿</span>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{accommodation.name}</h3>
      {accommodation.location.address && (
        <p className="text-sm text-gray-500 mb-2">📍 {accommodation.location.address}</p>
      )}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>入住 {accommodation.checkInTime}</span>
        <span>退房 {accommodation.checkOutTime}</span>
        {accommodation.cost && (
          <span className="ml-auto font-medium">{formatMoney(accommodation.cost)}/晚</span>
        )}
      </div>
    </div>
  )
}
