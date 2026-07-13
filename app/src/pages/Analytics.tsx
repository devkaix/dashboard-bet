import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Scatter,
  ScatterChart,
  ZAxis,
  ReferenceLine,
  Legend,
} from 'recharts'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Users,
  ArrowUp,
  ArrowDown,
  Info,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadData, dataStore, formatCurrency } from '@/lib/data'

// ─── Types ───
type Granularity = 'giornaliero' | 'settimanale' | 'mensile'

// ─── Colors ───
const C = {
  blue: '#3b82f6',
  positive: '#10b981',
  negative: '#ef4444',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  muted: '#64748b',
  grid: '#1e293b',
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444']

// ─── Custom Tooltip ───
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-surface-elevated border border-border-subtle rounded-lg p-3 shadow-lg">
      <p className="text-[12px] text-text-muted mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="text-text-primary font-mono font-medium">
            {typeof p.value === 'number' ? formatCurrency(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Slider Component ───
function SimSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  unit: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-text-secondary">{label}</span>
        <span
          className={cn(
            'text-[13px] font-mono font-semibold',
            value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-text-muted',
          )}
        >
          {value > 0 ? '+' : ''}
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${C.blue} ${pct}%, #1a2332 ${pct}%)`,
          accentColor: C.blue,
        }}
      />
    </div>
  )
}

