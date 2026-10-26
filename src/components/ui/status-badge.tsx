import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { bookingStatusStyle } from '@/lib/booking-status'

/**
 * Pill for any workflow status (PO, leave request, payment, lead stage …).
 * Pick the tone by meaning, not by colour:
 *   success = done/approved/paid · warning = waiting/needs action · info = in progress
 *   destructive = rejected/failed/overdue · neutral = draft/closed/cancelled
 *   primary/brand = highlighted or brand-specific states
 * Categorical tones (purple, indigo, pink, cyan) are for types/categories, not states.
 */
const statusBadgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap shrink-0 w-fit [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral:     'bg-muted text-muted-foreground border-border',
        primary:     'bg-primary/15 text-primary-strong border-primary/30',
        brand:       'bg-brand/10 text-brand border-brand/25',
        success:     'bg-success/15 text-success border-success/30',
        warning:     'bg-warning/15 text-warning border-warning/30',
        info:        'bg-info/15 text-info border-info/30',
        destructive: 'bg-destructive/15 text-destructive border-destructive/30',
        purple:      'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
        indigo:      'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
        pink:        'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30',
        cyan:        'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',
      },
      size: {
        sm: 'px-1.5 py-px text-[10px]',
        md: 'px-2 py-0.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export type StatusTone = NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>

const DOT_TONE: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground', primary: 'bg-primary', brand: 'bg-brand', success: 'bg-success',
  warning: 'bg-warning', info: 'bg-info', destructive: 'bg-destructive',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', pink: 'bg-pink-500', cyan: 'bg-cyan-500',
}

type StatusBadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof statusBadgeVariants> & { dot?: boolean }

function StatusBadge({ className, tone, size, dot, children, ...props }: StatusBadgeProps) {
  return (
    <span data-slot="status-badge" className={cn(statusBadgeVariants({ tone, size }), className)} {...props}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DOT_TONE[tone ?? 'neutral'])} />}
      {children}
    </span>
  )
}

/** Booking status pill — colour and label come from the central map in lib/booking-status. */
function BookingStatusBadge({ status, className, size, ...props }: Omit<React.ComponentProps<'span'>, 'children'> & { status: string; size?: 'sm' | 'md' }) {
  const s = bookingStatusStyle(status)
  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeVariants({ size }), s.badge, className)}
      {...props}
    >
      {s.label}
    </span>
  )
}

export { StatusBadge, BookingStatusBadge, statusBadgeVariants }
