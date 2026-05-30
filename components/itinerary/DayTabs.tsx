'use client'

import { useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import type { ItineraryDay } from '@/lib/types/itinerary'
import { formatDateShort } from '@/lib/utils/date'

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
    <div className="bg-white border-b border-gray-100 sticky top-[60px] z-10">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto no-scrollbar scroll-touch px-4 gap-1 py-2"
      >
        {days.map((day) => {
          const isActive = day.dayIndex === activeDay
          return (
            <button
              key={day.dayIndex}
              ref={isActive ? activeRef : undefined}
              onClick={() => onDayChange(day.dayIndex)}
              className={clsx(
                'flex-shrink-0 flex flex-col items-center px-4 py-2 rounded-xl transition-all duration-150 tap-target',
                isActive
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 active:bg-gray-100',
              )}
            >
              <span className="text-xs font-medium">第 {day.dayIndex + 1} 天</span>
              <span className="text-[10px] opacity-75 mt-0.5">{formatDateShort(day.date)}</span>
              {day.city && (
                <span className="text-[10px] opacity-75 truncate max-w-[64px]">{day.city}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
