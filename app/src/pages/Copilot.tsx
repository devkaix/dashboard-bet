import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Send,
  Lightbulb,
  TrendingUp,
  Trophy,
  Network,
  AlertTriangle,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Info,
  Database,
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { answerQuestion, gatherCommercialFacts, type QuickComponent, type Reference } from '@/lib/quickAnalysis'
import MonthSelector from '@/components/upload/MonthSelector'
import { analysisMonthToRange, normalizeAnalysisMonth } from '@/lib/analysisMonth'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatCurrency,
  getRankings,
  getAlerts,
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
  dataComponent?: QuickComponent
  reasoning?: string[]
  references?: Reference[]
  followUps?: string[]
}

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
    key: 'rake',
    label: 'Rake',
    icon: TrendingUp,
    color: '#06b6d4',
    questions: [
      'Quanto rake c\'è stato questo mese?',
      'Qual è il trend del rake?',
      'Confronta questo mese con il precedente',
    ],
  },
  {
    key: 'ranking',
    label: 'Ranking',
    icon: Trophy,
    color: '#f59e0b',
    questions: [
      'Chi sono i 5 giocatori top?',
      'Chi sono i peggiori?',
      'Quali sono i 5 PVR migliori?',
    ],
  },
  {
    key: 'business',
    label: 'Business',
    icon: Network,
    color: '#3b82f6',
    questions: [
      'Quanti giocatori ho perso e quanti sono nuovi?',
      'Dove si guadagna di più per categoria?',
    ],
  },
  {
    key: 'anomalies',
    label: 'Anomalie',
    icon: AlertTriangle,
    color: '#ef4444',
    questions: [
      'Ci sono giorni con rake negativo?',
      'Ci sono anomalie questo mese?',
    ],
  },
]

const QUICK_CHIPS = [
  'Quanto rake c\'è stato questo mese?',
  'Chi sono i 5 giocatori top?',
  'Chi sono i peggiori?',
  'Quanti giocatori ho perso?',
  'Dove si guadagna di più?',
  'Ci sono giorni con rake negativo?',
  'Confronta con il mese precedente',
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
    const kpis = dataStore.daily_kpis
    if (kpis.length > 0) {
      const latest = kpis[kpis.length - 1].date
      return capitalizeMonthLabel(format(new Date(latest), 'MMMM yyyy', { locale: it }))
    }
  } catch {
    // fall through
  }
  return 'periodo corrente'
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
        <Search size={14} className="text-white" />
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

function DataComponentRenderer({ dc }: { dc: QuickComponent }) {
  switch (dc.type) {
    case 'kpi':
      return <MiniKPICard value={dc.value} delta={dc.delta} label={dc.label} vsLabel={dc.vsLabel} />
    case 'table':
      return <MiniTable headers={dc.headers} rows={dc.rows} />
    case 'trend':
      return <MiniTrendChart data={dc.data} />
    case 'alert':
      return <AlertCards severity={dc.severity} count={dc.count} message={dc.message} />
    default:
      return null
  }
}

/* ─── Markdown renderer ─── */

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} className="font-mono text-[13px] bg-bg-surface-elevated px-1 py-0.5 rounded">{p.slice(1, -1)}</code>
    }
    return <span key={i}>{p}</span>
  })
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let key = 0

  const flushList = () => {
    if (list && list.items.length > 0) {
      const items = list.items
      blocks.push(
        list.ordered
          ? <ol key={key++} className="list-decimal list-inside space-y-1">{items.map((it, i) => <li key={i} className="text-[14px] text-text-primary">{inlineMarkdown(it)}</li>)}</ol>
          : <ul key={key++} className="list-disc list-inside space-y-1">{items.map((it, i) => <li key={i} className="text-[14px] text-text-primary">{inlineMarkdown(it)}</li>)}</ul>,
      )
    }
    list = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushList(); continue }
    if (line.startsWith('### ')) { flushList(); blocks.push(<h4 key={key++} className="text-[14px] font-semibold text-text-primary mt-2 mb-1">{inlineMarkdown(line.slice(4))}</h4>); continue }
    if (line.startsWith('## ')) { flushList(); blocks.push(<h3 key={key++} className="text-[15px] font-semibold text-text-primary mt-2 mb-1">{inlineMarkdown(line.slice(3))}</h3>); continue }
    if (line.startsWith('# ')) { flushList(); blocks.push(<h3 key={key++} className="text-[16px] font-semibold text-text-primary mt-2 mb-1">{inlineMarkdown(line.slice(2))}</h3>); continue }
    if (/^[-*] /.test(line)) { if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } } list.items.push(line.slice(2)); continue }
    if (/^\d+\. /.test(line)) { if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } } list.items.push(line.replace(/^\d+\. /, '')); continue }
    flushList()
    blocks.push(<p key={key++} className="text-[14px] leading-relaxed text-text-primary">{inlineMarkdown(line)}</p>)
  }
  flushList()

  return <div className="space-y-1.5">{blocks}</div>
}

