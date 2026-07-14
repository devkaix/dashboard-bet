import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Send,
  Mic,
  Paperclip,
  Lightbulb,
  TrendingUp,
  Trophy,
  Network,
  AlertTriangle,
  X,
  Star,
  Shield,
  Zap,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatCurrency,
  getDailyKpis,
  getRankings,
  getAlerts,
  getBriefing,
  getPvrs,
  formatPercent,
  loadData,
  dataStore,
  getMetadata,
} from '@/lib/data'

/* ─── Types ─── */

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
  dataComponent?: DataComponent
}

type DataComponent =
  | { type: 'kpi'; value: number; delta: number; label: string; vsLabel: string }
  | { type: 'table'; headers: string[]; rows: (string | number)[][] }
  | { type: 'trend'; data: { label: string; value: number }[] }
  | { type: 'alert'; severity: 'critical' | 'warning' | 'info'; count: number; message: string }
  | { type: 'briefing'; criticals: string[]; opportunities: string[]; suggestions: string[] }

interface QuestionCategory {
  key: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color: string
  questions: string[]
}

/* ─── Constants ─── */

const QUESTION_CATEGORIES: QuestionCategory[] = [
  {
    key: 'trend',
    label: 'Trend',
    icon: TrendingUp,
    color: '#06b6d4',
    questions: [
      "Perche' l'ultimo mese e' andato peggio del precedente?",
      "Qual e' il trend del rake?",
    ],
  },
  {
    key: 'ranking',
    label: 'Ranking',
    icon: Trophy,
    color: '#f59e0b',
    questions: [
      "Quali sono i 5 PVR migliori?",
      "Chi sono i giocatori top?",
    ],
  },
  {
    key: 'network',
    label: 'Network',
    icon: Network,
    color: '#3b82f6',
    questions: [
      "Quali PVR stanno crescendo?",
      "Quali agenti perdono giocatori?",
    ],
  },
  {
    key: 'anomalies',
    label: 'Anomalie',
    icon: AlertTriangle,
    color: '#ef4444',
    questions: [
      "Ci sono anomalie questo mese?",
      "Giorni con rake negativo?",
    ],
  },
]

const QUICK_CHIPS = [
  "Rake di oggi",
  "Top giocatori",
  "Allerte",
  "Confronta periodi",
  "Trend",
  "Fai un briefing",
]

/* ─── Period helpers ─── */

