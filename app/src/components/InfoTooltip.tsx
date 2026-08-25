import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  content: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  iconClassName?: string
}

/**
 * Icona "info" con tooltip su hover. Spiega come un dato viene calcolato,
 * da dove arriva e perché è così.
 */
export default function InfoTooltip({
  content,
  side = 'top',
  className,
  iconClassName,
}: InfoTooltipProps) {
  const position = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side]

  return (
    <span className={cn('relative group/tip inline-flex cursor-help', className)}>
      <Info
        size={12}
        className={cn(
          'text-text-muted opacity-60 group-hover/tip:opacity-100 transition-opacity',
          iconClassName,
        )}
      />
      <span
        className={cn(
          'absolute z-[999] w-72 px-3 py-2 bg-bg-surface-elevated border border-border-default rounded-lg',
          'text-[11px] text-text-secondary leading-relaxed opacity-0 group-hover/tip:opacity-100',
          'transition-opacity pointer-events-none shadow-lg',
          position,
        )}
      >
        {content}
      </span>
    </span>
  )
}
