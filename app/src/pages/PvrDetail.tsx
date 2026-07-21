import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Store, TrendingDown, TrendingUp, Minus, Activity, AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  loadExecutiveBriefingData,
  inferLatestMonth,
  type ExecutiveBriefingResult,
} from '@/lib/executiveBriefingData'
import { formatAnalysisMonth, normalizeAnalysisMonth } from '@/lib/analysisMonth'
import { formatCurrency, formatPercent } from '@/lib/data'
import { cn } from '@/lib/utils'
import type { ExecutiveInsight } from '@/lib/executiveBriefing'

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="mb-2 -ml-2">
      <ArrowLeft className="w-4 h-4 mr-1" /> Torna al briefing
    </Button>
  )
}

export default function PvrDetailPage() {
  const { pvrId } = useParams<{ pvrId: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const stateInsight = (location.state as { insight?: ExecutiveInsight } | undefined)?.insight

  const month = useMemo(() => {
    const urlMonth = searchParams.get('month')
    if (urlMonth) {
      try {
        return normalizeAnalysisMonth(urlMonth)
      } catch {
        return null
      }
    }
    const stored = localStorage.getItem('analysisMonth')
    if (stored) {
      try {
        return normalizeAnalysisMonth(stored)
      } catch {
        return null
      }
    }
    return null
  }, [searchParams])

  const [data, setData] = useState<ExecutiveBriefingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      if (!pvrId) return
      setLoading(true)
      setError(null)
      try {
        const effectiveMonth = month || (await inferLatestMonth())
        const briefing = await loadExecutiveBriefingData(effectiveMonth)
        setData(briefing)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Errore caricamento dati')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [pvrId, month])

  const contribution = useMemo(() => {
    return data?.pvrContributions.find((c) => c.pvrId === pvrId) || null
  }, [data, pvrId])

  const pvrInfo = useMemo(() => {
    const current = data?.pvrsCurrent.find((p) => p.pvrId === pvrId)
    if (current) {
      return {
        name: current.pvrName,
        exalogicId: current.pvrExalogicId,
      }
    }
    const previous = data?.pvrsPrevious.find((p) => p.pvrId === pvrId)
    if (previous) {
      return {
        name: previous.pvrName,
        exalogicId: previous.pvrExalogicId,
      }
    }
    return null
  }, [data, pvrId])

  const relatedInsights = useMemo(() => {
    return data?.insights.filter((i) => i.entity === 'pvr' && i.entityId === pvrId) || []
  }, [data, pvrId])

  const whyHere = useMemo(() => {
    if (stateInsight) return stateInsight
    if (relatedInsights.length > 0) return relatedInsights[0]
    return null
  }, [stateInsight, relatedInsights])

  if (!pvrId) {
    return (
      <div className="p-6 text-text-secondary">PVR non specificato.</div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <BackButton onClick={() => navigate(`/?month=${data?.month || month || ''}`)} />

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 text-red-400 px-4 py-3 text-sm">{error}</div>
      )}

      {!loading && !error && (!contribution || !pvrInfo) && (
        <div className="rounded-lg bg-amber-500/10 text-amber-400 px-4 py-3 text-sm">
          PVR non trovato nei dati del mese selezionato.
        </div>
      )}

      {!loading && !error && contribution && pvrInfo && data && (
        <>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent-blue/10 flex items-center justify-center">
                <Store className="w-6 h-6 text-accent-blue" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">{pvrInfo.name}</h1>
                <p className="text-text-secondary text-sm">
                  Codice PVR: {pvrInfo.exalogicId || '—'} · Mese: {formatAnalysisMonth(data.month)}
                </p>
              </div>
            </div>
            {whyHere && (
              <Badge
                variant="secondary"
                className={cn(
                  whyHere.severity === 'critical' && 'bg-red-500/10 text-red-400',
                  whyHere.severity === 'warning' && 'bg-amber-500/10 text-amber-400',
                  whyHere.severity === 'info' && 'bg-emerald-500/10 text-emerald-400',
                )}
              >
                {whyHere.severity === 'critical' ? 'Critico' : whyHere.severity === 'warning' ? 'Attenzione' : 'Info'}
              </Badge>
            )}
          </motion.div>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Rake corrente"
              value={formatCurrency(contribution.currentRake)}
              delta={contribution.deltaPct}
              deltaAbs={contribution.deltaRake}
            />
            <MetricCard
              label="Rake precedente"
              value={formatCurrency(contribution.previousRake)}
            />
            <MetricCard label="Bet corrente" value={formatCurrency(data.pvrsCurrent.find((p) => p.pvrId === pvrId)?.bet || 0)} />
            <MetricCard label="Won corrente" value={formatCurrency(data.pvrsCurrent.find((p) => p.pvrId === pvrId)?.won || 0)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent-blue" />
                  Contributo al fenomeno
                </CardTitle>
                <CardDescription>Quota di rete e impatto sul calo PVR</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Quota sul Rake di rete</span>
                  <span className="font-medium text-text-primary">
                    {(contribution.networkSharePct * 100).toFixed(1)} %
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Contributo al calo PVR</span>
                  <span className="font-medium text-text-primary">
                    {contribution.shareOfGrossDecline
                      ? `${(contribution.shareOfGrossDecline * 100).toFixed(1)} %`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Impatto negativo</span>
                  <span className="font-medium text-text-primary">
                    {formatCurrency(contribution.negativeImpact)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Giorni con Rake negativo</span>
                  <span className="font-medium text-text-primary">
                    {data.pvrsCurrent.find((p) => p.pvrId === pvrId)?.negativeRakeDays || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Payout ponderato</span>
                  <span className="font-medium text-text-primary">
                    {(data.pvrsCurrent.find((p) => p.pvrId === pvrId)?.payout || 0).toFixed(1).replace('.', ',')} %
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Why here */}
            <Card className={cn(
              'border-l-4',
              whyHere?.severity === 'critical' ? 'border-l-red-400' : whyHere?.severity === 'warning' ? 'border-l-amber-400' : 'border-l-emerald-400',
            )}>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  {whyHere?.severity === 'critical' ? (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  ) : whyHere?.severity === 'warning' ? (
                    <TrendingDown className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Info className="w-4 h-4 text-emerald-400" />
                  )}
                  Perché questo PVR è nel briefing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {whyHere ? (
                  <>
                    <p className="text-text-primary font-medium">{whyHere.title}</p>
                    <p className="text-sm text-text-secondary leading-relaxed">{whyHere.summary}</p>
                    {whyHere.evidences.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {whyHere.evidences.map((ev, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {ev.label}: {ev.unit === 'eur' ? formatCurrency(ev.value) : `${ev.value.toFixed(1).replace('.', ',')} %`}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-text-secondary pt-2">
                      Azione suggerita: {whyHere.suggestedAction}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">
                    Questo PVR non ha generato insight significativi per {formatAnalysisMonth(data.month)}.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  delta,
  deltaAbs,
}: {
  label: string
  value: string
  delta?: number | null
  deltaAbs?: number
}) {
  const isPositive = delta !== null && delta !== undefined && delta > 0
  const isNegative = delta !== null && delta !== undefined && delta < 0
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-xl font-semibold text-text-primary mt-1">{value}</p>
        {delta !== null && delta !== undefined && (
          <div className={cn('flex items-center gap-1 text-xs mt-1', isNegative ? 'text-red-400' : isPositive ? 'text-emerald-400' : 'text-text-muted')}>
            {isNegative ? <TrendingDown className="w-3 h-3" /> : isPositive ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            <span>{formatPercent(delta * 100)}</span>
            {deltaAbs !== undefined && <span className="text-text-muted">({formatCurrency(Math.abs(deltaAbs))})</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
