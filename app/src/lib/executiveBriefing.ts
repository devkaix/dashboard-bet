// ── Executive Briefing engine ──────────────────────────────────────────────
// Pure logic: no React, no Supabase. Inputs are plain aggregates.

import type {
  ExecutiveBriefingConfig,
  ExecutiveConfidence,
  ExecutiveSeverity,
} from './executiveBriefingConfig'
import {
  DEFAULT_EXECUTIVE_BRIEFING_CONFIG,
  isForbiddenAction,
} from './executiveBriefingConfig'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExecutiveEvidence {
  date?: string
  label: string
  value: number
  unit: 'eur' | 'pct' | 'days' | 'count'
}

export interface ExecutiveInsight {
  id: string
  category:
    | 'network_performance'
    | 'pvr_growth'
    | 'pvr_decline'
    | 'pvr_inactivity'
    | 'decline_concentration'
    | 'negative_rake'
    | 'payout_change'
    | 'data_quality'
  severity: ExecutiveSeverity
  priorityScore: number
  title: string
  summary: string
  month: string
  comparisonMonth: string | null
  entity: 'network' | 'pvr'
  entityId: string | null
  entityName: string | null
  currentValue: number
  previousValue: number | null
  deltaAbs: number
  deltaPct: number | null
  economicImpact: number
  confidence: ExecutiveConfidence
  evidences: ExecutiveEvidence[]
  suggestedAction: string
  drilldownUrl: string | null
}

export interface ExecutivePriority {
  rank: number
  entity: 'network' | 'pvr'
  entityId: string | null
  entityName: string | null
  reason: string
  impactEur: number
  confidence: ExecutiveConfidence
  sourceInsightIds: string[]
  action: string
  drilldownUrl: string | null
}

export interface DataAvailability {
  currentMonth: string
  previousMonth: string | null
  currentCoveragePct: number
  previousCoveragePct: number
  currentDaysPresent: number
  previousDaysPresent: number
  currentExpectedDays: number
  previousExpectedDays: number
  comparisonAvailable: boolean
  lastUploadDate: string | null
  networkRake: number
  pvrRakeSum: number
  reconciliationDiffPct: number
  confidence: ExecutiveConfidence
  notes: string[]
}

export interface PvrContribution {
  pvrId: string
  pvrName: string
  pvrExalogicId: string | null
  currentRake: number
  previousRake: number
  deltaRake: number
  deltaPct: number | null
  networkSharePct: number
  negativeImpact: number
  positiveOffset: number
  shareOfGrossDecline: number | null
  shareOfNetDecline: number | null
  isInactive: boolean
  hasZeroRake: boolean
}

export interface NetworkPeriod {
  month: string
  start: string
  end: string
  rake: number
  bet: number
  won: number
  refund: number
  payout: number
  days: number
  negativeRakeDays: number
  worstDay: { date: string; rake: number } | null
  dailyRake: { date: string; value: number }[]
}

export interface PvrPeriod {
  pvrId: string
  pvrName: string
  pvrExalogicId: string | null
  rake: number
  bet: number
  won: number
  refund: number
  payout: number
  days: number
  negativeRakeDays: number
}

export interface ExecutiveBriefingInput {
  currentMonth: string
  previousMonth: string | null
  networkCurrent: NetworkPeriod
  networkPrevious: NetworkPeriod | null
  pvrsCurrent: PvrPeriod[]
  pvrsPrevious: PvrPeriod[]
  lastUploadDate: string | null
  config?: ExecutiveBriefingConfig
}

export interface ExecutiveBriefingResult {
  month: string
  previousMonth: string | null
  summary: string[]
  insights: ExecutiveInsight[]
  priorities: ExecutivePriority[]
  availability: DataAvailability
  networkCurrent: NetworkPeriod
  networkPrevious: NetworkPeriod | null
  pvrsCurrent: PvrPeriod[]
  pvrsPrevious: PvrPeriod[]
  pvrContributions: PvrContribution[]
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function expectedDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return daysInMonth(y, m)
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0 || previous === null || previous === undefined) return null
  return (current - previous) / Math.abs(previous)
}

