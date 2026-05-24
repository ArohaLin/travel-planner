import { clsx } from 'clsx'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function getInitials(name: string): string {
  return (name || '?').slice(0, 2)
}

function getColor(name: string): string {
  const colors = [
    'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-red-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500',
  ]
  const safe = name || '?'
  const idx = safe.charCodeAt(0) % colors.length
  return colors[idx]
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const safeName = name || '?'
  const sizeClass = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size]

  if (src) {
    return (
      <img
        src={src}
        alt={safeName}
        className={clsx('rounded-full object-cover flex-shrink-0', sizeClass, className)}
      />
    )
  }

  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center text-white font-medium flex-shrink-0',
        sizeClass,
        getColor(safeName),
        className,
      )}
      title={safeName}
    >
      {getInitials(safeName)}
    </div>
  )
}