/* ─── Reasoning / References Modal ─── */

const REFERENCE_LABELS: Record<string, string> = {
  daily_network_stats: 'Giocato totale della rete',
  daily_player_stats: 'Giocato per giocatore',
  daily_pvr_stats: 'Giocato per punto vendita',
  pvrs: 'Anagrafica punti vendita',
  players: 'Anagrafica giocatori',
  category_stats: 'Riepilogo per tipologia di gioco',
  daily_player_game_stats: 'Giocato per giocatore e gioco',
  game_types: 'Catalogo giochi',
  tickets: 'Ticket scommesse',
}

const REFERENCE_DETAIL: Record<string, string> = {
  daily_network_stats: 'Totali giornalieri di ricavi, giocato e vinto dell\u2019intera rete.',
  daily_player_stats: 'Giocate e ricavi aggregati per ciascun giocatore.',
  daily_pvr_stats: 'Giocate e ricavi aggregati per ciascun punto vendita.',
  pvrs: 'Anagrafica e dati commerciali dei punti vendita.',
  players: 'Anagrafica dei giocatori.',
  category_stats: 'Ricavi suddivisi per tipologia di gioco (sport, casino, virtuali\u2026).',
  daily_player_game_stats: 'Giocate suddivise per gioco e provider.',
}