function formatPct(pct: number | null): string {
  if (pct === null) return 'n.d.'
  return `${(pct * 100).toFixed(1).replace('.', ',')} %`
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function severityForDecline(
  deltaPct: number | null,
  impactEur: number,
  config: ExecutiveBriefingConfig,
): ExecutiveSeverity {
  if (deltaPct === null) return 'info'
  const pct = Math.abs(deltaPct)
  if (pct >= config.severityThresholds.critical.minDeclinePct && impactEur >= config.severityThresholds.critical.minImpactEur) {
    return 'critical'
  }
  if (pct >= config.severityThresholds.warning.minDeclinePct && impactEur >= config.severityThresholds.warning.minImpactEur) {
    return 'warning'
  }
  return 'info'
}

function severityForGrowth(
  deltaPct: number | null,
  impactEur: number,
  config: ExecutiveBriefingConfig,
): ExecutiveSeverity {
  if (deltaPct === null) return 'info'
  const pct = Math.abs(deltaPct)
  if (pct >= config.severityThresholds.critical.minDeclinePct && impactEur >= config.severityThresholds.critical.minImpactEur) {
    return 'info' // growth is never critical
  }
  if (pct >= config.severityThresholds.warning.minDeclinePct && impactEur >= config.severityThresholds.warning.minImpactEur) {
    return 'info'
  }
  return 'info'
}

function clampPriorityScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function priorityScoreFor(
  severity: ExecutiveSeverity,
  impactEur: number,
  confidence: ExecutiveConfidence,
): number {
  let base = severity === 'critical' ? 80 : severity === 'warning' ? 50 : 20
  base += Math.min(30, Math.log10(Math.max(1, impactEur + 1)) * 5)
  const confidenceMultiplier = confidence === 'high' ? 1 : confidence === 'medium' ? 0.85 : 0.6
  return clampPriorityScore(base * confidenceMultiplier)
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = [
    '', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ]
  return `${names[m]} ${y}`
}

// ─── Aggregation ───────────────────────────────────────────────────────────

export function aggregateNetworkPeriod(
  month: string,
  start: string,
  end: string,
  rows: Array<{ date: string; rake: number; bet: number; won: number; refund?: number }>,
): NetworkPeriod {
  let rake = 0
  let bet = 0
  let won = 0
  let refund = 0
  let negativeRakeDays = 0
  let worstDay: { date: string; rake: number } | null = null
  const dailyRake: { date: string; value: number }[] = []

  for (const row of rows) {
    const r = toNumber(row.rake)
    const b = toNumber(row.bet)
    const w = toNumber(row.won)
    const ref = toNumber(row.refund)
    rake += r
    bet += b
    won += w
    refund += ref
    dailyRake.push({ date: row.date, value: r })
    if (r < 0) {
      negativeRakeDays++
    }
    if (!worstDay || r < worstDay.rake) {
      worstDay = { date: row.date, rake: r }
    }
  }

  return {
    month,
    start,
    end,
    rake,
    bet,
    won,
    refund,
    payout: bet > 0 ? (won / bet) * 100 : 0,
    days: rows.length,
    negativeRakeDays,
    worstDay,
    dailyRake,
  }
}

export function aggregatePvrPeriods(
  rows: Array<{
    pvr_id: string
    pvrs: { name: string; exalogic_id?: string | null } | null
    date: string
    rake: number
    bet: number
    won: number
    refund?: number
  }>,
): PvrPeriod[] {
  const map = new Map<
    string,
    {
      name: string
      exalogicId: string | null
      rake: number
      bet: number
      won: number
      refund: number
      days: Set<string>
      negativeRakeDays: number
    }
  >()

  for (const row of rows) {
    const id = row.pvr_id
    if (!map.has(id)) {
      map.set(id, {
        name: row.pvrs?.name || id,
        exalogicId: row.pvrs?.exalogic_id || null,
        rake: 0,
        bet: 0,
        won: 0,
        refund: 0,
        days: new Set(),
        negativeRakeDays: 0,
      })
    }
    const p = map.get(id)!
    const r = toNumber(row.rake)
    p.rake += r
    p.bet += toNumber(row.bet)
    p.won += toNumber(row.won)
    p.refund += toNumber(row.refund)
    p.days.add(row.date)
    if (r < 0) p.negativeRakeDays++
  }

  return Array.from(map.entries()).map(([pvrId, p]) => ({
    pvrId,
    pvrName: p.name,
    pvrExalogicId: p.exalogicId,
    rake: p.rake,
    bet: p.bet,
    won: p.won,
    refund: p.refund,
    payout: p.bet > 0 ? (p.won / p.bet) * 100 : 0,
    days: p.days.size,
    negativeRakeDays: p.negativeRakeDays,
  }))
}

// ─── Contribution engine ───────────────────────────────────────────────────

export function computePvrContributions(
  pvrsCurrent: PvrPeriod[],
  pvrsPrevious: PvrPeriod[],
  networkCurrent: NetworkPeriod,
  networkPrevious: NetworkPeriod | null,
  config: ExecutiveBriefingConfig,
): PvrContribution[] {
  const previousById = new Map(pvrsPrevious.map((p) => [p.pvrId, p]))
  const contributions: PvrContribution[] = []
  let grossNegative = 0

  for (const current of pvrsCurrent) {
    const previous = previousById.get(current.pvrId)
    const previousRake = previous?.rake ?? 0
    const deltaRake = current.rake - previousRake
    const negativeImpact = Math.max(0, previousRake - current.rake)
    const positiveOffset = Math.max(0, current.rake - previousRake)

    if (negativeImpact > 0) grossNegative += negativeImpact

    contributions.push({
      pvrId: current.pvrId,
      pvrName: current.pvrName,
      pvrExalogicId: current.pvrExalogicId,
      currentRake: current.rake,
      previousRake,
      deltaRake,
      deltaPct: pctDelta(current.rake, previousRake),
      networkSharePct: networkCurrent.rake > 0 ? current.rake / networkCurrent.rake : 0,
      negativeImpact,
      positiveOffset,
      shareOfGrossDecline: null,
      shareOfNetDecline: null,
      isInactive: current.rake <= config.pvr.inactivityThresholdEur && current.days > 0,
      hasZeroRake: current.rake === 0,
    })
  }

  // Include PVRs present in previous month but missing in current (fully inactive)
  const currentIds = new Set(pvrsCurrent.map((p) => p.pvrId))
  for (const previous of pvrsPrevious) {
    if (currentIds.has(previous.pvrId)) continue
    const negativeImpact = Math.max(0, previous.rake)
    if (negativeImpact > 0) grossNegative += negativeImpact
    contributions.push({
      pvrId: previous.pvrId,
      pvrName: previous.pvrName,
      pvrExalogicId: previous.pvrExalogicId,
      currentRake: 0,
      previousRake: previous.rake,
      deltaRake: -previous.rake,
      deltaPct: -1,
      networkSharePct: 0,
      negativeImpact,
      positiveOffset: 0,
      shareOfGrossDecline: null,
      shareOfNetDecline: null,
      isInactive: true,
      hasZeroRake: true,
    })
  }

  const netDecline = networkPrevious ? Math.max(0, networkPrevious.rake - networkCurrent.rake) : 0

  for (const c of contributions) {
    if (grossNegative > 0 && c.negativeImpact > 0) {
      c.shareOfGrossDecline = c.negativeImpact / grossNegative
    }
    if (netDecline > 0 && c.negativeImpact > 0) {
      c.shareOfNetDecline = c.negativeImpact / netDecline
    }
  }

  return contributions.sort((a, b) => b.negativeImpact - a.negativeImpact)
}

// ─── Data availability ─────────────────────────────────────────────────────

export function computeDataAvailability(
  currentMonth: string,
  previousMonth: string | null,
  networkCurrent: NetworkPeriod,
  networkPrevious: NetworkPeriod | null,
  pvrsCurrent: PvrPeriod[],
  pvrsPrevious: PvrPeriod[],
  lastUploadDate: string | null,
  config: ExecutiveBriefingConfig,
): DataAvailability {
  const currentExpected = expectedDaysInMonth(currentMonth)
  const previousExpected = previousMonth ? expectedDaysInMonth(previousMonth) : 0

  const currentCoverage = currentExpected > 0 ? networkCurrent.days / currentExpected : 0
  const previousCoverage = previousExpected > 0 && networkPrevious ? networkPrevious.days / previousExpected : 0

  const pvrRakeSum = pvrsCurrent.reduce((s, p) => s + p.rake, 0)
  const reconciliationDiff = networkCurrent.rake > 0 ? Math.abs(networkCurrent.rake - pvrRakeSum) / networkCurrent.rake : 0

  const notes: string[] = []
  if (currentCoverage < 1) notes.push(`Mese corrente coperto al ${(currentCoverage * 100).toFixed(0)}%`)
  if (previousMonth && previousCoverage < 1) notes.push(`Mese precedente coperto al ${(previousCoverage * 100).toFixed(0)}%`)
  if (!previousMonth || !networkPrevious) notes.push('Confronto con il mese precedente non disponibile')
  if (reconciliationDiff > config.confidence.reconciliationTolerancePct) {
    notes.push(`Scostamento rete/PVR del ${(reconciliationDiff * 100).toFixed(1)}%`)
  }

  let confidence: ExecutiveConfidence = 'high'
  if (currentCoverage < config.confidence.mediumCoveragePct || !previousMonth || !networkPrevious) {
    confidence = 'low'
  } else if (currentCoverage < config.confidence.highCoveragePct || previousCoverage < config.confidence.highCoveragePct || reconciliationDiff > config.confidence.reconciliationTolerancePct) {
    confidence = 'medium'
  }

  return {
    currentMonth,
    previousMonth,
    currentCoveragePct: currentCoverage,
    previousCoveragePct: previousCoverage,
    currentDaysPresent: networkCurrent.days,
    previousDaysPresent: networkPrevious?.days || 0,
    currentExpectedDays: currentExpected,
    previousExpectedDays: previousExpected,
    comparisonAvailable: !!previousMonth && !!networkPrevious,
    lastUploadDate,
    networkRake: networkCurrent.rake,
    pvrRakeSum,
    reconciliationDiffPct: reconciliationDiff,
    confidence,
    notes,
  }
}

// ─── Insight generation: network ───────────────────────────────────────────

function networkInsight(
  id: string,
  category: ExecutiveInsight['category'],
  severity: ExecutiveSeverity,
  title: string,
  summary: string,
  month: string,
  comparisonMonth: string | null,
  currentValue: number,
  previousValue: number | null,
  deltaAbs: number,
  deltaPct: number | null,
  economicImpact: number,
  confidence: ExecutiveConfidence,
  evidences: ExecutiveEvidence[],
  suggestedAction: string,
  config: ExecutiveBriefingConfig,
): ExecutiveInsight {
  if (isForbiddenAction(suggestedAction, config)) {
    suggestedAction = 'monitorare il fenomeno'
  }
  return {
    id,
    category,
    severity,
    priorityScore: priorityScoreFor(severity, economicImpact, confidence),
    title,
    summary,
    month,
    comparisonMonth,
    entity: 'network',
    entityId: null,
    entityName: null,
    currentValue,
    previousValue,
    deltaAbs,
    deltaPct,
    economicImpact,
    confidence,
    evidences,
    suggestedAction,
    drilldownUrl: null,
  }
}

export function generateNetworkInsights(
  networkCurrent: NetworkPeriod,
  networkPrevious: NetworkPeriod | null,
  availability: DataAvailability,
  config: ExecutiveBriefingConfig,
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = []
  const month = networkCurrent.month
  const prevMonth = networkPrevious?.month || null
  const confidence = availability.confidence

  // Rake change
  if (networkPrevious) {
    const deltaRake = networkCurrent.rake - networkPrevious.rake
    const deltaPct = pctDelta(networkCurrent.rake, networkPrevious.rake)
    const impact = Math.abs(deltaRake)
    if (impact >= config.network.minDeltaEur && (deltaPct === null || Math.abs(deltaPct) >= config.network.minDeltaPct)) {
      const isDecline = deltaRake < 0
      const severity = isDecline ? severityForDecline(deltaPct, impact, config) : severityForGrowth(deltaPct, impact, config)
      insights.push(
        networkInsight(
          `network-rake-${isDecline ? 'decline' : 'growth'}`,
          'network_performance',
          severity,
          isDecline ? 'Rake in calo rispetto al mese precedente' : 'Rake in crescita rispetto al mese precedente',
          isDecline
            ? `Il Rake di ${monthName(month)} è ${formatEur(networkCurrent.rake)}, in calo di ${formatEur(Math.abs(deltaRake))} (${formatPct(deltaPct)}) rispetto a ${monthName(prevMonth!)}.`
            : `Il Rake di ${monthName(month)} è ${formatEur(networkCurrent.rake)}, in crescita di ${formatEur(deltaRake)} (${formatPct(deltaPct)}) rispetto a ${monthName(prevMonth!)}.`,
          month,
          prevMonth,
          networkCurrent.rake,
          networkPrevious.rake,
          deltaRake,
          deltaPct,
          impact,
          confidence,
          [
            { label: 'Rake corrente', value: networkCurrent.rake, unit: 'eur' },
            { label: 'Rake precedente', value: networkPrevious.rake, unit: 'eur' },
            { label: 'Variazione', value: deltaPct ?? 0, unit: 'pct' },
          ],
          isDecline ? 'approfondire il calo di volume con i PVR maggiormente coinvolti' : 'riconoscere la crescita e monitorare la tenuta',
          config,
        ),
      )
    }
  }

  // Bet / volume change
  if (networkPrevious) {
    const deltaBet = networkCurrent.bet - networkPrevious.bet
    const deltaPct = pctDelta(networkCurrent.bet, networkPrevious.bet)
    const impact = Math.abs(deltaBet)
    if (impact >= config.network.minDeltaEur && (deltaPct === null || Math.abs(deltaPct) >= config.network.minDeltaPct)) {
      const isDecline = deltaBet < 0
      const severity = isDecline ? severityForDecline(deltaPct, impact, config) : 'info'
      insights.push(
        networkInsight(
          `network-bet-${isDecline ? 'decline' : 'growth'}`,
          'network_performance',
          severity,
          isDecline ? 'Volume di gioco in calo' : 'Volume di gioco in crescita',
          isDecline
            ? `Il Bet complessivo è ${formatEur(networkCurrent.bet)}, con una riduzione di ${formatEur(Math.abs(deltaBet))} (${formatPct(deltaPct)}).`
            : `Il Bet complessivo è ${formatEur(networkCurrent.bet)}, con un incremento di ${formatEur(deltaBet)} (${formatPct(deltaPct)}).`,
          month,
          prevMonth,
          networkCurrent.bet,
          networkPrevious.bet,
          deltaBet,
          deltaPct,
          impact,
          confidence,
          [
            { label: 'Bet corrente', value: networkCurrent.bet, unit: 'eur' },
            { label: 'Bet precedente', value: networkPrevious.bet, unit: 'eur' },
          ],
          isDecline ? 'contattare i PVR con il maggior calo di volume' : 'monitorare la crescita del volume',
          config,
        ),
      )
    }
  }

  // Negative rake days
  if (networkCurrent.negativeRakeDays > 0) {
    const worst = networkCurrent.worstDay
    insights.push(
      networkInsight(
        'network-negative-rake-days',
        'negative_rake',
        networkCurrent.negativeRakeDays >= 3 ? 'critical' : 'warning',
        `${networkCurrent.negativeRakeDays} ${networkCurrent.negativeRakeDays === 1 ? 'giorno con Rake negativo' : 'giorni con Rake negativo'}`,
        `Nel mese sono stati rilevati ${networkCurrent.negativeRakeDays} giorni con Rake negativo${worst ? `; il peggiore è stato ${worst.date} (${formatEur(worst.rake)})` : ''}.`,
        month,
        prevMonth,
        networkCurrent.negativeRakeDays,
        networkPrevious?.negativeRakeDays ?? null,
        networkCurrent.negativeRakeDays - (networkPrevious?.negativeRakeDays ?? 0),
        null,
        Math.abs(worst?.rake || 0),
        confidence,
        [
          { label: 'Giorni negativi', value: networkCurrent.negativeRakeDays, unit: 'count' },
          ...(worst ? [{ label: 'Giorno peggiore', value: worst.rake, unit: 'eur' as const, date: worst.date }] : []),
        ],
        'approfondire le giornate con Rake negativo',
        config,
      ),
    )
  }

  // Payout change
  if (networkPrevious && networkCurrent.bet >= config.network.payoutMinVolumeEur && networkPrevious.bet >= config.network.payoutMinVolumeEur) {
    const deltaPts = networkCurrent.payout - networkPrevious.payout
    if (Math.abs(deltaPts) >= config.network.payoutChangeMinPts) {
      const isIncrease = deltaPts > 0
      insights.push(
        networkInsight(
          'network-payout-change',
          'payout_change',
          isIncrease ? 'warning' : 'info',
          isIncrease ? 'Payout aumentato rispetto al mese precedente' : 'Payout diminuito rispetto al mese precedente',
          `Il payout ponderato è passato dal ${formatPct(networkPrevious.payout / 100)} al ${formatPct(networkCurrent.payout / 100)} (${deltaPts > 0 ? '+' : ''}${deltaPts.toFixed(1).replace('.', ',')} punti percentuali).`,
          month,
          prevMonth,
          networkCurrent.payout,
          networkPrevious.payout,
          deltaPts,
          null,
          Math.abs(deltaPts) * (networkCurrent.bet / 100),
          confidence,
          [
            { label: 'Payout corrente', value: networkCurrent.payout, unit: 'pct' },
            { label: 'Payout precedente', value: networkPrevious.payout, unit: 'pct' },
          ],
          'approfondire la variazione payout',
          config,
        ),
      )
    }
  }

  // Data quality warning
  if (availability.confidence === 'low') {
    insights.push(
      networkInsight(
        'data-quality-low-confidence',
        'data_quality',
        'warning',
        'Qualità dati insufficiente per confronti affidabili',
        availability.notes.join('. ') + '.',
        month,
        prevMonth,
        availability.currentCoveragePct,
        availability.previousCoveragePct,
        availability.currentCoveragePct - availability.previousCoveragePct,
        null,
        0,
        'low',
        [
          { label: 'Copertura corrente', value: availability.currentCoveragePct, unit: 'pct' },
          ...(availability.previousMonth ? [{ label: 'Copertura precedente', value: availability.previousCoveragePct, unit: 'pct' as const }] : []),
        ],
        'verificare la completezza dei dati prima di intervenire',
        config,
      ),
    )
  }

  return insights
}

// ─── Insight generation: PVR ───────────────────────────────────────────────

function pvrInsight(
  id: string,
  category: ExecutiveInsight['category'],
  severity: ExecutiveSeverity,
  title: string,
  summary: string,
  month: string,
  comparisonMonth: string | null,
  entityId: string,
  entityName: string,
  currentValue: number,
  previousValue: number | null,
  deltaAbs: number,
  deltaPct: number | null,
  economicImpact: number,
  confidence: ExecutiveConfidence,
  evidences: ExecutiveEvidence[],
  suggestedAction: string,
  config: ExecutiveBriefingConfig,
): ExecutiveInsight {
  if (isForbiddenAction(suggestedAction, config)) {
    suggestedAction = 'monitorare il fenomeno'
  }
  return {
    id,
    category,
    severity,
    priorityScore: priorityScoreFor(severity, economicImpact, confidence),
    title,
    summary,
    month,
    comparisonMonth,
    entity: 'pvr',
    entityId,
    entityName,
    currentValue,
    previousValue,
    deltaAbs,
    deltaPct,
    economicImpact,
    confidence,
    evidences,
    suggestedAction,
    drilldownUrl: `/pvr/${entityId}`,
  }
}

export function generatePvrInsights(
  contributions: PvrContribution[],
  networkCurrent: NetworkPeriod,
  networkPrevious: NetworkPeriod | null,
  availability: DataAvailability,
  config: ExecutiveBriefingConfig,
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = []
  const month = networkCurrent.month
  const prevMonth = networkPrevious?.month || null
  const confidence = availability.confidence

  // Top decline contributors
  const declining = contributions.filter(
    (c) =>
      c.negativeImpact > 0 &&
      c.negativeImpact >= config.pvr.minDeltaEur &&
      c.currentRake >= config.pvr.minRakeEur,
  )

  if (declining.length > 0) {
    const top = declining[0]
    const top3 = declining.slice(0, config.concentration.topContributors)
    const top3Share = top3.reduce((s, c) => s + (c.shareOfGrossDecline || 0), 0)

    insights.push(
      pvrInsight(
        `decline-concentration-top`,
        'decline_concentration',
        top3Share >= config.concentration.highConcentrationPct ? 'critical' : 'warning',
        `Il ${(top3Share * 100).toFixed(0)}% del calo PVR è concentrato nei primi ${top3.length} PVR`,
        `I principali contributori al calo sono: ${top3.map((c) => `${c.pvrName} (${formatPct(c.deltaPct)})`).join(', ')}.`,
        month,
        prevMonth,
        top.pvrId,
        top.pvrName,
        top3.reduce((s, c) => s + c.negativeImpact, 0),
        null,
        0,
        null,
        top3.reduce((s, c) => s + c.negativeImpact, 0),
        confidence,
        top3.map((c) => ({
          label: c.pvrName,
          value: c.negativeImpact,
          unit: 'eur' as const,
        })),
        'contattare i PVR principali per verificare il calo del volume',
        config,
      ),
    )
  }

  // Individual PVR decline
  for (const c of contributions) {
    if (c.negativeImpact <= 0) continue
    if (c.currentRake < config.pvr.minRakeEur && c.previousRake < config.pvr.minRakeEur) continue
    if (c.negativeImpact < config.pvr.minDeltaEur) continue
    const deltaPct = c.deltaPct
    if (deltaPct !== null && Math.abs(deltaPct) < config.pvr.minDeclinePct) continue

    const severity = severityForDecline(deltaPct, c.negativeImpact, config)
    const title = `${c.pvrName} contribuisce al calo con ${formatEur(c.negativeImpact)}`

    insights.push(
      pvrInsight(
        `pvr-decline-${c.pvrId}`,
        'pvr_decline',
        severity,
        title,
        `${c.pvrName} ha un Rake di ${formatEur(c.currentRake)}${prevMonth ? ` contro ${formatEur(c.previousRake)} di ${monthName(prevMonth)}` : ''} (${formatPct(deltaPct)}). Quota sul calo PVR: ${formatPct(c.shareOfGrossDecline)}.`,
        month,
        prevMonth,
        c.pvrId,
        c.pvrName,
        c.currentRake,
        c.previousRake,
        c.deltaRake,
        deltaPct,
        c.negativeImpact,
        confidence,
        [
          { label: 'Rake corrente', value: c.currentRake, unit: 'eur' },
          { label: 'Rake precedente', value: c.previousRake, unit: 'eur' },
          { label: 'Quota sul calo', value: c.shareOfGrossDecline || 0, unit: 'pct' },
        ],
        'contattare il PVR per verificare il calo del volume',
        config,
      ),
    )
  }

  // Individual PVR growth
  const growing = contributions.filter(
    (c) =>
      c.positiveOffset > 0 &&
      c.positiveOffset >= config.pvr.minDeltaEur &&
      c.currentRake >= config.pvr.minRakeEur,
  )
  const topGrowth = growing
    .filter((c) => c.deltaPct === null || c.deltaPct >= config.pvr.minGrowthPct)
    .sort((a, b) => b.positiveOffset - a.positiveOffset)
    .slice(0, config.ranking.topGrowthCount)

  for (const c of topGrowth) {
    insights.push(
      pvrInsight(
        `pvr-growth-${c.pvrId}`,
        'pvr_growth',
        'info',
        `${c.pvrName} in crescita significativa`,
        `${c.pvrName} ha incrementato il Rake a ${formatEur(c.currentRake)} (${formatPct(c.deltaPct)}).`,
        month,
        prevMonth,
        c.pvrId,
        c.pvrName,
        c.currentRake,
        c.previousRake,
        c.deltaRake,
        c.deltaPct,
        c.positiveOffset,
        confidence,
        [
          { label: 'Rake corrente', value: c.currentRake, unit: 'eur' },
          { label: 'Incremento', value: c.positiveOffset, unit: 'eur' },
        ],
        'riconoscere il PVR con crescita significativa e monitorarne la tenuta',
        config,
      ),
    )
  }

  // Inactive PVRs
  const inactive = contributions.filter((c) => c.isInactive && c.currentRake <= config.pvr.inactivityThresholdEur)
  if (inactive.length > 0) {
    const sorted = inactive.sort((a, b) => b.previousRake - a.previousRake).slice(0, 5)
    insights.push(
      pvrInsight(
        'pvr-inactivity-bucket',
        'pvr_inactivity',
        sorted[0].previousRake > config.network.minDeltaEur ? 'warning' : 'info',
        `${inactive.length} ${inactive.length === 1 ? 'PVR senza movimento' : 'PVR senza movimento'} nel mese`,
        `Non è stato rilevato movimento per: ${sorted.map((c) => c.pvrName).join(', ')}${inactive.length > sorted.length ? ` e altri ${inactive.length - sorted.length}` : ''}.`,
        month,
        prevMonth,
        sorted[0].pvrId,
        sorted[0].pvrName,
        inactive.length,
        null,
        0,
        null,
        sorted.reduce((s, c) => s + c.previousRake, 0),
        confidence,
        sorted.map((c) => ({
          label: c.pvrName,
          value: c.previousRake,
          unit: 'eur' as const,
        })),
        'verificare i PVR senza movimento registrato nel mese',
        config,
      ),
    )
  }

  return insights
}

// ─── Deduplication ─────────────────────────────────────────────────────────

export function deduplicateInsights(insights: ExecutiveInsight[]): ExecutiveInsight[] {
  const seen = new Map<string, ExecutiveInsight>()
  for (const insight of insights) {
    const key = `${insight.entity}|${insight.entityId || ''}|${insight.category}|${insight.month}`
    const existing = seen.get(key)
    if (!existing || insight.priorityScore > existing.priorityScore) {
      seen.set(key, insight)
    }
  }
  return Array.from(seen.values())
}

// ─── Ranking ───────────────────────────────────────────────────────────────

export function rankInsights(insights: ExecutiveInsight[]): ExecutiveInsight[] {
  return [...insights].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
    if (b.economicImpact !== a.economicImpact) return b.economicImpact - a.economicImpact
    return a.title.localeCompare(b.title)
  })
}

