import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  content: ReactNode
  side?: 'top' | 'bottom'
  className?: string
  iconClassName?: string
}

/**
 * Icona "info" con tooltip su hover. Il tooltip è renderizzato in un portal
 * a livello di document.body, così non viene tagliato da overflow:hidden
 * di card o tabelle. Spiega come un dato viene calcolato, da dove arriva
 * e perché è così.
 */
export default function InfoTooltip({
  content,
  side = 'top',
  className,
  iconClassName,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Misura dopo il render per calcolare l'altezza del tooltip.
    const tipEl = document.getElementById('info-tooltip-portal')
    const tipHeight = tipEl?.offsetHeight ?? 0
    const tipWidth = tipEl?.offsetWidth ?? 288

    let top = rect.top - tipHeight - 8
    let left = rect.left + rect.width / 2 - tipWidth / 2

    // Clamp ai bordi del viewport
    if (top < 8) top = rect.bottom + 8
    if (left < 8) left = 8
    if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - tipWidth - 8

    setPos({ top, left })
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('relative inline-flex cursor-help align-middle', className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <Info
          size={12}
          className={cn(
            'text-text-muted opacity-60 hover:opacity-100 transition-opacity',
            iconClassName,
          )}
        />
      </span>
      {open &&
        createPortal(
          <div
            id="info-tooltip-portal"
            className={cn(
              'fixed z-[9999] w-72 px-3 py-2 bg-bg-surface-elevated border border-border-default rounded-lg',
              'text-[11px] text-text-secondary leading-relaxed shadow-xl pointer-events-none',
            )}
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}