function capitalizeMonthLabel(label: string): string {
  if (!label) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getLatestPeriodLabel(): string {
  try {
    const meta = getMetadata()
    if (meta.period_end) {
      return capitalizeMonthLabel(format(new Date(meta.period_end), 'MMMM yyyy', { locale: it }))
    }
  } catch {
    // fall through
  }
  try {
    const kpis = getDailyKpis()
    if (kpis.length > 0) {
      const latest = kpis[kpis.length - 1].date
      return capitalizeMonthLabel(format(new Date(latest), 'MMMM yyyy', { locale: it }))
    }
  } catch {
    // fall through
  }
  return 'periodo corrente'
}

/* ─── Pre-built analytical responses ─── */

function getAnalyticalResponse(userText: string): { content: string; dataComponent?: DataComponent } {
  const lower = userText.toLowerCase()

  // Response 1: Ultimo mese vs precedente / trend negativo
  if (lower.includes("peggio") || lower.includes("maggio") || lower.includes("giugno") || lower.includes("ultimo mese")) {
    const dailyKpis = getDailyKpis()
    const monthly = dataStore.monthly_aggregates
    const negativeDays = dailyKpis.filter((d) => d.total_rake < 0)
    const worstDay = negativeDays.length > 0
      ? negativeDays.reduce((a, b) => (a.total_rake < b.total_rake ? a : b))
      : null
    const avgPayout = dailyKpis.length > 0 ? dailyKpis.reduce((s, d) => s + d.avg_payout, 0) / dailyKpis.length : 0
    const avgPlayers = dailyKpis.length > 0 ? dailyKpis.reduce((s, d) => s + d.active_players, 0) / dailyKpis.length : 0
    const totalRake = monthly.rake
    const totalWon = monthly.won
    const periodLabel = getLatestPeriodLabel()

    return {
      content: `Nel periodo ${periodLabel} il rake totale e' stato di ${formatCurrency(totalRake)} e le vincite totali ${formatCurrency(totalWon)}. Ci sono stati ${negativeDays.length} giorni con rake negativo${worstDay ? `, il peggiore il ${format(new Date(worstDay.date), 'dd MMMM', { locale: it })} con ${formatCurrency(worstDay.total_rake)}` : ''}. Il payout medio e' del ${formatPercent(avgPayout)} e i giocatori attivi sono stati in media ${avgPlayers.toFixed(1)} al giorno.`,
      dataComponent: {
        type: 'trend' as const,
        data: dailyKpis.map((d) => ({
          label: format(new Date(d.date), 'dd', { locale: it }),
          value: Math.round(d.total_rake),
        })),
      },
    }
  }

  // Response 2: 5 PVR migliori
  if (lower.includes("pvr") || lower.includes("migliori")) {
    const rankings = getRankings()
    const top5 = rankings.top_pvrs.slice(0, 5)
    const pvrs = getPvrs()
    const periodLabel = getLatestPeriodLabel()
    return {
      content: `Ecco i 5 PVR migliori per performance di rake nel periodo ${periodLabel}:`,
      dataComponent: {
        type: 'table' as const,
        headers: ['PVR', 'Rake', 'Bet', 'Giocatori Attivi', 'Health Score'],
        rows: top5.map((p) => {
          const pvr = pvrs.find((pv) => pv.id === p.pvr_id)
          return [
            pvr ? pvr.name : p.pvr_name,
            formatCurrency(p.total_rake),
            formatCurrency(p.total_bet),
            p.active_players,
            p.health_score ?? '-',
          ]
        }),
      },
    }
  }

  // Response 3: Giocatori top
  if (lower.includes("giocatori") || lower.includes("giocatore") || lower.includes("top") || lower.includes("performando")) {
    const rankings = getRankings()
    const top5 = rankings.top_players_by_rake.slice(0, 5)
    const top1 = top5[0]
    const top2 = top5[1]
    const top3 = top5[2]

    return {
      content: `Il giocatore top e' ${top1?.username ?? 'N/A'} con ${formatCurrency(top1?.total_rake ?? 0)} di rake, seguito da ${top2?.username ?? 'N/A'} (${formatCurrency(top2?.total_rake ?? 0)}) e ${top3?.username ?? 'N/A'} (${formatCurrency(top3?.total_rake ?? 0)}).`,
      dataComponent: {
        type: 'table' as const,
        headers: ['Rank', 'Giocatore', 'Rake', 'Bet', 'Giorni Attivi'],
        rows: top5.map((p, i) => [
          `#${i + 1}`,
          p.username,
          formatCurrency(p.total_rake),
          formatCurrency(p.total_bet),
          p.active_days,
        ]),
      },
    }
  }

  // Response 4: Anomalie
  if (lower.includes("anomalie") || lower.includes("anomal")) {
    const dailyKpis = getDailyKpis()
    const negativeDays = dailyKpis.filter((d) => d.total_rake < 0)
    const worstDay = negativeDays.length > 0
      ? negativeDays.reduce((a, b) => (a.total_rake < b.total_rake ? a : b))
      : null
    const alerts = getAlerts()
    const periodLabel = getLatestPeriodLabel()

    return {
      content: `Ho rilevato ${negativeDays.length} giorni con rake negativo nel periodo ${periodLabel}. L'anomalia piu' critica e' il ${worstDay ? format(new Date(worstDay.date), 'dd/MM', { locale: it }) : 'N/A'} con ${formatCurrency(worstDay?.total_rake ?? 0)}. Sono presenti ${alerts.length} allerte attive in totale.`,
      dataComponent: {
        type: 'alert' as const,
        severity: 'critical',
        count: negativeDays.length,
        message: `${negativeDays.length} giorni con rake negativo, ${alerts.length} allerte attive`,
      },
    }
  }

  // Response 5: Briefing
  if (lower.includes("briefing") || lower.includes("riassunto")) {
    const briefing = getBriefing()
    const criticals = briefing.criticals.slice(0, 3).map((c) => c.title)
    const opportunities = briefing.opportunities.slice(0, 3).map((o) => o.title)
    const suggestions = briefing.suggestions.slice(0, 4).map((s) => s.title)
    const periodLabel = getLatestPeriodLabel()

    return {
      content: `Ecco il briefing completo basato sull'analisi dei dati del periodo ${periodLabel}:`,
      dataComponent: {
        type: 'briefing' as const,
        criticals,
        opportunities,
        suggestions,
      },
    }
  }

  // Response 6: Trend del rake
  if (lower.includes("trend") && lower.includes("rake")) {
    const dailyKpis = getDailyKpis()
    const monthly = dataStore.monthly_aggregates
    const totalRake = monthly.rake
    const negativeDays = dailyKpis.filter((d) => d.total_rake < 0)
    const periodLabel = getLatestPeriodLabel()
    return {
      content: `Il trend del rake nel periodo ${periodLabel} mostra un totale di ${formatCurrency(totalRake)} con ${negativeDays.length} giorni negativi su ${dailyKpis.length} giorni totali. La media giornaliera e' di ${formatCurrency(dailyKpis.length ? totalRake / dailyKpis.length : 0)}.`,
      dataComponent: {
        type: 'trend' as const,
        data: dailyKpis.map((d) => ({
          label: format(new Date(d.date), 'dd', { locale: it }),
          value: Math.round(d.total_rake),
        })),
      },
    }
  }

  // Response 7: Giorni con rake negativo
  if (lower.includes("negativo") || lower.includes("giorni")) {
    const dailyKpis = getDailyKpis()
    const negativeDays = dailyKpis.filter((d) => d.total_rake < 0)
    const worstDay = negativeDays.length > 0
      ? negativeDays.reduce((a, b) => (a.total_rake < b.total_rake ? a : b))
      : null
    const periodLabel = getLatestPeriodLabel()

    return {
      content: `Nel periodo ${periodLabel} ci sono stati ${negativeDays.length} giorni con rake negativo. Il giorno peggiore e' stato il ${worstDay ? format(new Date(worstDay.date), 'dd/MM', { locale: it }) : 'N/A'} con ${formatCurrency(worstDay?.total_rake ?? 0)}.`,
      dataComponent: {
        type: 'trend' as const,
        data: dailyKpis.map((d) => ({
          label: format(new Date(d.date), 'dd', { locale: it }),
          value: Math.round(d.total_rake),
        })),
      },
    }
  }

  // Default response
  const periodLabel = getLatestPeriodLabel()
  return {
    content: `Non ho informazioni specifiche su questa domanda. Prova a chiedermi qualcosa sui dati del periodo ${periodLabel}, come il rake totale, le vincite, i giocatori top, i PVR migliori o le anomalie.`,
  }
}

/* ─── Animation variants ─── */

const easeDefault = [0.4, 0, 0.2, 1] as [number, number, number, number]

const messageVariants = {
  user: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.2, ease: easeDefault },
  },
  ai: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: easeDefault },
  },
}

