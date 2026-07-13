import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet,
  TrendingUp,
  Coins,
  Users,
  Activity,
  Sparkles,
  AlertTriangle,
  TrendingUp as TrendingUpIcon,
  Lightbulb,
  Bell,
  Trophy,
  Download,
  RefreshCw,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import KpiCard from '@/components/KpiCard'
import GlassCard from '@/components/GlassCard'
import HealthScoreRing from '@/components/HealthScoreRing'
import AlertItem from '@/components/AlertItem'
import {
  loadData,
  dataStore,
  formatCurrency,
  formatPercent,
  getPvrName,
  getPlayerStatus,
} from '@/lib/data'
import type { BriefingItem, DailyKPI, Alert as AlertType, RankingPlayer } from '@/lib/data'
import { cn } from '@/lib/utils'

// ─── Custom chart tooltip ───
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-bg-surface-elevated rounded-lg shadow-md border border-border-default p-3 min-w-[160px]">
      <p className="text-[12px] text-text-muted mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
          <span className={entry.dataKey === 'total_rake' ? 'text-positive' : 'text-accent-blue'}>
            {entry.dataKey === 'total_rake' ? 'Rake' : 'Bet'}
          </span>
          <span className="font-mono font-semibold text-text-primary">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── AI Briefing column ───
function BriefingColumn({
  title,
  icon: Icon,
  iconColor,
  borderColor,
  items,
  count,
  delay,
}: {
  title: string
  icon: typeof AlertTriangle
  iconColor: string
  borderColor: string
  items: BriefingItem[]
  count: number
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.7 + delay }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={iconColor} />
        <span className={cn('text-[16px] font-semibold', iconColor)}>{title}</span>
        <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-bg-surface text-text-primary">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.8 + delay + i * 0.06 }}
            className={cn('bg-bg-surface rounded-lg p-3 border-l-2', borderColor)}
          >
            <p className="text-[13px] font-medium text-text-primary leading-snug">{item.title}</p>
            <p className="text-[12px] text-text-secondary mt-1 leading-relaxed line-clamp-3">
              {item.description}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Loading skeleton ───
function SkeletonCard() {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-subtle p-5 animate-pulse">
      <div className="h-4 w-24 bg-bg-surface-elevated rounded mb-3" />
      <div className="h-8 w-32 bg-bg-surface-elevated rounded mb-3" />
      <div className="h-10 w-full bg-bg-surface-elevated rounded mb-2" />
      <div className="h-3 w-20 bg-bg-surface-elevated rounded" />
    </div>
  )
}

