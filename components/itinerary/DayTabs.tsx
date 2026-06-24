'use client'

import { useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import type { ItineraryDay } from '@/lib/types/itinerary'
import { formatDateShort, formatWeekday } from '@/lib/utils/date'
import { deriveDayCity } from '@/lib/itinerary/deriveCity'

interface DayTabsProps {
  days: ItineraryDay[]
  activeDay: number
  onDayChange: (dayIndex: number) => void
}

export function DayTabs({ days, activeDay, onDayChange }: DayTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Scroll active tab into view when switching days
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeDay])

  return (
    <div
      className="bg-[#FBFAF7] border-b border-black/5 sticky z-10"
      style={{ top: 'calc(137px + env(safe-area-inset-top))' }}
    >
      <div
        ref={scrollRef}
        className="flex overflow-x-auto no-scrollbar scroll-touch px-4 gap-2 py-2.5"
      >
        {days.map((day) => {
          const isActive = day.dayIndex === activeDay
          return (
            <button
              key={day.dayIndex}
              ref={isActive ? activeRef : undefined}
              onClick={() => onDayChange(day.dayIndex)}
              className={clsx(
                'flex-shrink-0 flex flex-col items-center px-4 py-1.5 rounded-xl transition-all duration-150 tap-target',
                isActive
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50 active:bg-gray-50',
              )}
            >
              <span className="text-xs font-medium">第 {day.dayIndex + 1} 天</span>
              <span className={clsx('text-[10px] mt-0.5', isActive ? 'text-white/75' : 'text-gray-400')}>{formatDateShort(day.date)}（{formatWeekday(day.date)}）</span>
              {deriveDayCity(day) && (
                <span className={clsx('text-[10px] truncate max-w-[64px]', isActive ? 'text-white/75' : 'text-gray-400')}>{deriveDayCity(day)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
