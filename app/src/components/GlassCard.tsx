import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: ReactNode
  className?: string
  glowColor?: 'purple' | 'red' | 'green'
}

export default function GlassCard({ children, className, glowColor = 'purple' }: GlassCardProps) {
  const glowMap = {
    purple: 'shadow-glow-purple border-[rgba(139,92,246,0.15)]',
    red: 'shadow-glow-red border-[rgba(239,68,68,0.15)]',
    green: 'shadow-[0_0_20px_rgba(16,185,129,0.15)] border-[rgba(16,185,129,0.15)]',
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-[rgba(17,24,39,0.7)] backdrop-blur-[12px] border',
        glowMap[glowColor],
        className,
      )}
    >
      {children}
    </div>
  )
}