// ─── Priorities ────────────────────────────────────────────────────────────

export function generatePriorities(
  insights: ExecutiveInsight[],
  config: ExecutiveBriefingConfig,
): ExecutivePriority[] {
  const candidates = rankInsights(insights).filter(
    (i) => i.severity === 'critical' || i.severity === 'warning',
  )
  const priorities: ExecutivePriority[] = []
  const usedEntities = new Set<string>()

  for (const insight of candidates) {
    if (priorities.length >= config.ranking.maxPriorities) break
    const entityKey = `${insight.entity}|${insight.entityId || ''}`
    if (usedEntities.has(entityKey)) continue
    usedEntities.add(entityKey)

    const action = isForbiddenAction(insight.suggestedAction, config)
      ? 'monitorare il fenomeno'
      : insight.suggestedAction
    priorities.push({
      rank: priorities.length + 1,
      entity: insight.entity,
      entityId: insight.entityId,
      entityName: insight.entityName,
      reason: insight.summary,
      impactEur: insight.economicImpact,
      confidence: insight.confidence,
      sourceInsightIds: [insight.id],
      action,
      drilldownUrl: insight.drilldownUrl,
    })
  }

  return priorities
}

// ─── Executive summary ─────────────────────────────────────────────────────

export function generateExecutiveSummary(
  networkCurrent: NetworkPeriod,
  networkPrevious: NetworkPeriod | null,
  contributions: PvrContribution[],
  priorities: ExecutivePriority[],
  availability: DataAvailability,
  config: ExecutiveBriefingConfig,
): string[] {
  const sentences: string[] = []
  const month = monthName(networkCurrent.month)

  if (!availability.comparisonAvailable) {
    sentences.push(`La rete registra un Rake di ${formatEur(networkCurrent.rake)} per ${month}; il confronto con il mese precedente non è disponibile.`)
    if (sentences.length >= config.ranking.summarySentences) return sentences
  } else if (networkPrevious) {
    const deltaRake = networkCurrent.rake - networkPrevious.rake
    const deltaPct = pctDelta(networkCurrent.rake, networkPrevious.rake)
    if (Math.abs(deltaRake) >= config.network.minDeltaEur) {
      sentences.push(
        `La rete chiude ${month} con Rake ${deltaRake < 0 ? 'in calo' : 'in crescita'} del ${formatPct(deltaPct)} (${formatEur(Math.abs(deltaRake))}).`,
      )
      if (sentences.length >= config.ranking.summarySentences) return sentences
    } else {
      sentences.push(`La rete chiude ${month} con Rake ${formatEur(networkCurrent.rake)}, in linea con il mese precedente.`)
      if (sentences.length >= config.ranking.summarySentences) return sentences
    }
  }

  const declining = contributions.filter((c) => c.negativeImpact > 0)
  if (declining.length > 0) {
    const top3 = declining.slice(0, config.concentration.topContributors)
    const share = top3.reduce((s, c) => s + (c.shareOfGrossDecline || 0), 0)
    sentences.push(`Il ${formatPct(share)} del calo rilevato sui PVR è concentrato in ${top3.length} punti vendita.`)
    if (sentences.length >= config.ranking.summarySentences) return sentences
  }

  if (priorities.length > 0) {
    sentences.push(`${priorities.length === 1 ? 'Un PVR richiede' : `${priorities.length} PVR richiedono`} un approfondimento prioritario.`)
    if (sentences.length >= config.ranking.summarySentences) return sentences
  }

  if (networkCurrent.negativeRakeDays > 0) {
    sentences.push(`${networkCurrent.negativeRakeDays} ${networkCurrent.negativeRakeDays === 1 ? 'giorno presenta' : 'giorni presentano'} Rake negativo nel mese.`)
  }

  return sentences.slice(0, config.ranking.summarySentences)
}

