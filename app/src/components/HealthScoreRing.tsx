import { useEffect, useState } from 'react'

interface HealthScoreRingProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function HealthScoreRing({ score, size = 'md', className }: HealthScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0)

  const sizeMap = {
    sm: { w: 32, stroke: 3, font: 'text-[10px]' },
    md: { w: 48, stroke: 4, font: 'text-xs' },
    lg: { w: 64, stroke: 4, font: 'text-sm' },
  }

  const { w, stroke, font } = sizeMap[size]
  const radius = (w - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = animatedScore / 100

  const getColor = (s: number) => {
    if (s >= 80) return '#10b981'
    if (s >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const color = getColor(score)

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(score)
    }, 100)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: w, height: w }}>
      <svg width={w} height={w} className="-rotate-90">
        <circle
          cx={w / 2}
          cy={w / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
        />
        <circle
          cx={w / 2}
          cy={w / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.25, 0.1, 0.25, 1)' }}
        />
      </svg>
      <span className={`absolute font-mono font-semibold ${font} text-text-primary`}>
        {Math.round(animatedScore)}
      </span>
    </div>
  )
}
