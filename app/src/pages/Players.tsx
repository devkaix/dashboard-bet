// @ts-nocheck
import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  X,
  Users,
  TrendingUp,
  TrendingDown,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  loadData,
  dataStore,
  formatCurrency,
  formatPercent,
} from '@/lib/data'
import type { Player } from '@/lib/data'

// ─── Health Score Ring ───
function HealthRing({ score, size = 36 }: { score: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color =
    score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-mono font-semibold"
        style={{ color }}
      >
        {Math.round(score)}
      </span>
    </div>
  )
}

// ─── Mini Sparkline ───
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return <div className="w-[80px] h-[24px]" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80
  const h = 24
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-positive/15', text: 'text-positive', label: 'Attivo' },
    inactive: { bg: 'bg-negative/15', text: 'text-negative', label: 'Inattivo' },
  }
  const c = config[status] || { bg: 'bg-bg-surface-elevated', text: 'text-text-muted', label: status }
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium',
        c.bg,
        c.text,
      )}
    >
      {c.label}
    </span>
  )
}

// ─── Player Detail Sheet ───
function PlayerSheet({
  player,
  agentName,
  pvrName,
  dailyData,
  onClose,
}: {
  player: Player
  agentName: string
  pvrName: string
  dailyData: { date: string; buy_in: number; bet: number; won: number; rake: number; payout: number }[]
  onClose: () => void
}) {
  const chartData = dailyData.map((d) => ({
    date: d.date.slice(5),
    rake: d.rake,
    bet: d.bet,
  }))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        className="relative w-[500px] max-w-[90vw] h-full bg-bg-surface border-l border-border-subtle overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg-surface border-b border-border-subtle p-5 flex items-start justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-text-primary">{player.username}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-md bg-bg-surface-elevated text-[11px] text-text-secondary border border-border-subtle">
                {pvrName}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-bg-surface-elevated text-[11px] text-text-secondary border border-border-subtle">
                {agentName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-bg-surface-elevated flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Profile Summary */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-5"
          >
            <HealthRing score={player.health_score} size={80} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={player.status} />
                {player.active_days >= 25 && (
                  <span className="px-2 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple text-[11px] font-medium flex items-center gap-1">
                    <Sparkles size={10} /> Top 1%
                  </span>
                )}
              </div>
              <p className="text-[13px] text-text-secondary">
                {player.first_name} {player.last_name}
              </p>
              <p className="text-[12px] text-text-muted">Ultima attività: {player.last_activity_date}</p>
            </div>
          </motion.div>

          {/* KPI Grid */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { label: 'Rake Totale', value: formatCurrency(player.total_rake) },
              { label: 'Bet Totale', value: formatCurrency(player.total_bet) },
              { label: 'Won', value: formatCurrency(player.total_won) },
              { label: 'Giorni Attivi', value: String(player.active_days) },
              { label: 'Payout Medio', value: formatPercent(player.avg_payout) },
              { label: 'Buy In', value: formatCurrency(player.total_buy_in) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-bg-surface-elevated rounded-lg p-3 border border-border-subtle"
              >
                <p className="text-[11px] text-text-muted mb-1">{kpi.label}</p>
                <p className="text-[14px] font-mono font-semibold text-text-primary">{kpi.value}</p>
              </div>
            ))}
          </motion.div>

          {/* Mini Trend Chart */}
          {chartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle"
            >
              <h3 className="text-[14px] font-semibold text-text-primary mb-3">Trend 30 Giorni</h3>
              <div className="h-[150px] flex items-end gap-[2px]">
                {chartData.map((d, i) => {
                  const maxBet = Math.max(...chartData.map((c) => c.bet), 1)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col gap-[1px]">
                        <div
                          className="w-full rounded-sm bg-positive/60"
                          style={{ height: Math.max((d.rake / maxBet) * 130, 2) }}
                          title={`Rake: ${formatCurrency(d.rake)}`}
                        />
                      </div>
                      <span className="text-[8px] text-text-muted rotate-0">{d.date}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <span className="w-2 h-2 rounded-sm bg-positive/60" /> Rake
                </span>
              </div>
            </motion.div>
          )}

          {/* Daily Activity */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-bg-surface-elevated rounded-lg border border-border-subtle overflow-hidden"
          >
            <div className="p-4 border-b border-border-subtle">
              <h3 className="text-[14px] font-semibold text-text-primary">Attività Giornaliera</h3>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-bg-surface-elevated z-10">
                  <tr className="text-[10px] uppercase text-text-muted font-medium">
                    <th className="text-left px-3 py-2">Data</th>
                    <th className="text-right px-3 py-2">Bet</th>
                    <th className="text-right px-3 py-2">Won</th>
                    <th className="text-right px-3 py-2">Rake</th>
                    <th className="text-right px-3 py-2">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.map((d, i) => (
                    <motion.tr
                      key={d.date}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 + i * 0.02 }}
                      className="border-t border-border-subtle/50 hover:bg-bg-surface-highlight/50"
                    >
                      <td className="px-3 py-2 text-[12px] text-text-secondary">{d.date}</td>
                      <td className="px-3 py-2 text-[12px] font-mono text-text-primary text-right">
                        {formatCurrency(d.bet)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono text-text-primary text-right">
                        {formatCurrency(d.won)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono text-right" style={{ color: d.rake < 0 ? '#ef4444' : '#10b981' }}>
                        {formatCurrency(d.rake)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono text-text-primary text-right">
                        {formatPercent(d.payout)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* AI Insight */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-lg border border-accent-purple/20 p-4"
            style={{
              background: 'rgba(17, 24, 39, 0.7)',
              boxShadow: '0 0 20px rgba(139,92,246,0.15)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-accent-purple" />
              <span className="text-[13px] font-semibold text-accent-purple">Insight AI</span>
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {player.total_rake > 10000
                ? `Top performer della rete. Genera il ${((player.total_rake / 61964.77) * 100).toFixed(1)}% del rake totale da solo. Considerare un programma VIP dedicato per la retention.`
                : player.health_score < 30
                  ? 'Giocatore a rischio. Health score molto basso con attività intermittente. Intervento di retention consigliato entro 7 giorni.'
                  : player.active_days > 20
                    ? 'Giocatore molto attivo con buona regolarità. Monitorare il payout medio per ottimizzare il margine.'
                    : 'Giocatore con potenziale di crescita. Strategia di engagement raccomandata per aumentare la frequenza di gioco.'}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Players Page ───
export default function PlayersPage() {
  const [data, setData] = useState<Player[]>([])
  const [agents, setAgents] = useState<Map<number, string>>(new Map())
  const [pvrs, setPvrs] = useState<Map<number, string>>(new Map())
  const [dailyStats, setDailyStats] = useState<Map<number, { date: string; buy_in: number; bet: number; won: number; rake: number; payout: number }[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const [globalFilter, setGlobalFilter] = useState('')
  const [pvrFilter, setPvrFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'total_rake', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  // Load data
  useEffect(() => {
    loadData()
      .then(() => {
        const ds = dataStore
        setData([...ds.players])

        const agentMap = new Map<number, string>()
        ds.agents.forEach((a) => agentMap.set(a.id, a.name))
        setAgents(agentMap)

        const pvrMap = new Map<number, string>()
        ds.pvrs.forEach((p) => pvrMap.set(p.id, p.name))
        setPvrs(pvrMap)

        const statsMap = new Map<number, { date: string; buy_in: number; bet: number; won: number; rake: number; payout: number }[]>()
        ds.daily_stats.forEach((s) => {
          const arr = statsMap.get(s.player_id) || []
          arr.push({
            date: s.date,
            buy_in: s.buy_in || 0,
            bet: s.bet || 0,
            won: s.won || 0,
            rake: s.rake || 0,
            payout: s.payout || 0,
          })
          statsMap.set(s.player_id, arr)
        })
        // Sort each player's stats by date desc
        statsMap.forEach((arr) => arr.sort((a, b) => b.date.localeCompare(a.date)))
        setDailyStats(statsMap)

        setLoading(false)
      })
      .catch((err: Error) => {
        console.error('Players load error:', err)
        setLoading(false)
      })
  }, [])

  // Stats
  const stats = useMemo(() => {
    if (!data.length) return { total: 0, active: 0, inactive: 0, avgRake: 0, topPlayer: '' }
    const active = data.filter((p) => p.status === 'active').length
    const totalRake = data.reduce((s, p) => s + p.total_rake, 0)
    const top = data.reduce((best, p) => (p.total_rake > best.total_rake ? p : best), data[0])
    return {
      total: data.length,
      active,
      inactive: data.length - active,
      avgRake: totalRake / data.length,
      topPlayer: top?.username || '',
    }
  }, [data])

  // Filtered data
  const filteredData = useMemo(() => {
    return data.filter((player) => {
      if (globalFilter) {
        const q = globalFilter.toLowerCase()
        const pvrName = pvrs.get(player.pvr_id) || ''
        const agentName = agents.get(player.agent_id) || ''
        if (
          !player.username.toLowerCase().includes(q) &&
          !player.first_name.toLowerCase().includes(q) &&
          !player.last_name.toLowerCase().includes(q) &&
          !pvrName.toLowerCase().includes(q) &&
          !agentName.toLowerCase().includes(q)
        )
          return false
      }
      if (pvrFilter !== 'all' && String(player.pvr_id) !== pvrFilter) return false
      if (statusFilter !== 'all' && player.status !== statusFilter) return false
      if (activityFilter !== 'all') {
        if (activityFilter === 'high' && player.active_days < 20) return false
        if (activityFilter === 'medium' && (player.active_days < 10 || player.active_days >= 20)) return false
        if (activityFilter === 'low' && player.active_days >= 10) return false
      }
      return true
    })
  }, [data, globalFilter, pvrFilter, statusFilter, activityFilter, pvrs, agents])

  // Columns
  const columnHelper = createColumnHelper<Player>()

  const columns = useMemo<ColumnDef<Player, any>[]>(
    () => [
      columnHelper.accessor('username', {
        header: 'Username',
        cell: (info) => (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-accent-blue/15 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-accent-blue">
                {info.getValue().slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-[13px] font-medium text-text-primary truncate max-w-[120px]">
              {info.getValue()}
            </span>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'pvr',
        header: 'PVR',
        cell: (info) => (
          <span className="text-[12px] text-text-secondary">
            {pvrs.get(info.row.original.pvr_id) || `PVR ${info.row.original.pvr_id}`}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'agent',
        header: 'Agente',
        cell: (info) => (
          <span className="text-[12px] text-text-secondary">
            {agents.get(info.row.original.agent_id) || `Agent ${info.row.original.agent_id}`}
          </span>
        ),
      }),
      columnHelper.accessor('total_rake', {
        header: 'Rake Totale',
        cell: (info) => (
          <span className="text-[13px] font-mono text-text-primary text-right block">
            {formatCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('total_bet', {
        header: 'Bet Totale',
        cell: (info) => (
          <span className="text-[13px] font-mono text-text-primary text-right block">
            {formatCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('avg_payout', {
        header: 'Payout %',
        cell: (info) => {
          const v = info.getValue()
          const color = v > 150 ? 'text-negative' : v > 100 ? 'text-warning' : v < 50 ? 'text-positive' : 'text-text-primary'
          return (
            <span className={cn('text-[13px] font-mono text-right block', color)}>
              {formatPercent(v)}
            </span>
          )
        },
      }),
      columnHelper.accessor('active_days', {
        header: 'Giorni Attivi',
        cell: (info) => {
          const v = info.getValue()
          const color = v >= 20 ? 'text-positive' : v >= 10 ? 'text-warning' : 'text-negative'
          return (
            <div className="flex justify-center">
              <span
                className={cn(
                  'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[12px] font-medium',
                  color,
                  v >= 20 ? 'bg-positive/10' : v >= 10 ? 'bg-warning/10' : 'bg-negative/10',
                )}
              >
                {v}
              </span>
            </div>
          )
        },
      }),
      columnHelper.accessor('health_score', {
        header: 'Health',
        cell: (info) => <HealthRing score={info.getValue()} size={36} />,
      }),
      columnHelper.accessor('status', {
        header: 'Stato',
        cell: (info) => (
          <div className="flex justify-center">
            <StatusBadge status={info.getValue()} />
          </div>
        ),
      }),
      columnHelper.display({
        id: 'trend',
        header: 'Trend',
        cell: (info) => {
          const playerStats = dailyStats.get(info.row.original.id) || []
          const last14 = playerStats.slice(0, 14).reverse()
          const scores = last14.map((s) => s.rake)
          const score = info.row.original.health_score
          const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
          return <MiniSparkline data={scores} color={color} />
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            onClick={() => setSelectedPlayer(info.row.original)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-accent-blue hover:bg-bg-surface-elevated transition-colors"
          >
            <Eye size={14} />
          </button>
        ),
      }),
    ],
    [pvrs, agents, dailyStats],
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Export CSV
  const exportCSV = useCallback(() => {
    const rows = filteredData
    const headers = ['Username', 'Nome', 'PVR', 'Agente', 'Rake', 'Bet', 'Won', 'Payout', 'Giorni Attivi', 'Health Score', 'Stato']
    const csv = [
      headers.join(','),
      ...rows.map((p) =>
        [
          p.username,
          `${p.first_name} ${p.last_name}`,
          pvrs.get(p.pvr_id) || '',
          agents.get(p.agent_id) || '',
          p.total_rake.toFixed(2),
          p.total_bet.toFixed(2),
          p.total_won.toFixed(2),
          p.avg_payout.toFixed(2),
          p.active_days,
          p.health_score.toFixed(2),
          p.status,
        ].join(','),
      ),
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dazn_giocatori_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredData, pvrs, agents])

  // PVR options
  const pvrOptions = useMemo(() => {
    const opts: { id: number; name: string }[] = []
    pvrs.forEach((name, id) => opts.push({ id, name }))
    return opts.sort((a, b) => a.name.localeCompare(b.name))
  }, [pvrs])

  const pageCount = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex + 1

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-bg-surface-elevated rounded" />
          <div className="h-12 w-full bg-bg-surface-elevated rounded-lg" />
          <div className="h-[400px] w-full bg-bg-surface-elevated rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <nav className="flex items-center gap-2 text-[12px] text-text-muted mb-1">
          <span>Dashboard</span>
          <span>/</span>
          <span className="text-text-secondary">Giocatori</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-text-primary tracking-[-0.01em]">Giocatori</h1>
            <p className="text-[14px] text-text-secondary">
              {stats.total} giocatori • Aggiornato: oggi 08:30
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: 'Rake Totale', value: formatCurrency(data.reduce((s, p) => s + p.total_rake, 0)) },
              { label: 'Bet Totale', value: formatCurrency(data.reduce((s, p) => s + p.total_bet, 0)) },
              { label: 'Payout Medio', value: formatPercent(data.reduce((s, p) => s + p.avg_payout, 0) / data.length) },
            ].map((s) => (
              <span
                key={s.label}
                className="px-3 py-1.5 rounded-full bg-bg-surface-elevated text-[12px] text-text-secondary border border-border-subtle"
              >
                {s.label}: {s.value}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Stats Summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="grid grid-cols-5 gap-4"
      >
        {[
          { icon: Users, label: 'Totale Giocatori', value: String(stats.total), color: 'text-accent-blue' },
          { icon: TrendingUp, label: 'Attivi', value: String(stats.active), color: 'text-positive' },
          { icon: TrendingDown, label: 'Inattivi', value: String(stats.inactive), color: 'text-negative' },
          { icon: Users, label: 'Rake Medio', value: formatCurrency(stats.avgRake), color: 'text-accent-cyan' },
          { icon: Sparkles, label: 'Top Player', value: stats.topPlayer, color: 'text-accent-purple' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-bg-surface rounded-lg border border-border-subtle p-4 flex items-center gap-3"
          >
            <div className={cn('p-2 rounded-lg bg-bg-surface-elevated', s.color)}>
              <s.icon size={16} />
            </div>
            <div>
              <p className="text-[11px] text-text-muted">{s.label}</p>
              <p className="text-[15px] font-mono font-semibold text-text-primary">{s.value}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="bg-bg-surface rounded-lg border border-border-subtle p-3 space-y-3"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex items-center w-[320px]">
            <Search size={16} className="absolute left-3 text-text-muted" />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
              placeholder="Cerca username, PVR, agente..."
              className="w-full h-9 pl-9 pr-8 rounded-md bg-bg-surface-elevated border border-border-subtle text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-colors"
            />
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter('')}
                className="absolute right-2 text-text-muted hover:text-text-primary"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          {/* PVR Filter */}
          <select
            value={pvrFilter}
            onChange={(e) => {
              setPvrFilter(e.target.value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
            className="h-9 px-3 rounded-md bg-bg-surface-elevated border border-border-subtle text-[13px] text-text-primary outline-none focus:border-border-focus cursor-pointer"
          >
            <option value="all">Tutti i PVR</option>
            {pvrOptions.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
            className="h-9 px-3 rounded-md bg-bg-surface-elevated border border-border-subtle text-[13px] text-text-primary outline-none focus:border-border-focus cursor-pointer"
          >
            <option value="all">Tutti gli Stati</option>
            <option value="active">Attivo</option>
            <option value="inactive">Inattivo</option>
          </select>

          {/* Activity Filter */}
          <select
            value={activityFilter}
            onChange={(e) => {
              setActivityFilter(e.target.value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
            className="h-9 px-3 rounded-md bg-bg-surface-elevated border border-border-subtle text-[13px] text-text-primary outline-none focus:border-border-focus cursor-pointer"
          >
            <option value="all">Tutti i Livelli</option>
            <option value="high">Molto Attivo (20+)</option>
            <option value="medium">Attivo (10-19)</option>
            <option value="low">Poco Attivo (&lt;10)</option>
          </select>

          <div className="flex-1" />

          {/* Export */}
          <button
            onClick={exportCSV}
            className="h-9 px-4 rounded-md bg-accent-blue text-white text-[13px] font-medium flex items-center gap-2 hover:brightness-110 transition-all"
          >
            <Download size={14} />
            Esporta CSV
          </button>
        </div>

        {/* Active filter pills */}
        <AnimatePresence>
          {(globalFilter || pvrFilter !== 'all' || statusFilter !== 'all' || activityFilter !== 'all') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 flex-wrap"
            >
              {globalFilter && (
                <FilterPill label={`Cerca: ${globalFilter}`} onRemove={() => setGlobalFilter('')} />
              )}
              {pvrFilter !== 'all' && (
                <FilterPill label={`PVR: ${pvrs.get(Number(pvrFilter)) || pvrFilter}`} onRemove={() => setPvrFilter('all')} />
              )}
              {statusFilter !== 'all' && (
                <FilterPill label={`Stato: ${statusFilter === 'active' ? 'Attivo' : 'Inattivo'}`} onRemove={() => setStatusFilter('all')} />
              )}
              {activityFilter !== 'all' && (
                <FilterPill
                  label={`Attività: ${activityFilter === 'high' ? 'Molto Attivo' : activityFilter === 'medium' ? 'Attivo' : 'Poco Attivo'}`}
                  onRemove={() => setActivityFilter('all')}
                />
              )}
              <button
                onClick={() => {
                  setGlobalFilter('')
                  setPvrFilter('all')
                  setStatusFilter('all')
                  setActivityFilter('all')
                }}
                className="text-[12px] text-accent-blue hover:underline ml-1"
              >
                Cancella Filtri
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[12px] text-text-muted">{filteredData.length} risultati</p>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="bg-bg-surface rounded-lg border border-border-subtle overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-bg-surface-elevated border-b border-border-subtle">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className={cn(
                        'px-3 py-2.5 text-left text-[11px] uppercase text-text-muted font-medium tracking-wide select-none',
                        h.column.getCanSort() && 'cursor-pointer hover:text-text-primary transition-colors',
                      )}
                      style={{ width: h.getSize() }}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {h.column.columnDef.header?.toString()}
                        {h.column.getIsSorted() === 'asc' && <ChevronUp size={12} className="text-accent-blue" />}
                        {h.column.getIsSorted() === 'desc' && <ChevronDown size={12} className="text-accent-blue" />}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-20 text-center">
                      <Search size={48} className="mx-auto mb-3 text-text-muted" />
                      <p className="text-[16px] font-semibold text-text-secondary mb-1">
                        Nessun giocatore trovato
                      </p>
                      <p className="text-[13px] text-text-muted mb-3">
                        Prova a modificare i filtri di ricerca
                      </p>
                      <button
                        onClick={() => {
                          setGlobalFilter('')
                          setPvrFilter('all')
                          setStatusFilter('all')
                          setActivityFilter('all')
                        }}
                        className="px-4 py-2 rounded-md bg-bg-surface-elevated border border-border-default text-[13px] text-text-primary hover:bg-bg-surface-highlight transition-colors"
                      >
                        Cancella Filtri
                      </button>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, rowIndex) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(rowIndex * 0.015, 0.3) }}
                      className="border-b border-border-subtle/50 hover:bg-bg-surface-elevated transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2">
                          {cell.column.columnDef.cell
                            ? flexRender(cell.column.columnDef.cell, cell.getContext())
                            : String(cell.getValue())}
                        </td>
                      ))}
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Pagination */}
      {filteredData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-bg-surface rounded-lg border border-border-subtle p-3 flex items-center justify-between"
        >
          <p className="text-[12px] text-text-muted">
            Visualizzazione {pagination.pageIndex * pagination.pageSize + 1}-
            {Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredData.length)} di{' '}
            {filteredData.length} giocatori
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="w-8 h-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => table.setPageIndex(p - 1)}
                className={cn(
                  'w-8 h-8 rounded-md text-[13px] font-medium transition-colors',
                  p === currentPage
                    ? 'bg-accent-blue text-white'
                    : 'text-text-secondary hover:bg-bg-surface-elevated',
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="w-8 h-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text-muted">Righe per pagina:</span>
            <select
              value={pagination.pageSize}
              onChange={(e) =>
                setPagination((p) => ({ ...p, pageSize: Number(e.target.value), pageIndex: 0 }))
              }
              className="h-7 px-2 rounded-md bg-bg-surface-elevated border border-border-subtle text-[12px] text-text-primary outline-none cursor-pointer"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </motion.div>
      )}

      {/* Player Detail Sheet */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerSheet
            player={selectedPlayer}
            agentName={agents.get(selectedPlayer.agent_id) || `Agent ${selectedPlayer.agent_id}`}
            pvrName={pvrs.get(selectedPlayer.pvr_id) || `PVR ${selectedPlayer.pvr_id}`}
            dailyData={dailyStats.get(selectedPlayer.id) || []}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Helper: flexRender for cells ───
function flexRender<TProps extends object>(comp: ((props: TProps) => React.ReactNode) | React.ReactNode, props: TProps): React.ReactNode {
  if (typeof comp === 'function') {
    return (comp as (props: TProps) => React.ReactNode)(props)
  }
  return comp
}

// ─── Filter Pill ───
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-surface-elevated border border-border-subtle text-[11px] text-text-secondary"
    >
      {label}
      <button onClick={onRemove} className="hover:text-text-primary transition-colors">
        <X size={10} />
      </button>
    </motion.span>
  )
}