// ─── Main Dashboard ───
export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dailyKpis, setDailyKpis] = useState<DailyKPI[]>([])
  const [alerts, setAlerts] = useState<AlertType[]>([])
  const [briefing, setBriefing] = useState<{ criticals: BriefingItem[]; opportunities: BriefingItem[]; suggestions: BriefingItem[] }>({ criticals: [], opportunities: [], suggestions: [] })
  const [topPlayers, setTopPlayers] = useState<RankingPlayer[]>([])
  const [totalRake, setTotalRake] = useState(0)
  const [totalBet, setTotalBet] = useState(0)
  const [avgPayout, setAvgPayout] = useState(0)
  const [avgActivePerDay, setAvgActivePerDay] = useState(0)

  const [alertFilter, setAlertFilter] = useState<'all' | 'high' | 'medium'>('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadData()
      .then(() => {
        const dk = dataStore.daily_kpis
        setDailyKpis(dk)
        setAlerts(dataStore.alerts)
        setBriefing(dataStore.briefing)
        setTopPlayers(dataStore.rankings.top_players_by_rake.slice(0, 10))
        setTotalRake(dataStore.monthly_aggregates.rake)
        setTotalBet(dataStore.monthly_aggregates.bet)
        setAvgPayout(dk.length > 0 ? dk.reduce((s, d) => s + d.avg_payout, 0) / dk.length : 0)
        setAvgActivePerDay(dk.length > 0 ? dk.reduce((s, d) => s + d.active_players, 0) / dk.length : 0)
        setLoading(false)
      })
      .catch((err: Error) => {
        console.error('Failed to load data:', err)
        setLoadError(err.message)
        setLoading(false)
      })
  }, [])

  const sparkData = useMemo(() => {
    if (dailyKpis.length === 0) return { rakeData: [], betData: [], wonData: [], activeData: [], payoutData: [] }
    return {
      rakeData: dailyKpis.map((d) => d.total_rake),
      betData: dailyKpis.map((d) => d.total_bet),
      wonData: dailyKpis.map((d) => d.total_won),
      activeData: dailyKpis.map((d) => d.active_players),
      payoutData: dailyKpis.map((d) => d.avg_payout),
    }
  }, [dailyKpis])

  const avgRake = useMemo(() => {
    if (dailyKpis.length === 0) return 0
    return dailyKpis.reduce((s, d) => s + d.total_rake, 0) / dailyKpis.length
  }, [dailyKpis])

  const chartData = useMemo(
    () =>
      dailyKpis.map((d) => {
        const day = new Date(d.date).getDate()
        return {
          date: `${day} Giu`,
          fullDate: d.date,
          total_rake: d.total_rake,
          total_bet: d.total_bet,
          total_won: d.total_won,
          active_players: d.active_players,
        }
      }),
    [dailyKpis],
  )

  const totalWon = totalBet - totalRake
  const negativeDays = dailyKpis.filter((d) => d.total_rake < 0).length

  const worstDay = useMemo(() => {
    if (dailyKpis.length === 0) return null
    return [...dailyKpis].sort((a, b) => a.total_rake - b.total_rake)[0]
  }, [dailyKpis])

  const filteredAlerts = alerts.filter((a) => {
    if (alertFilter === 'all') return true
    if (alertFilter === 'high') return a.severity === 'high'
    if (alertFilter === 'medium') return a.severity === 'medium' || a.severity === 'low'
    return true
  })

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1000)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-[2fr_1fr] gap-4">
          <div className="bg-bg-surface rounded-xl border border-border-subtle p-5 h-[380px] animate-pulse" />
          <div className="bg-bg-surface rounded-xl border border-border-subtle p-5 h-[380px] animate-pulse" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-negative/10 border border-negative/30 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-negative mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-negative mb-2">Errore caricamento dati</h3>
          <p className="text-sm text-text-secondary mb-4">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm hover:bg-accent-blue/80 transition-colors"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Section 1: Page Header ── */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.01em] text-text-primary">
            Dashboard
          </h1>
          <p className="text-[15px] text-text-secondary mt-0.5">
            Panoramica rete — Giugno 2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-bg-surface-elevated border border-border-default text-[14px] text-text-primary hover:bg-bg-surface-highlight transition-colors">
            <Download size={16} />
            <span>Esporta Report</span>
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-[14px] text-text-secondary hover:bg-bg-surface-elevated transition-colors"
          >
            <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
            <span>Aggiorna Dati</span>
          </button>
        </div>
      </motion.div>

      {/* ── Section 2: KPI Cards ── */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard
          icon={Wallet}
          iconColor="text-positive"
          label="Rake Totale"
          value={formatCurrency(totalRake)}
          delta="12.4%"
          deltaPositive={true}
          sparklineData={sparkData.rakeData}
          sparklineColor="#10b981"
          sparklineFillColor="#10b981"
          bottomNote="vs maggio 2026"
          index={0}
        />
        <KpiCard
          icon={TrendingUp}
          iconColor="text-accent-blue"
          label="Bet Totale"
          value={formatCurrency(totalBet)}
          delta="8.7%"
          deltaPositive={true}
          sparklineData={sparkData.betData}
          sparklineColor="#3b82f6"
          sparklineFillColor="#3b82f6"
          bottomNote="vs maggio 2026"
          index={1}
        />
        <KpiCard
          icon={Coins}
          iconColor="text-warning"
          label="Won Totale"
          value={formatCurrency(totalWon)}
          delta="6.2%"
          deltaPositive={true}
          sparklineData={sparkData.wonData}
          sparklineColor="#f59e0b"
          sparklineFillColor="#f59e0b"
          bottomNote={`Payout medio: ${formatPercent(avgPayout)}`}
          index={2}
        />
        <KpiCard
          icon={Users}
          iconColor="text-accent-cyan"
          label="Giocatori Attivi"
          value={avgActivePerDay.toFixed(1)}
          delta="3.2%"
          deltaPositive={false}
          sparklineData={sparkData.activeData}
          sparklineColor="#06b6d4"
          sparklineFillColor="#06b6d4"
          bottomNote="133 giocatori totali"
          index={3}
        />
        <KpiCard
          icon={Activity}
          iconColor="text-accent-purple"
          label="Tendenza Rake"
          value={`+${formatCurrency(totalRake - 50000).replace('€', '')}`}
          delta={`${negativeDays} giorni negativi`}
          deltaPositive={false}
          deltaWarning={true}
          sparklineData={sparkData.rakeData}
          sparklineColor="#8b5cf6"
          sparklineFillColor="#8b5cf6"
          bottomNote={
            worstDay
              ? `Peggior giorno: ${new Date(worstDay.date).getDate()} giugno (${formatCurrency(worstDay.total_rake)})`
              : ''
          }
          index={4}
        />
      </div>

      {/* ── Section 3+4: Trend Chart + AI Briefing ── */}
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        {/* Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="bg-bg-surface rounded-xl border border-border-subtle p-5 h-[380px] flex flex-col"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[20px] font-semibold text-text-primary">Andamento Giornaliero</h2>
              <p className="text-[13px] text-text-muted mt-0.5">Rake vs Bet — 1-30 Giugno 2026</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-positive" />
                <span className="text-[12px] text-text-secondary">Rake</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-blue" />
                <span className="text-[12px] text-text-secondary">Bet</span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="rakeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="betGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" strokeOpacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={avgRake}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
                <Area
                  type="monotone"
                  dataKey="total_rake"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#rakeGrad)"
                  animationDuration={800}
                />
                <Area
                  type="monotone"
                  dataKey="total_bet"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#betGrad)"
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* AI Briefing Panel */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          <GlassCard className="h-[380px] p-5 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent-purple" />
                <h2 className="text-[20px] font-semibold text-accent-purple">AI Briefing</h2>
              </div>
              <span className="text-[11px] text-text-muted">Generato oggi, 08:30</span>
            </div>
            <p className="text-[13px] text-text-muted mb-4 flex-shrink-0">
              Analisi automatica della rete
            </p>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-1 gap-4">
                <BriefingColumn
                  title="Criticità"
                  icon={AlertTriangle}
                  iconColor="text-negative"
                  borderColor="border-l-negative"
                  items={briefing.criticals}
                  count={briefing.criticals.length}
                  delay={0}
                />
                <BriefingColumn
                  title="Opportunità"
                  icon={TrendingUpIcon}
                  iconColor="text-positive"
                  borderColor="border-l-positive"
                  items={briefing.opportunities}
                  count={briefing.opportunities.length}
                  delay={0.15}
                />
                <BriefingColumn
                  title="Suggerimenti"
                  icon={Lightbulb}
                  iconColor="text-warning"
                  borderColor="border-l-warning"
                  items={briefing.suggestions}
                  count={briefing.suggestions.length}
                  delay={0.3}
                />
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* ── Section 5+6: Top Players + Alert Feed ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Players Table */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.9 }}
          className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-warning" />
              <h2 className="text-[20px] font-semibold text-text-primary">Top 10 Giocatori</h2>
            </div>
            <span className="text-[13px] text-text-muted">Per Rake Totale</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bg-surface-elevated">
                  <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">#</th>
                  <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Username</th>
                  <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">PVR</th>
                  <th className="text-right text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Rake Totale</th>
                  <th className="text-right text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Bet Totale</th>
                  <th className="text-center text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Giorni</th>
                  <th className="text-center text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Health</th>
                  <th className="text-center text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Stato</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((player, i) => {
                  const score = 70 + (10 - i) * 1.5
                  const status = getPlayerStatus(score)
                  const rankBg =
                    i === 0 ? 'bg-yellow-500/10' : i === 1 ? 'bg-gray-400/10' : i === 2 ? 'bg-amber-600/10' : ''

                  return (
                    <motion.tr
                      key={player.username}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.95 + i * 0.03, duration: 0.2 }}
                      className={cn(
                        'border-t border-border-subtle hover:bg-bg-surface-elevated transition-colors cursor-pointer',
                        rankBg,
                      )}
                    >
                      <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{player.rank}</td>
                      <td className="px-4 py-3 text-[14px] font-medium text-text-primary truncate max-w-[120px]">
                        {player.username}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary">
                        {getPvrName(player.pvr_id)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[14px] text-positive">
                        {formatCurrency(player.total_rake)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-text-secondary">
                        {formatCurrency(player.total_bet)}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px]">
                        <span
                          className={cn(
                            player.active_days >= 20
                              ? 'text-positive'
                              : player.active_days >= 10
                              ? 'text-warning'
                              : 'text-negative',
                          )}
                        >
                          {player.active_days}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <HealthScoreRing score={score} size="sm" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                            status.color === 'positive' && 'bg-positive/20 text-positive',
                            status.color === 'warning' && 'bg-warning/20 text-warning',
                            status.color === 'negative' && 'bg-negative/20 text-negative',
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Alert Feed */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.9 }}
          className="bg-bg-surface rounded-xl border border-border-subtle flex flex-col h-[420px]"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-negative" />
              <h2 className="text-[20px] font-semibold text-text-primary">Allerte</h2>
            </div>
            <div className="flex items-center gap-1 bg-bg-surface-elevated rounded-lg p-0.5">
              {(['all', 'high', 'medium'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAlertFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-md text-[12px] font-medium transition-colors',
                    alertFilter === f
                      ? 'bg-accent-blue text-white'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {f === 'all' ? 'Tutte' : f === 'high' ? 'Critiche' : 'Avvisi'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredAlerts.map((alert, i) => (
              <AlertItem key={alert.id} alert={alert} index={i} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