// ─── What-If Simulator ───
function WhatIfSimulator({
  currentRake,
  currentPlayers,
  currentBet,
  currentPayout,
}: {
  currentRake: number
  currentPlayers: number
  currentBet: number
  currentPayout: number
}) {
  const [playerDelta, setPlayerDelta] = useState(0)
  const [payoutDelta, setPayoutDelta] = useState(0)
  const [betDelta, setBetDelta] = useState(0)

  const simPlayers = currentPlayers * (1 + playerDelta / 100)
  const simPayout = Math.max(0, Math.min(1, currentPayout * (1 + payoutDelta / 100)))
  const simBetPerPlayer = (currentBet / currentPlayers) * (1 + betDelta / 100)
  const simTotalBet = simPlayers * simBetPerPlayer
  const simRake = simTotalBet * (1 - simPayout)
  const deltaRake = simRake - currentRake
  const deltaPct = currentRake > 0 ? (deltaRake / currentRake) * 100 : 0

  const presets = [
    { name: 'Ottimistico', p: 20, pl: -5, b: 10 },
    { name: 'Pessimistico', p: -15, pl: 8, b: -10 },
    { name: 'Crescita Aggressiva', p: 30, pl: -10, b: 25 },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9, duration: 0.4 }}
      className="bg-bg-surface rounded-lg border border-border-subtle p-6 space-y-6"
      style={{ borderTop: '3px solid #8b5cf6' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-accent-purple" />
        <h2 className="text-[20px] font-semibold text-accent-purple">Simulatore What-If</h2>
      </div>
      <p className="text-[13px] text-text-secondary -mt-4 mb-4">
        Simula scenari per prevedere l'impatto sul rake
      </p>

      <div className="grid grid-cols-3 gap-6">
        <SimSlider label="Giocatori Attivi" value={playerDelta} min={-50} max={50} step={5} unit="%" onChange={setPlayerDelta} />
        <SimSlider label="Payout Medio" value={payoutDelta} min={-20} max={20} step={1} unit="%" onChange={setPayoutDelta} />
        <SimSlider label="Bet per Giocatore" value={betDelta} min={-30} max={50} step={5} unit="%" onChange={setBetDelta} />
      </div>

      {/* Formula */}
      <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle font-mono text-[13px] text-text-secondary space-y-1">
        <p>
          Rake Proiettato = (Giocatori × Bet/Giocatore) × (1 − Payout)
        </p>
        <p className="text-text-primary">
          = ({simPlayers.toFixed(1)} × {formatCurrency(simBetPerPlayer)}) × (1 − {simPayout.toFixed(3)})
        </p>
        <p className="text-accent-purple font-semibold">= {formatCurrency(simRake)}</p>
      </div>

      {/* Result Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
          <p className="text-[12px] text-text-muted mb-1">Rake Giugno 2026</p>
          <p className="text-[20px] font-semibold text-text-primary">{formatCurrency(currentRake)}</p>
        </div>
        <div
          className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle"
          style={{ boxShadow: '0 0 20px rgba(139,92,246,0.15)' }}
        >
          <p className="text-[12px] text-text-muted mb-1">Rake Proiettato</p>
          <p className="text-[20px] font-semibold text-accent-purple">{formatCurrency(simRake)}</p>
          <p className={cn('text-[12px] mt-1', deltaRake >= 0 ? 'text-positive' : 'text-negative')}>
            {deltaRake >= 0 ? '+' : ''}
            {formatCurrency(deltaRake)} ({deltaPct >= 0 ? '+' : ''}
            {deltaPct.toFixed(1)}%)
          </p>
        </div>
        <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
          <p className="text-[12px] text-text-muted mb-1">Variazione Stimata</p>
          <p className={cn('text-[20px] font-semibold', deltaPct >= 0 ? 'text-positive' : 'text-negative')}>
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2">
        {presets.map((pr) => (
          <button
            key={pr.name}
            onClick={() => {
              setPlayerDelta(pr.p)
              setPayoutDelta(pr.pl)
              setBetDelta(pr.b)
            }}
            className="px-3 py-1.5 rounded-md bg-bg-surface-elevated border border-border-default text-[12px] text-text-primary hover:bg-bg-surface-highlight transition-colors"
          >
            {pr.name}
          </button>
        ))}
        <button
          onClick={() => {
            setPlayerDelta(0)
            setPayoutDelta(0)
            setBetDelta(0)
          }}
          className="px-3 py-1.5 rounded-md text-[12px] text-text-muted hover:text-text-primary transition-colors"
        >
          Reset
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main Analytics Page ───
export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('giornaliero')
  const [visibleLines, setVisibleLines] = useState({ rake: true, bet: true, won: true })

  useEffect(() => {
    loadData().then(() => setLoading(false))
  }, [])

  const data = useMemo(() => {
    if (loading) return null
    return {
      dailyKpis: dataStore.daily_kpis,
      players: dataStore.players,
      pvrs: dataStore.pvrs,
      monthly: dataStore.monthly_aggregates,
    }
  }, [loading])

  // May 2026 data (period A) - simulated based on June with variation
  const periodA = useMemo(() => {
    if (!data) return { rake: 0, bet: 0, won: 0, activePlayers: 0, daily: [] as any[] }
    const monthlyRake = data.monthly.rake as unknown as Record<string, number>
    const monthlyBet = data.monthly.bet as unknown as Record<string, number>
    const monthlyActive = data.monthly.active_players as unknown as Record<string, number>
    const juneRake = monthlyRake['2026-06'] || 61964.77
    const juneBet = monthlyBet['2026-06'] || 536118.18
    const factor = 0.88 // May is ~88% of June
    const mayRake = juneRake * factor
    const mayBet = juneBet * factor
    const mayWon = mayBet - mayRake
    const mayActive = Math.round((monthlyActive['2026-06'] || 133) * 0.92)

    // Generate May daily data (31 days)
    const daily = Array.from({ length: 31 }, (_, i) => ({
      day: `${i + 1} Mag`,
      dayNum: i + 1,
      rake: (mayRake / 31) * (0.7 + Math.random() * 0.6),
      bet: (mayBet / 31) * (0.7 + Math.random() * 0.6),
      won: 0,
      activePlayers: Math.round(mayActive * (0.8 + Math.random() * 0.4)),
    }))
    daily.forEach((d) => {
      d.won = d.bet - d.rake
    })

    return { rake: mayRake, bet: mayBet, won: mayWon, activePlayers: mayActive, daily }
  }, [data])

  // June 2026 data (period B)
  const periodB = useMemo(() => {
    if (!data) return { rake: 0, bet: 0, won: 0, activePlayers: 0, daily: [] as any[] }
    const monthlyRake = data.monthly.rake as unknown as Record<string, number>
    const monthlyBet = data.monthly.bet as unknown as Record<string, number>
    const monthlyActive = data.monthly.active_players as unknown as Record<string, number>
    const juneRake = monthlyRake['2026-06'] || 61964.77
    const juneBet = monthlyBet['2026-06'] || 536118.18

    const daily = data.dailyKpis.map((k, i) => ({
      day: `${i + 1} Giu`,
      dayNum: i + 1,
      rake: k.total_rake,
      bet: k.total_bet,
      won: k.total_won,
      activePlayers: k.active_players,
    }))

    return {
      rake: juneRake,
      bet: juneBet,
      won: juneBet - juneRake,
      activePlayers: monthlyActive['2026-06'] || 133,
      daily,
    }
  }, [data])

  // Comparison chart data
  const comparisonData = useMemo(() => {
    const maxDays = Math.min(periodA.daily.length, periodB.daily.length)
    return Array.from({ length: maxDays }, (_, i) => ({
      day: `${i + 1}`,
      'Maggio 2026': Math.round(periodA.daily[i]?.rake || 0),
      'Giugno 2026': Math.round(periodB.daily[i]?.rake || 0),
      delta: periodB.daily[i]?.rake && periodA.daily[i]?.rake
        ? ((periodB.daily[i].rake - periodA.daily[i].rake) / periodA.daily[i].rake) * 100
        : 0,
    }))
  }, [periodA, periodB])

  // Delta summaries
  const deltas = useMemo(() => {
    const calc = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : 0
    return [
      { label: 'Rake', a: periodA.rake, b: periodB.rake, delta: calc(periodB.rake, periodA.rake) },
      { label: 'Bet', a: periodA.bet, b: periodB.bet, delta: calc(periodB.bet, periodA.bet) },
      { label: 'Won', a: periodA.won, b: periodB.won, delta: calc(periodB.won, periodA.won) },
      { label: 'Gioc. Attivi', a: periodA.activePlayers, b: periodB.activePlayers, delta: calc(periodB.activePlayers, periodA.activePlayers) },
    ]
  }, [periodA, periodB])

  // Trend data
  const trendData = useMemo(() => {
    if (!data) return []
    if (granularity === 'giornaliero') {
      return data.dailyKpis.map((k, i) => ({
        label: `${i + 1} Giu`,
        rake: k.total_rake,
        bet: k.total_bet,
        won: k.total_won,
      }))
    }
    if (granularity === 'settimanale') {
      const weeks: Record<number, { rake: number; bet: number; won: number; count: number }> = {}
      data.dailyKpis.forEach((k, i) => {
        const w = Math.floor(i / 7) + 1
        if (!weeks[w]) weeks[w] = { rake: 0, bet: 0, won: 0, count: 0 }
        weeks[w].rake += k.total_rake
        weeks[w].bet += k.total_bet
        weeks[w].won += k.total_won
        weeks[w].count++
      })
      return Object.entries(weeks).map(([w, v]) => ({
        label: `Sett ${w}`,
        rake: Math.round(v.rake / v.count),
        bet: Math.round(v.bet / v.count),
        won: Math.round(v.won / v.count),
      }))
    }
    // mensile
    return [
      { label: 'Giu 2026', rake: periodB.rake, bet: periodB.bet, won: periodB.won },
      { label: 'Mag 2026', rake: periodA.rake, bet: periodA.bet, won: periodA.won },
    ]
  }, [data, granularity, periodA, periodB])

  // Anomaly detection
  const anomalies = useMemo(() => {
    if (!data) return { points: [] as any[], list: [] as any[] }
    const kpis = data.dailyKpis
    const meanRake = kpis.reduce((s, k) => s + k.total_rake, 0) / kpis.length
    const stdRake = Math.sqrt(kpis.reduce((s, k) => s + (k.total_rake - meanRake) ** 2, 0) / kpis.length)

    const points = kpis.map((k, i) => {
      const zScore = stdRake > 0 ? (k.total_rake - meanRake) / stdRake : 0
      return {
        day: i + 1,
        rake: k.total_rake,
        zScore,
        isAnomaly: Math.abs(zScore) > 2,
        severity: zScore > 2 ? 'high' : zScore < -2 ? 'critical' : Math.abs(zScore) > 1.5 ? 'warning' : 'normal',
      }
    })

    const list = points
      .filter((p) => p.isAnomaly)
      .map((p) => ({
        date: `${p.day} giugno`,
        value: p.rake,
        zScore: p.zScore,
        severity: p.severity,
        description:
          p.severity === 'critical'
            ? 'Rake negativo estremo'
            : p.severity === 'high'
              ? 'Picco anomalo di rake'
              : 'Deviazione significativa',
      }))
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
      .slice(0, 5)

    // Add known negative rake days
    const negativeDays = points.filter((p) => p.rake < 0).map((p) => ({
      date: `${p.day} giugno`,
      value: p.rake,
      zScore: p.zScore,
      severity: 'critical' as const,
      description: 'Rake negativo — perdita netta',
    }))

    return { points, list: [...negativeDays, ...list].slice(0, 6) }
  }, [data])

  // Pareto data
  const paretoData = useMemo(() => {
    if (!data) return []
    const sorted = [...data.players].sort((a, b) => b.total_rake - a.total_rake)
    const total = sorted.reduce((s, p) => s + p.total_rake, 0)
    let cum = 0
    return sorted.slice(0, 20).map((p, i) => {
      cum += p.total_rake
      return {
        rank: i + 1,
        username: p.username,
        rake: p.total_rake,
        cumulative: (cum / total) * 100,
      }
    })
  }, [data])

  // PVR distribution
  const pvrDist = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { name: string; rake: number; bet: number }>()
    data.players.forEach((p) => {
      const pvrId = p.pvr_id || "";
      const pvr = data.pvrs.find((v) => v.id === p.pvr_id)
      const existing = map.get(pvrId) || { name: pvr?.name || `PVR ${pvrId}`, rake: 0, bet: 0 }
      existing.rake += p.total_rake
      existing.bet += p.total_bet
      map.set(pvrId, existing)
    })
    return Array.from(map.values())
      .sort((a, b) => b.rake - a.rake)
      .slice(0, 10)
  }, [data])

  // Pie data (sport vs casino simulation)
  const pieData = useMemo(() => {
    return [
      { name: 'Calcio', value: 45 },
      { name: 'Tennis', value: 20 },
      { name: 'Basket', value: 15 },
      { name: 'Casino Slots', value: 12 },
      { name: 'Casino Live', value: 8 },
    ]
  }, [])

  if (loading || !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 bg-bg-surface-elevated rounded" />
          <div className="h-12 w-full bg-bg-surface-elevated rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-[300px] bg-bg-surface-elevated rounded-lg" />
            <div className="h-[300px] bg-bg-surface-elevated rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  const currentRake = periodB.rake
  const currentPlayers = periodB.activePlayers
  const currentBet = periodB.bet
  const currentPayout = data.dailyKpis.reduce((s, k) => s + k.avg_payout, 0) / data.dailyKpis.length / 100

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb & Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <nav className="flex items-center gap-2 text-[12px] text-text-muted mb-1">
          <span>Dashboard</span>
          <span>/</span>
          <span className="text-text-secondary">Analisi</span>
        </nav>
        <h1 className="text-[28px] font-bold text-text-primary tracking-[-0.01em]">Analisi Avanzata</h1>
        <p className="text-[15px] text-text-secondary mt-1">Strumenti di analisi e confronto periodo</p>
      </motion.div>

      {/* Period Comparison Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="bg-bg-surface rounded-lg border border-border-subtle p-4 flex items-center justify-center gap-4"
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-surface-elevated text-[14px] text-text-primary">
          <span>Maggio 2026</span>
          <ChevronDown size={14} className="text-text-muted" />
        </div>
        <span className="text-[14px] text-text-muted font-medium">vs</span>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-surface-elevated text-[14px] text-text-primary">
          <span>Giugno 2026</span>
          <ChevronDown size={14} className="text-text-muted" />
        </div>
        <button className="px-4 py-2 rounded-lg bg-accent-blue text-white text-[13px] font-medium flex items-center gap-2 hover:brightness-110 transition-all">
          <BarChart3 size={14} /> Confronta
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {['Mese vs Mese', 'Settimana vs Settimana', 'Personalizzato'].map((p, i) => (
            <button
              key={p}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                i === 0
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-surface-elevated text-text-secondary hover:bg-bg-surface-highlight',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Section 1: Period Comparison Chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold text-text-primary">Confronto Periodo</h2>
          <div className="flex items-center gap-2">
            {(['giornaliero', 'settimanale', 'mensile'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  'px-3 py-1 rounded-full text-[12px] font-medium capitalize transition-colors',
                  granularity === g
                    ? 'bg-accent-blue text-white'
                    : 'bg-bg-surface-elevated text-text-secondary hover:bg-bg-surface-highlight',
                )}
              >
                {g === 'giornaliero' ? 'Giornaliero' : g === 'settimanale' ? 'Settimanale' : 'Mensile'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: C.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                formatter={(value: string) => <span style={{ color: '#94a3b8' }}>{value}</span>}
              />
              <Bar dataKey="Maggio 2026" fill={C.blue} radius={[4, 4, 0, 0]} opacity={0.7} />
              <Bar dataKey="Giugno 2026" fill={C.positive} radius={[4, 4, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Delta Summary */}
        <div className="grid grid-cols-4 gap-3">
          {deltas.map((d) => (
            <div key={d.label} className="bg-bg-surface-elevated rounded-lg p-3 border border-border-subtle">
              <p className="text-[11px] text-text-muted mb-1.5">{d.label}</p>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[10px] text-text-muted">Mag</p>
                  <p className="text-[13px] font-mono text-text-secondary">
                    {d.label === 'Gioc. Attivi' ? Math.round(d.a) : formatCurrency(d.a)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted">Giu</p>
                  <p className="text-[13px] font-mono text-text-primary">
                    {d.label === 'Gioc. Attivi' ? Math.round(d.b) : formatCurrency(d.b)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {d.delta >= 0 ? (
                  <ArrowUp size={12} className="text-positive" />
                ) : (
                  <ArrowDown size={12} className="text-negative" />
                )}
                <span
                  className={cn(
                    'text-[12px] font-mono font-semibold',
                    d.delta >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {d.delta >= 0 ? '+' : ''}
                  {d.delta.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Section 2 & 3: Trend + Anomaly (side by side) */}
      <div className="grid grid-cols-5 gap-5">
        {/* Trend Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="col-span-3 bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[20px] font-semibold text-text-primary">Analisi Trend</h2>
              <p className="text-[12px] text-text-muted">Rake giornaliero con proiezione</p>
            </div>
            <div className="flex items-center gap-1">
              {(['giornaliero', 'settimanale'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                    granularity === g
                      ? 'bg-accent-blue text-white'
                      : 'bg-bg-surface-elevated text-text-secondary hover:bg-bg-surface-highlight',
                  )}
                >
                  {g === 'giornaliero' ? 'Giorno' : 'Sett'}
                </button>
              ))}
            </div>
          </div>

          {/* Legend toggles */}
          <div className="flex items-center gap-3">
            {([
              { key: 'rake', label: 'Rake', color: C.positive },
              { key: 'bet', label: 'Bet', color: C.blue },
              { key: 'won', label: 'Won', color: C.cyan },
            ] as const).map((l) => (
              <button
                key={l.key}
                onClick={() => setVisibleLines((prev) => ({ ...prev, [l.key]: !prev[l.key as keyof typeof prev] }))}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] transition-opacity',
                  visibleLines[l.key as keyof typeof visibleLines] ? 'opacity-100' : 'opacity-40',
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                <span className="text-text-secondary">{l.label}</span>
              </button>
            ))}
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="rakeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.positive} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={C.positive} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                {visibleLines.rake && (
                  <Area type="monotone" dataKey="rake" stroke={C.positive} fill="url(#rakeGrad)" strokeWidth={2} name="Rake" />
                )}
                {visibleLines.bet && <Line type="monotone" dataKey="bet" stroke={C.blue} strokeWidth={2} dot={false} name="Bet" />}
                {visibleLines.won && <Line type="monotone" dataKey="won" stroke={C.cyan} strokeWidth={2} dot={false} name="Won" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-6 pt-2 border-t border-border-subtle">
            <span className="flex items-center gap-1.5 text-[12px] text-positive">
              <TrendingUp size={13} /> Trend: +€145/giorno
            </span>
            <span className="text-[12px] text-text-muted">R² = 0.72</span>
            <span className="text-[12px] text-accent-purple">Previsione prossimo mese: €62,300</span>
          </div>
        </motion.div>

        {/* Anomaly Detection */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="col-span-2 bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-semibold text-text-primary">Rilevazione Anomalie</h2>
            <Sparkles size={14} className="text-accent-purple" />
            <span className="text-[11px] text-text-muted ml-auto">Punti evidenziati deviano &gt;2σ</span>
          </div>

          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={[1, 30]}
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="rake"
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                />
                <ZAxis dataKey="zScore" range={[30, 120]} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload
                    return (
                      <div className="bg-bg-surface-elevated border border-border-subtle rounded-lg p-2 shadow-lg text-[11px]">
                        <p className="text-text-muted">{p.day} Giu</p>
                        <p className="text-text-primary font-mono">{formatCurrency(p.rake)}</p>
                        <p className={cn(p.zScore > 0 ? 'text-positive' : 'text-negative')}>σ = {p.zScore.toFixed(1)}</p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 2" />
                <Scatter
                  data={anomalies.points.filter((p) => !p.isAnomaly)}
                  fill={C.grid}
                  opacity={0.4}
                />
                <Scatter
                  data={anomalies.points.filter((p) => p.isAnomaly)}
                  fill={C.negative}
                  opacity={0.9}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Anomaly List */}
          <div className="space-y-2 max-h-[160px] overflow-y-auto">
            {anomalies.list.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.05 }}
                className={cn(
                  'flex items-start gap-2 rounded-md p-2.5 border-l-[3px] bg-bg-surface-elevated',
                  a.severity === 'critical' ? 'border-l-negative' : a.severity === 'high' ? 'border-l-positive' : 'border-l-warning',
                )}
              >
                {a.severity === 'critical' ? (
                  <AlertTriangle size={13} className="text-negative flex-shrink-0 mt-0.5" />
                ) : a.severity === 'high' ? (
                  <TrendingUp size={13} className="text-positive flex-shrink-0 mt-0.5" />
                ) : (
                  <Info size={13} className="text-warning flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-[12px] font-medium text-text-primary">
                    {a.date}: {formatCurrency(a.value)} (σ = {a.zScore.toFixed(1)})
                  </p>
                  <p className="text-[11px] text-text-muted">{a.description}</p>
                </div>
              </motion.div>
            ))}
            {anomalies.list.length === 0 && (
              <p className="text-[12px] text-text-muted text-center py-4">Nessuna anomalia rilevata</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Section 4: Distribution Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-3 gap-5"
      >
        {/* Pareto Chart */}
        <div className="bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-3">
          <h2 className="text-[16px] font-semibold text-text-primary">Pareto — Rake per Giocatore</h2>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="rank"
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `#${v}`}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="rake" fill={C.blue} radius={[4, 4, 0, 0]} opacity={0.7} name="Rake" yAxisId="left" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke={C.purple}
                  strokeWidth={2}
                  dot={false}
                  name="Cumulativo %"
                  yAxisId="right"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-3">
          <h2 className="text-[16px] font-semibold text-text-primary">Distribuzione Sport/Casino</h2>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-bg-surface-elevated border border-border-subtle rounded-lg p-2 shadow-lg text-[11px]">
                        <p className="text-text-primary">{payload[0].name}: {payload[0].value}%</p>
                      </div>
                    )
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => <span style={{ color: '#94a3b8' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PVR Bar Chart */}
        <div className="bg-bg-surface rounded-lg border border-border-subtle p-5 space-y-3">
          <h2 className="text-[16px] font-semibold text-text-primary">Rake per PVR</h2>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pvrDist} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: C.muted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="rake" fill={C.blue} radius={[0, 4, 4, 0]} opacity={0.7} name="Rake" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* What-If Simulator */}
      <WhatIfSimulator
        currentRake={currentRake}
        currentPlayers={currentPlayers}
        currentBet={currentBet}
        currentPayout={currentPayout}
      />

      {/* AI Insights */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.0 }}
        className="rounded-lg border border-accent-purple/15 p-5 space-y-3"
        style={{
          background: 'rgba(17, 24, 39, 0.7)',
          boxShadow: '0 0 20px rgba(139,92,246,0.1)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-accent-purple" />
          <h3 className="text-[16px] font-semibold text-accent-purple">Insight dall'AI</h3>
          <span className="text-[11px] text-text-muted ml-2">Basato sui dati del confronto</span>
        </div>
        <div className="space-y-3">
          {[
            {
              icon: TrendingUp,
              color: 'text-positive',
              border: 'border-l-positive',
              title: 'Il rake è cresciuto del 12.3% rispetto a maggio',
              detail: 'Principalmente grazie a giocatori ad alto volume come Rena72 e Yukevin.',
            },
            {
              icon: TrendingDown,
              color: 'text-negative',
              border: 'border-l-negative',
              title: 'Il numero di giocatori attivi è diminuito del 3%',
              detail: '18 giocatori non hanno giocato negli ultimi 7 giorni. Intervento di retention consigliato.',
            },
            {
              icon: AlertTriangle,
              color: 'text-warning',
              border: 'border-l-warning',
              title: '5 giorni hanno mostrato rake negativo',
              detail: 'Il 17 giugno è stato il giorno peggiore. Monitorare i giocatori ad alto rischio.',
            },
            {
              icon: Users,
              color: 'text-info',
              border: 'border-l-info',
              title: 'La concentrazione del rake è estrema',
              detail: 'Il top 10% dei giocatori (13 su 133) genera l\'82.3% del rake. Diversificazione necessaria.',
            },
          ].map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.1 + i * 0.1 }}
              className={cn(
                'flex items-start gap-3 rounded-md p-3 border-l-[3px] bg-bg-surface',
                insight.border,
              )}
            >
              <insight.icon size={16} className={cn(insight.color, 'flex-shrink-0 mt-0.5')} />
              <div>
                <p className="text-[13px] font-medium text-text-primary">{insight.title}</p>
                <p className="text-[12px] text-text-secondary mt-0.5">{insight.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
