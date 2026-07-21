import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Info,
  ChevronRight,
  Calendar,
  BarChart3,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import MonthSelector from '@/components/upload/MonthSelector'
import {
  loadExecutiveBriefingData,
  inferLatestMonth,
  resolveExecutiveMonth,
  type ExecutiveBriefingResult,
} from '@/lib/executiveBriefingData'
import {
  formatAnalysisMonth,
  normalizeAnalysisMonth,
} from '@/lib/analysisMonth'
import { formatCurrency } from '@/lib/data'
import { cn } from '@/lib/utils'
import type { ExecutiveInsight, ExecutivePriority, DataAvailability } from '@/lib/executiveBriefing'

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertTriangle className="w-5 h-5 text-red-400" />
    case 'warning':
      return <TrendingDown className="w-5 h-5 text-amber-400" />
    case 'info':
    default:
      return <TrendingUp className="w-5 h-5 text-emerald-400" />
  }
}

function severityClass(severity: string) {
  switch (severity) {
    case 'critical':
      return 'border-l-red-400 bg-red-400/5'
    case 'warning':
      return 'border-l-amber-400 bg-amber-400/5'
    case 'info':
    default:
      return 'border-l-emerald-400 bg-emerald-400/5'
  }
}

function confidenceBadge(confidence: string) {
  const variants: Record<string, string> = {
    high: 'bg-emerald-500/10 text-emerald-400',
    medium: 'bg-amber-500/10 text-amber-400',
    low: 'bg-red-500/10 text-red-400',
  }
  return (
    <Badge variant="secondary" className={variants[confidence] || variants.medium}>
      {confidence === 'high' ? 'Alta' : confidence === 'medium' ? 'Media' : 'Bassa'}
    </Badge>
  )
}

