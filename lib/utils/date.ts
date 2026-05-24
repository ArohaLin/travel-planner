import { format, differenceInDays, addDays, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'M月d日 EEEE', { locale: zhTW })
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), 'M/d', { locale: zhTW })
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const days = differenceInDays(end, start) + 1
  return `${format(start, 'yyyy年M月d日', { locale: zhTW })} — ${format(end, 'M月d日', { locale: zhTW })}（共 ${days} 天）`
}

export function getDaysInRange(startDate: string, totalDays: number): string[] {
  const start = parseISO(startDate)
  return Array.from({ length: totalDays }, (_, i) =>
    format(addDays(start, i), 'yyyy-MM-dd'),
  )
}

export function formatRelativeTime(isoString: string): string {
  const date = parseISO(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '剛剛'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 7) return `${diffDays} 天前`
  return format(date, 'M月d日', { locale: zhTW })
}