function ReasoningModal({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border-subtle bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-[16px] font-semibold text-text-primary">Perché e riferimenti</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:bg-bg-surface-elevated hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-muted mb-2">Perché questa risposta</h4>
            {message.reasoning && message.reasoning.length > 0 ? (
              <ol className="space-y-2">
                {message.reasoning.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-text-primary">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-purple/15 text-accent-purple text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-text-muted">Nessun dettaglio di ragionamento disponibile.</p>
            )}
          </section>
          <section>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-muted mb-2">Da dove arrivano i dati</h4>
            {message.references && message.references.length > 0 ? (
              <div className="space-y-2">
                {message.references.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border-subtle bg-bg-surface-elevated px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-accent-blue flex-shrink-0" />
                      <span className="text-[13px] font-medium text-text-primary">{REFERENCE_LABELS[r.table] || r.table}</span>
                      <span className="text-[11px] text-text-muted ml-auto whitespace-nowrap">{r.period}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-text-secondary">{REFERENCE_DETAIL[r.table] || 'Dati reali estratti dal gestionale.'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-text-muted">Nessun riferimento disponibile.</p>
            )}
          </section>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─── Message Bubble ─── */

function MessageBubble({
  message,
  onShowReasoning,
  onFollowUp,
}: {
  message: ChatMessage
  onShowReasoning?: (m: ChatMessage) => void
  onFollowUp?: (text: string) => void
}) {
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
          <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-accent-blue text-white text-[14px] leading-relaxed whitespace-pre-wrap">
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
          <Search size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="relative px-4 py-3 rounded-2xl rounded-tl-sm border border-[rgba(139,92,246,0.15)]"
            style={{
              background: 'rgb(var(--app-bg-surface) / 0.7)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <MarkdownText content={message.content} />
            {message.dataComponent && (
              <div className="pl-2 mt-2">
                <DataComponentRenderer dc={message.dataComponent} />
              </div>
            )}
            {(message.reasoning?.length || message.references?.length) && (
              <button
                onClick={() => onShowReasoning?.(message)}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-surface-elevated border border-border-subtle text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-highlight transition-colors"
              >
                <Info size={13} />
                Perché e riferimenti
              </button>
            )}
          </div>
          {message.followUps && message.followUps.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 ml-2">
              {message.followUps.map((f, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUp?.(f)}
                  className="px-3 py-1.5 rounded-full bg-bg-surface-elevated border border-border-subtle text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-highlight transition-colors"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
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
        <div className="w-10 h-10 rounded-full bg-accent-purple flex items-center justify-center flex-shrink-0">
          <Search size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="relative px-5 py-4 rounded-2xl rounded-tl-sm border border-[rgba(139,92,246,0.15)]"
            style={{
              background: 'rgb(var(--app-bg-surface) / 0.7)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <p className="text-[15px] leading-relaxed text-text-primary font-medium">
              Ciao! Analisi veloce dei dati della rete.
            </p>
            <p className="text-[13px] leading-relaxed text-text-secondary mt-2">
              Digita termini come &quot;rake&quot;, &quot;players&quot;, &quot;PVR&quot;, &quot;alert&quot; per ottenere analisi e consigli strategici rapidi.
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
              setText(chip)
              inputRef.current?.focus()
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

/* ─── Suggerimenti Commerciali (OpenAI) ─── */

function parseAdviceBlocks(text: string): { title: string; problema: string; azione: string; priorita: string }[] {
  const blocks = text.split(/^###\s*/m).filter(Boolean)
  return blocks.map((b) => {
    const lines = b.split('\n')
    const title = (lines[0] || 'Suggerimento').trim()
    const problema = (b.match(/\*\*Problema:\*\*\s*(.+)/)?.[1]?.trim()) || ''
    const azione = (b.match(/\*\*Azione consigliata:\*\*\s*(.+)/)?.[1]?.trim()) || ''
    const prioritaRaw = (b.match(/\*\*Priorità:\*\*\s*(.+)/)?.[1]?.trim()) || 'Media'
    const priorita = prioritaRaw.toLowerCase().includes('alta') ? 'Alta' : prioritaRaw.toLowerCase().includes('bassa') ? 'Bassa' : 'Media'
    return { title, problema, azione, priorita }
  })
}

const PRIORITY_STYLE: Record<string, string> = {
  Alta: 'bg-negative/15 text-negative border-negative/30',
  Media: 'bg-warning/15 text-warning border-warning/30',
  Bassa: 'bg-info/15 text-info border-info/30',
}

const ADVICE_CHIPS = [
  'Quali PVR vanno contattati questo mese e perché?',
  'Come recuperare i giocatori che stiamo perdendo?',
  'Quali giocatori sono più a rischio e come trattenerli?',
  'Dove conviene investire in bonus questo mese?',
  'Quali PVR sono un modello da replicare?',
]

interface AdviceMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
}

function AdviceBubble({ message }: { message: AdviceMessage }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-accent-purple text-white px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }
  const blocks = parseAdviceBlocks(message.content)
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-border-subtle bg-bg-surface-elevated px-4 py-3">
        {blocks.length > 0 ? (
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] font-semibold text-text-primary">{b.title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${PRIORITY_STYLE[b.priorita] || PRIORITY_STYLE.Media}`}>
                    {b.priorita}
                  </span>
                </div>
                {b.problema && (
                  <p className="text-[12px] text-text-secondary"><span className="text-text-muted font-medium">Problema:</span> {b.problema}</p>
                )}
                {b.azione && (
                  <p className="text-[12px] text-text-primary mt-1"><span className="text-accent-blue font-medium">Azione consigliata:</span> {b.azione}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{message.content}</p>
        )}
      </div>
    </div>
  )
}

function CommercialAdvicePanel({ month }: { month: string }) {
  const [messages, setMessages] = useState<AdviceMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || loading) return
      const userMsg: AdviceMessage = {
        id: `adv-u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)
      setError(null)
      try {
        const { gatherCommercialFacts } = await import('@/lib/quickAnalysis')
        const facts = await gatherCommercialFacts(month)
        const resp = await fetch('/api/commercial-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facts, question: trimmed, month }),
        })
        const data = (await resp.json()) as { suggestions?: string; error?: string }
        if (!resp.ok || data.error) throw new Error(data.error || `Errore ${resp.status}`)
        const aiMsg: AdviceMessage = {
          id: `adv-a-${Date.now()}`,
          role: 'ai',
          content: data.suggestions || 'Nessuna risposta.',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, aiMsg])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Errore nella generazione della risposta')
      } finally {
        setLoading(false)
      }
    },
    [month, loading],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ask(input)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex-shrink-0 border-b border-border-subtle bg-bg-surface/80"
    >
      <div className="px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-warning" />
            <span className="text-[14px] font-semibold text-text-primary">Suggerimenti Commerciali — {format(new Date(month + '-01'), 'MMMM yyyy', { locale: it })}</span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              disabled={loading}
              className="text-[12px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Svuota
            </button>
          )}
        </div>

        {/* Domande suggerite (un click = domanda + risposta) */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ADVICE_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => ask(chip)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-bg-surface-elevated text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-highlight transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Conversazione (scroll interno, non taglia mai la pagina) */}
        <div ref={scrollRef} className="max-h-[42vh] overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 ? (
            <p className="text-[13px] text-text-secondary leading-relaxed">
              Chiedimi cosa fare questo mese e ti do consigli concreti.
              Es: <span className="text-text-primary">"Quali punti vendita contattare?"</span> oppure <span className="text-text-primary">"Come recuperare i clienti persi?"</span>.
            </p>
          ) : (
            messages.map((m) => <AdviceBubble key={m.id} message={m} />)
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-text-secondary">
              <div className="w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
              Sto analizzando i dati del mese...
            </div>
          )}
        </div>

        {error && <p className="text-[13px] text-negative">⚠ {error}</p>}

        {/* Input domanda aperta */}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Chiedi un consiglio sul mese..."
            disabled={loading}
            className="flex-1 bg-bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus disabled:opacity-50"
          />
          <button
            onClick={() => ask(input)}
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-purple text-white text-[13px] font-medium hover:brightness-110 transition-all disabled:opacity-50"
          >
            <Sparkles size={14} />
            Chiedi
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */

/* ─── Main Page ─── */

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMonth = params.get('month')
    if (urlMonth) {
      try { return normalizeAnalysisMonth(urlMonth) } catch { /* ignore */ }
    }
    const stored = localStorage.getItem('analysisMonth')
    if (stored) {
      try { return normalizeAnalysisMonth(stored) } catch { /* ignore */ }
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [adviceOpen, setAdviceOpen] = useState(false)
  const [modalMessage, setModalMessage] = useState<ChatMessage | null>(null)

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, scrollToBottom])

  // Carica i dati del mese selezionato all'apertura e al cambio mese
  useEffect(() => {
    loadData(analysisMonthToRange(month))
      .catch(() => { /* lascia i dati precedenti */ })
  }, [month])

  const handleMonthChange = useCallback((m: string) => {
    setMonth(m)
    localStorage.setItem('analysisMonth', m)
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

      ;(async () => {
        try {
          const history = messages
            .slice(-10)
            .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }))

          let aiMsg: ChatMessage
          try {
            const facts = await gatherCommercialFacts(month)
            const resp = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question: text, history, month, facts }),
            })
            const data = (await resp.json()) as {
              content?: string
              error?: string
              reasoning?: string[]
              references?: Reference[]
              followUps?: string[]
            }
            if (!resp.ok || data.error) throw new Error(data.error || `Errore ${resp.status}`)
            aiMsg = {
              id: `ai-${Date.now()}`,
              role: 'ai',
              content: data.content || 'Nessuna risposta.',
              timestamp: Date.now(),
              reasoning: data.reasoning,
              references: data.references,
              followUps: data.followUps,
            }
          } catch {
            // Fallback al motore locale deterministico (senza LLM)
            const answer = await answerQuestion(text, month)
            aiMsg = {
              id: `ai-${Date.now()}`,
              role: 'ai',
              content: answer.content,
              timestamp: Date.now(),
              dataComponent: answer.component,
              reasoning: answer.reasoning,
              references: answer.references,
            }
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
      })()
    },
    [month, messages],
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
            <span className="text-text-primary">Analisi Veloce </span>
            <span className="text-accent-purple">e Consigli Strategici</span>
          </h2>
          <span className="text-[15px] text-text-secondary hidden sm:inline">Analisi rapida dei dati della rete</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAdviceOpen(!adviceOpen)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all',
              adviceOpen ? 'bg-accent-purple text-white' : 'bg-bg-surface-elevated text-text-primary hover:bg-bg-surface-highlight border border-border-default',
            )}
          >
            <Sparkles size={14} />
            Suggerimenti Commerciali
          </button>
          <MonthSelector selectedMonth={month} onMonthChange={handleMonthChange} />
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
        </div>
      </motion.div>

      <AnimatePresence>{adviceOpen && <CommercialAdvicePanel month={month} />}</AnimatePresence>

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
                    <MessageBubble
                      message={msg}
                      onShowReasoning={setModalMessage}
                      onFollowUp={handleSendMessage}
                    />
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

      <AnimatePresence>
        {modalMessage && <ReasoningModal message={modalMessage} onClose={() => setModalMessage(null)} />}
      </AnimatePresence>
    </div>
  )
}