function DataAvailabilityPanel({ availability }: { availability: DataAvailability }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-blue" />
          Stato dei dati
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Periodo selezionato</span>
          <span className="font-medium text-text-primary">{formatAnalysisMonth(availability.currentMonth)}</span>
        </div>
        {availability.previousMonth && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Confronto</span>
            <span className="font-medium text-text-primary">{formatAnalysisMonth(availability.previousMonth)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Giorni presenti</span>
          <span className="font-medium text-text-primary">
            {availability.currentDaysPresent} / {availability.currentExpectedDays}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Copertura</span>
          <span className="font-medium text-text-primary">
            {(availability.currentCoveragePct * 100).toFixed(0)} %
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Rake rete</span>
          <span className="font-medium text-text-primary">{formatCurrency(availability.networkRake)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Somma Rake PVR</span>
          <span className="font-medium text-text-primary">{formatCurrency(availability.pvrRakeSum)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Scostamento rete/PVR</span>
          <span className="font-medium text-text-primary">
            {(availability.reconciliationDiffPct * 100).toFixed(1)} %
          </span>
        </div>
        {availability.lastUploadDate && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Ultimo upload</span>
            <span className="font-medium text-text-primary">
              {new Date(availability.lastUploadDate).toLocaleDateString('it-IT')}
            </span>
          </div>
        )}
        {availability.notes.length > 0 && (
          <ul className="text-xs text-text-secondary space-y-1 pt-2 border-t border-border-subtle">
            {availability.notes.map((note, i) => (
              <li key={i}>• {note}</li>
            ))}
          </ul>
        )}
        <div className="pt-2">{confidenceBadge(availability.confidence)}</div>
      </CardContent>
    </Card>
  )
}

function InsightCard({
  insight,
  index,
  onClick,
}: {
  insight: ExecutiveInsight
  index: number
  onClick?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'rounded-xl border border-border-subtle p-4 cursor-pointer transition-colors hover:bg-bg-surface-elevated/30',
        'border-l-4',
        severityClass(insight.severity),
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{severityIcon(insight.severity)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-text-muted">#{index + 1}</span>
            {insight.entity === 'pvr' && insight.entityName && (
              <Badge variant="secondary" className="text-[10px]">
                {insight.entityName}
              </Badge>
            )}
            {confidenceBadge(insight.confidence)}
          </div>
          <h3 className="text-base font-semibold text-text-primary mt-1 leading-snug">
            {insight.title}
          </h3>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{insight.summary}</p>

          {insight.evidences.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {insight.evidences.map((ev, i) => (
                <div key={i} className="bg-bg-surface rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="text-text-muted block">{ev.label}</span>
                  <span className="font-mono font-semibold text-text-primary">
                    {ev.unit === 'eur'
                      ? formatCurrency(ev.value)
                      : ev.unit === 'pct'
                        ? `${ev.value.toFixed(1).replace('.', ',')} %`
                        : ev.value.toLocaleString('it-IT')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-text-secondary">
              Impatto:{' '}
              <span className="font-medium text-text-primary">
                {formatCurrency(insight.economicImpact)}
              </span>
            </span>
            {insight.drilldownUrl && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onClick?.() }}>
                Dettaglio <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function PriorityCard({ priority, index }: { priority: ExecutivePriority; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.2 + index * 0.08 }}
      className="rounded-xl border border-border-subtle bg-bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-accent-blue/10 text-accent-blue flex items-center justify-center text-xs font-bold">
          {priority.rank}
        </div>
        <span className="text-sm font-semibold text-text-primary truncate">
          {priority.entityName || (priority.entity === 'network' ? 'Rete' : 'PVR')}
        </span>
        {confidenceBadge(priority.confidence)}
      </div>
      <p className="text-sm text-text-secondary mt-2 leading-relaxed">{priority.reason}</p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-text-muted">Impatto: {formatCurrency(priority.impactEur)}</span>
        <span className="text-xs text-text-secondary italic">{priority.action}</span>
      </div>
    </motion.div>
  )
}

export default function ExecutiveBriefingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [month, setMonth] = useState<string>(() => {
    const urlMonth = searchParams.get('month')
    if (urlMonth) {
      try {
        return normalizeAnalysisMonth(urlMonth)
      } catch {
        return resolveExecutiveMonth()
      }
    }
    return resolveExecutiveMonth()
  })
  const [data, setData] = useState<ExecutiveBriefingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const effective = month || (await inferLatestMonth())
        if (!month) {
          setMonth(effective)
        }
        const briefing = await loadExecutiveBriefingData(effective)
        setData(briefing)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Errore caricamento dati')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [month])

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth)
    localStorage.setItem('analysisMonth', newMonth)
    setSearchParams({ month: newMonth }, { replace: true })
  }

  const handleInsightClick = (insight: ExecutiveInsight) => {
    if (insight.entity === 'pvr' && insight.entityId) {
      navigate(`/pvr/${insight.entityId}?month=${insight.month}`, { state: { insight } })
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Executive Briefing</h1>
          <p className="text-text-secondary mt-1">Le cose più importanti da sapere oggi</p>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-text-muted" />
          <MonthSelector selectedMonth={month} onMonthChange={handleMonthChange} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 text-red-400 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-64 w-full lg:col-span-2" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Executive Summary */}
          {data.summary.length > 0 && (
            <Card className="border-l-4 border-l-accent-blue">
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-accent-blue" />
                  Executive Summary
                </h2>
                <ul className="space-y-1">
                  {data.summary.map((sentence, i) => (
                    <li key={i} className="text-text-secondary text-sm leading-relaxed">
                      • {sentence}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Insights column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                  Le {Math.min(10, data.insights.length)} cose da sapere
                </h2>
                <span className="text-xs text-text-muted">
                  {data.insights.length} insight generati
                </span>
              </div>

              {data.insights.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-bg-surface p-8 text-center text-text-secondary">
                  <Info className="w-8 h-8 mx-auto mb-2 text-text-muted" />
                  <p>Nessun fenomeno significativo rilevato per {formatAnalysisMonth(data.month)}.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.insights.map((insight, i) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      index={i}
                      onClick={() => handleInsightClick(insight)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar: priorities + data status */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">Priorità operative</h2>
              {data.priorities.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 text-sm text-text-secondary">
                  Nessuna priorità operativa identificata.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.priorities.map((p, i) => (
                    <PriorityCard key={p.rank} priority={p} index={i} />
                  ))}
                </div>
              )}

              <DataAvailabilityPanel availability={data.availability} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
