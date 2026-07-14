import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataStore } from '@/lib/data'

interface TopBarProps {
  title: string
  subtitle?: string
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const [searchFocused, setSearchFocused] = useState(false)

  const periodLabel = useMemo(() => {
    try {
      const meta = dataStore.metadata
      if (meta.period_end) {
        const d = new Date(meta.period_end)
        return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
      }
    } catch {}
    return 'Nessun dato'
  }, [])

  return (
    <header className="fixed top-0 right-0 left-[260px] h-16 bg-bg-base border-b border-border-subtle z-40 flex items-center justify-between px-6">
      {/* Left: title + subtitle */}
      <div className="flex flex-col justify-center">
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          className="text-[28px] font-bold leading-tight tracking-[-0.01em] text-text-primary"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="text-[15px] text-text-secondary"
          >
            {subtitle}
          </motion.p>
        )}
      </div>

      {/* Center: search */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-full bg-bg-surface-elevated px-4 h-10 transition-all duration-150',
          searchFocused ? 'w-[500px] border border-border-focus' : 'w-[400px] border border-transparent',
        )}
      >
        <Search size={18} className="text-text-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Cerca giocatori, PVR, agenti..."
          className="bg-transparent border-none outline-none text-[14px] text-text-primary placeholder:text-text-muted w-full"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      </div>

      {/* Right: period + avatar */}
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 h-9 px-3 rounded-lg bg-bg-surface-elevated text-[14px] text-text-primary hover:bg-bg-surface-highlight transition-colors">
          <span>{periodLabel}</span>
          <ChevronDown size={14} className="text-text-muted" />
        </button>

        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center">
          <span className="text-accent-blue font-semibold text-[14px]">AD</span>
        </div>
      </div>
    </header>
  )
}