// ─── Main builder ──────────────────────────────────────────────────────────

export function buildExecutiveBriefing(
  input: ExecutiveBriefingInput,
): ExecutiveBriefingResult {
  const config = input.config || DEFAULT_EXECUTIVE_BRIEFING_CONFIG

  const availability = computeDataAvailability(
    input.currentMonth,
    input.previousMonth,
    input.networkCurrent,
    input.networkPrevious,
    input.pvrsCurrent,
    input.pvrsPrevious,
    input.lastUploadDate,
    config,
  )

  const contributions = computePvrContributions(
    input.pvrsCurrent,
    input.pvrsPrevious,
    input.networkCurrent,
    input.networkPrevious,
    config,
  )

  const networkInsights = generateNetworkInsights(
    input.networkCurrent,
    input.networkPrevious,
    availability,
    config,
  )

  const pvrInsights = generatePvrInsights(
    contributions,
    input.networkCurrent,
    input.networkPrevious,
    availability,
    config,
  )

  const allInsights = deduplicateInsights([...networkInsights, ...pvrInsights])
  const ranked = rankInsights(allInsights).slice(0, config.ranking.maxInsights)
  const priorities = generatePriorities(ranked, config)
  const summary = generateExecutiveSummary(
    input.networkCurrent,
    input.networkPrevious,
    contributions,
    priorities,
    availability,
    config,
  )

  return {
    month: input.currentMonth,
    previousMonth: input.previousMonth,
    summary,
    insights: ranked,
    priorities,
    availability,
    networkCurrent: input.networkCurrent,
    networkPrevious: input.networkPrevious,
    pvrsCurrent: input.pvrsCurrent,
    pvrsPrevious: input.pvrsPrevious,
    pvrContributions: contributions,
  }
}