/* ─── Typing Indicator ─── */

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 mb-4"
    >
      <div className="w-7 h-7 rounded-full bg-accent-purple flex items-center justify-center flex-shrink-0">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="flex items-center gap-1 px-4 py-3 rounded-xl bg-bg-surface border border-border-subtle">
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-purple"
          animate={{ scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
        />
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-purple"
          animate={{ scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }}
        />
        <motion.span
          className="w-2 h-2 rounded-full bg-accent-purple"
          animate={{ scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }}
        />
      </div>
    </motion.div>
  )
}

/* ─── Data Component Renderers ─── */

function MiniKPICard({ value, delta, label, vsLabel }: { value: number; delta: number; label: string; vsLabel: string }) {
  const isPositive = delta >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
      className="inline-flex flex-col px-4 py-3 rounded-xl bg-bg-surface-elevated border border-border-subtle shadow-md mt-3"
    >
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-[22px] font-bold font-mono text-text-primary">{formatCurrency(value)}</span>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-[12px] font-semibold px-2 py-0.5 rounded-full',
            isPositive ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative',
          )}
        >
          {isPositive ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
      <span className="text-[11px] text-text-muted mt-1">{vsLabel}</span>
    </motion.div>
  )
}

function MiniTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
      className="mt-3 overflow-hidden rounded-xl bg-bg-surface-elevated border border-border-subtle shadow-md"
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-bg-surface-highlight">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <motion.tr
              key={ri}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 + ri * 0.05 }}
              className="border-t border-border-subtle hover:bg-bg-surface-highlight/50 transition-colors"
            >
              {row.map((cell, ci) => (
                <td key={ci} className={cn('px-3 py-2', typeof cell === 'number' && ci === row.length - 1 ? 'font-mono' : '')}>
                  {ci === row.length - 1 && headers[ci]?.toLowerCase().includes('health') ? (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full text-[12px] font-bold',
                        typeof cell === 'number' && cell >= 80
                          ? 'bg-positive/15 text-positive'
                          : typeof cell === 'number' && cell >= 50
                            ? 'bg-warning/15 text-warning'
                            : 'bg-negative/15 text-negative',
                      )}
                    >
                      {cell}
                    </span>
                  ) : (
                    <span className={cn(typeof cell === 'number' ? 'font-mono text-text-primary' : 'text-text-secondary')}>
                      {cell}
                    </span>
                  )}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  )
}

function MiniTrendChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
      className="mt-3 w-full h-[100px] rounded-xl bg-bg-surface-elevated border border-border-subtle shadow-md p-3"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Bar
            dataKey="value"
            fill="#8b5cf6"
            radius={[2, 2, 0, 0]}
            fillOpacity={0.7}
          >
            {data.map((entry, index) => (
              <rect
                key={index}
                fill={entry.value < 0 ? '#ef4444' : '#8b5cf6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  )
}

function AlertCards({ severity, count, message }: { severity: string; count: number; message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
      className="mt-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border',
            severity === 'critical'
              ? 'bg-negative/10 border-negative/30 text-negative'
              : severity === 'warning'
                ? 'bg-warning/10 border-warning/30 text-warning'
                : 'bg-info/10 border-info/30 text-info',
          )}
        >
          <AlertTriangle size={16} />
          <span className="text-[13px] font-semibold">{count} {severity === 'critical' ? 'Critico' : severity === 'warning' ? 'Warning' : 'Info'}</span>
        </div>
        <span className="text-[13px] text-text-secondary">{message}</span>
      </div>
    </motion.div>
  )
}

function BriefingView({
  criticals,
  opportunities,
  suggestions,
}: {
  criticals: string[]
  opportunities: string[]
  suggestions: string[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
      className="mt-3 space-y-3"
    >
      {/* Criticals */}
      {criticals.length > 0 && (
        <div className="rounded-xl bg-negative/5 border border-negative/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-negative" />
            <span className="text-[13px] font-semibold text-negative">Criticità</span>
          </div>
          <ul className="space-y-1.5">
            {criticals.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text-secondary">
                <span className="text-negative mt-0.5">{i + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div className="rounded-xl bg-positive/5 border border-positive/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-positive" />
            <span className="text-[13px] font-semibold text-positive">Opportunità</span>
          </div>
          <ul className="space-y-1.5">
            {opportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text-secondary">
                <span className="text-positive mt-0.5">{i + 1}.</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl bg-accent-blue/5 border border-accent-blue/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} className="text-accent-blue" />
            <span className="text-[13px] font-semibold text-accent-blue">Suggerimenti</span>
          </div>
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text-secondary">
                <span className="text-accent-blue mt-0.5">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}

function DataComponentRenderer({ dc }: { dc: DataComponent }) {
  switch (dc.type) {
    case 'kpi':
      return <MiniKPICard value={dc.value} delta={dc.delta} label={dc.label} vsLabel={dc.vsLabel} />
    case 'table':
      return <MiniTable headers={dc.headers} rows={dc.rows} />
    case 'trend':
      return <MiniTrendChart data={dc.data} />
    case 'alert':
      return <AlertCards severity={dc.severity} count={dc.count} message={dc.message} />
    case 'briefing':
      return <BriefingView criticals={dc.criticals} opportunities={dc.opportunities} suggestions={dc.suggestions} />
    default:
      return null
  }
}

/* ─── Message Bubble ─── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const timestamp = format(message.timestamp, 'HH:mm', { locale: it })

  if (isUser) {
    return (
      <motion.div
        variants={messageVariants.user}
        initial="initial"
        animate="animate"
        className="flex justify-end mb-4"
      >
        <div className="flex flex-col items-end max-w-[85%]">
          <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-accent-blue text-white text-[14px] leading-relaxed">
            {message.content}
          </div>
          <span className="text-[11px] text-text-muted mt-1 mr-2">{timestamp}</span>
        </div>
      </motion.div>
    )
  }

  // AI message
  return (
    <motion.div
      variants={messageVariants.ai}
      initial="initial"
      animate="animate"
      className="flex justify-start mb-4"
    >
      <div className="flex gap-3 max-w-[85%]">
        {/* AI Avatar */}
        <div className="w-7 h-7 rounded-full bg-accent-purple flex items-center justify-center flex-shrink-0 mt-1">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="relative px-4 py-3 rounded-2xl rounded-tl-sm border border-[rgba(139,92,246,0.15)]"
            style={{
              background: 'rgba(17, 24, 39, 0.7)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 0 20px rgba(139,92,246,0.15)',
            }}
          >
            {/* Purple glow pulse on left border */}
            <motion.div
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent-purple"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <p className="text-[14px] leading-relaxed text-text-primary pl-2">
              {message.content}
            </p>
            {message.dataComponent && (
              <div className="pl-2">
                <DataComponentRenderer dc={message.dataComponent} />
              </div>
            )}
          </div>
          <span className="text-[11px] text-text-muted mt-1 ml-2">{timestamp}</span>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Welcome Message ─── */

function WelcomeMessage() {
  return (
    <motion.div
      variants={messageVariants.ai}
      initial="initial"
      animate="animate"
      className="flex justify-start mb-6"
    >
      <div className="flex gap-3 max-w-[85%]">
        <motion.div
          className="w-10 h-10 rounded-full bg-accent-purple flex items-center justify-center flex-shrink-0"
          animate={{ boxShadow: ['0 0 0px rgba(139,92,246,0)', '0 0 20px rgba(139,92,246,0.4)', '0 0 0px rgba(139,92,246,0)'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles size={18} className="text-white" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <div
            className="relative px-5 py-4 rounded-2xl rounded-tl-sm border border-[rgba(139,92,246,0.15)]"
            style={{
              background: 'rgba(17, 24, 39, 0.7)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 0 20px rgba(139,92,246,0.15)',
            }}
          >
            <motion.div
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent-purple"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <p className="text-[15px] leading-relaxed text-text-primary pl-2 font-medium">
              Ciao! Sono l&apos;Assistente Analitico di DAZN Bet. Come posso aiutarti oggi?
            </p>
            <p className="text-[13px] leading-relaxed text-text-secondary mt-2 pl-2">
              Analizzo i dati reali della rete commerciale: performance, giocatori, PVR e anomalie. Non uso modelli generativi: tutte le risposte sono calcolate sui dati caricati.
            </p>
          </div>
          <span className="text-[11px] text-text-muted mt-1 ml-2">{format(Date.now(), 'HH:mm', { locale: it })}</span>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Suggested Questions Sidebar ─── */

function SuggestedQuestionsSidebar({ onQuestionClick }: { onQuestionClick: (q: string) => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.2, ease: easeDefault }}
      className="w-[280px] flex-shrink-0 bg-bg-surface border-r border-border-subtle flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-4 py-4 border-b border-border-subtle flex items-center gap-2">
        <Lightbulb size={16} className="text-accent-purple" />
        <span className="text-[16px] font-semibold text-text-primary">Domande Suggerite</span>
      </div>

      {/* Question categories */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {QUESTION_CATEGORIES.map((category, ci) => {
          const Icon = category.icon
          return (
            <div key={category.key}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: category.color }}><Icon size={14} /></span>
                <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: category.color }}>
                  {category.label}
                </span>
              </div>
              <div className="space-y-1.5">
                {category.questions.map((q, qi) => (
                  <motion.button
                    key={qi}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + ci * 0.05 + qi * 0.03, duration: 0.2 }}
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(26, 35, 50, 1)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onQuestionClick(q)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] text-text-secondary hover:text-text-primary transition-colors duration-150"
                  >
                    {q}
                  </motion.button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Panel */}
      <div className="p-4 border-t border-border-subtle">
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Contesto Attuale</span>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="px-3 py-1 rounded-full bg-bg-surface-elevated text-[11px] text-text-secondary">
            Periodo: {dataStore.metadata.period_end
              ? capitalizeMonthLabel(format(new Date(dataStore.metadata.period_end), 'MMMM yyyy', { locale: it }))
              : 'corrente'}
          </span>
          <span className="px-3 py-1 rounded-full bg-bg-surface-elevated text-[11px] text-text-secondary">
            Rete: Completa
          </span>
          <span className="px-3 py-1 rounded-full bg-bg-surface-elevated text-[11px] text-text-secondary">
            Dati: {dataStore.metadata.total_players} giocatori, {dataStore.metadata.total_records} record
          </span>
        </div>
      </div>
    </motion.aside>
  )
}

/* ─── Chat Input Bar ─── */

function ChatInputBar({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    if (inputRef.current) {
      inputRef.current.style.height = '48px'
    }
  }, [text, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = '48px'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.5, ease: easeDefault }}
      className="flex-shrink-0 bg-bg-surface border-t border-border-subtle px-6 py-4"
    >
      {/* Input row */}
      <div className="flex items-end gap-3">
        <button className="w-10 h-10 rounded-full bg-bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors flex-shrink-0">
          <Paperclip size={18} />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi una domanda sui dati della rete..."
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full bg-bg-surface-elevated rounded-full px-5 py-3 text-[14px] text-text-primary placeholder:text-text-muted outline-none transition-all resize-none',
              'border border-transparent focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.15)]',
              'min-h-[48px] max-h-[120px]',
            )}
            style={{ height: '48px' }}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0',
            text.trim() && !disabled
              ? 'bg-accent-blue text-white hover:brightness-110 hover:scale-105'
              : 'bg-bg-surface-highlight text-text-muted',
          )}
        >
          <Send size={18} />
        </button>

        <button className="w-10 h-10 rounded-full bg-bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors flex-shrink-0">
          <Mic size={18} />
        </button>
      </div>

      {/* Quick chips */}
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {QUICK_CHIPS.map((chip, i) => (
          <motion.button
            key={chip}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.03, duration: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (chip === 'Fai un briefing') {
                onSend('Fai un briefing')
              } else {
                setText(chip)
                inputRef.current?.focus()
              }
            }}
            className="px-3 py-1.5 rounded-full bg-bg-surface-elevated text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-highlight transition-colors whitespace-nowrap"
          >
            {chip}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, scrollToBottom])

  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadData().then(() => setReady(true)).catch(() => setReady(true))
  }, [])

  const handleSendMessage = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsTyping(true)

      // Simulate AI thinking delay
      setTimeout(() => {
        try {
          const response = getAnalyticalResponse(text)
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: response.content,
            timestamp: Date.now(),
            dataComponent: response.dataComponent,
          }
          setIsTyping(false)
          setMessages((prev) => [...prev, aiMsg])
        } catch (err) {
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: err instanceof Error ? err.message : 'Errore nel caricamento dei dati. Riprova.',
            timestamp: Date.now(),
          }
          setIsTyping(false)
          setMessages((prev) => [...prev, aiMsg])
        }
      }, 1200)
    },
    [],
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
  }, [])

  return (
    <div className="h-[calc(100dvh-64px)] flex flex-col">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: easeDefault }}
        className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-border-subtle"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.01em]">
            <span className="text-text-primary">Assistente </span>
            <span className="text-accent-purple">Analitico</span>
          </h2>
          <span className="text-[15px] text-text-secondary hidden sm:inline">Motore analitico locale DAZN Bet</span>
          <span className="ml-2 px-2.5 py-0.5 rounded-full bg-bg-surface-elevated border border-border-subtle text-[11px] text-text-muted font-medium">
            Motore analitico locale
          </span>
        </div>
        {messages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClearChat}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-elevated transition-colors"
          >
            <X size={14} />
            Cancella chat
          </motion.button>
        )}
      </motion.div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Suggested Questions Sidebar */}
        <SuggestedQuestionsSidebar onQuestionClick={handleSendMessage} />

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg-base">
          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto px-6 py-6"
          >
            {messages.length === 0 ? (
              <WelcomeMessage />
            ) : (
              <AnimatePresence mode="popLayout">
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, delay: index * 0.05, ease: easeDefault }}
                  >
                    <MessageBubble message={msg} />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>
          </div>

          {/* Input bar */}
          <ChatInputBar onSend={handleSendMessage} disabled={isTyping} />
        </div>
      </div>
    </div>
  )
}
