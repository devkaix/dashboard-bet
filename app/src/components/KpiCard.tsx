import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from 'recharts'

interface KpiCardProps {
  icon: LucideIcon
  iconColor: string
  label: string
  value: string
  delta: string
  deltaPositive?: boolean
  deltaWarning?: boolean
  sparklineData: number[]
  sparklineColor: string
  sparklineFillColor: string
  bottomNote: string
  index: number
}

function AnimatedValue({ value, delay }: { value: string; delay: number }) {
  const [display, setDisplay] = useState('—')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplay(value)
    }, delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return <span>{display}</span>
}

export default function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  delta,
  deltaPositive = true,
  deltaWarning = false,
  sparklineData,
  sparklineColor,
  sparklineFillColor,
  bottomNote,
  index,
}: KpiCardProps) {
  const deltaBg = deltaWarning
    ? 'bg-warning/20 text-warning'
    : deltaPositive
    ? 'bg-positive/20 text-positive'
    : 'bg-negative/20 text-negative'

  const sparkData = sparklineData.map((v, i) => ({ i: i, v }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: 0.2 + index * 0.08,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      }}
      className="bg-bg-surface rounded-xl border border-border-subtle p-5 flex flex-col gap-3 hover:-translate-y-[2px] hover:shadow-md transition-all duration-150 cursor-default group"
    >
      {/* Top row: icon + label */}
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColor} />
        <span className="text-[12px] font-medium uppercase tracking-[0.01em] text-text-muted">
          {label}
        </span>
      </div>

      {/* Value + delta */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[28px] font-bold leading-none tracking-[-0.02em] text-text-primary">
          <AnimatedValue value={value} delay={400 + index * 80} />
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium ${deltaBg}`}
        >
          {deltaPositive && !deltaWarning ? '↑' : deltaWarning ? '●' : '↓'}
          {delta}
        </span>
      </div>

      {/* Sparkline */}
      <div className="h-[40px] w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sparklineFillColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={sparklineFillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Area
              type="monotone"
              dataKey="v"
              stroke={sparklineColor}
              strokeWidth={2}
              fill={`url(#grad-${index})`}
              isAnimationActive={true}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom note */}
      <span className="text-[13px] text-text-muted">{bottomNote}</span>
    </motion.div>
  )
}
