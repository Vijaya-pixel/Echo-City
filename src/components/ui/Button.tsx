import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Arcade-style pixel buttons (see `.btn-arcade` in src/echo.css): hard edges,
 * offset shadow, and a 2px "press" on click. Tap targets are at least 44px.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap shrink-0 select-none outline-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'btn-arcade',
        destructive: 'btn-arcade btn-villain',
        detective: 'btn-arcade btn-detective',
        success: 'btn-arcade btn-lime',
        outline: 'btn-arcade btn-ghost-px',
        secondary: 'btn-arcade btn-ghost-px',
        ghost: 'min-h-11 px-3 font-display text-[10px] uppercase text-muted-foreground hover:text-foreground disabled:opacity-50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        sm: 'min-h-11 px-3 py-2 text-[10px]',
        lg: 'min-h-14 px-6 text-sm',
        icon: 'h-11 w-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, type, ...props }, ref) => (
    <button
      ref={ref}
      data-slot="button"
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-pulse bg-current"
        />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { Button, buttonVariants }
