'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 tap-target select-none',
          'active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
          {
            // Variants
            'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800':
              variant === 'primary',
            'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300':
              variant === 'secondary',
            'text-gray-700 hover:bg-gray-100 active:bg-gray-200':
              variant === 'ghost',
            'bg-red-500 text-white hover:bg-red-600 active:bg-red-700':
              variant === 'danger',
            // Sizes
            'text-sm px-3 py-1.5 min-h-[36px]': size === 'sm',
            'text-base px-4 py-2 min-h-[44px]': size === 'md',
            'text-lg px-6 py-3 min-h-[52px]': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  },
)

Button.displayName = 'Button'
