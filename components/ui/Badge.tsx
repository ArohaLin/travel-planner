import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'purple' | 'green' | 'yellow' | 'red'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-gray-100 text-gray-700': variant === 'default',
          'bg-purple-100 text-purple-700': variant === 'purple',
          'bg-green-100 text-green-700': variant === 'green',
          'bg-yellow-100 text-yellow-700': variant === 'yellow',
          'bg-red-100 text-red-700': variant === 'red',
        },
        className,
      )}
    >
      {children}
    </span>
  )
}
