import type { Alert } from '@/lib/data'
import { cn } from '@/lib/utils'
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { motion } from 'framer-motion'

interface AlertItemProps {
  alert: Alert
  index: number
  onDismiss?: (id: number) => void
}

export default function AlertItem({ alert, index, onDismiss }: AlertItemProps) {
  const severityConfig = {
    high: {
      border: 'border-l-negative',
      dot: 'bg-negative',
      icon: AlertTriangle,
      iconColor: 'text-negative',
    },
    medium: {
      border: 'border-l-warning',
      dot: 'bg-warning',
      icon: AlertCircle,
      iconColor: 'text-warning',
    },
    low: {
      border: 'border-l-info',
      dot: 'bg-info',
      icon: Info,
      iconColor: 'text-info',
    },
  }

  const config = severityConfig[alert.severity as keyof typeof severityConfig] ?? severityConfig.low
  const Icon = config.icon

  const timeAgo = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 0) return 'Oggi'
    if (diff === 1) return '1 giorno fa'
    return `${diff} giorni fa`
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.08,
        ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
      }}
      className={cn(
        'rounded-lg bg-bg-surface p-3 border-l-[3px]',
        config.border,
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn('mt-0.5 flex-shrink-0', config.iconColor)}>
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-text-primary leading-tight">
              {alert.title}
            </span>
            <span className="text-[11px] text-text-muted whitespace-nowrap flex-shrink-0">
              {timeAgo(alert.date)}
            </span>
          </div>
          <p className="text-[12px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">
            {alert.description}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert.id)}
            className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </motion.div>
  )
}
