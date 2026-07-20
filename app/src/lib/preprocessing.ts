// ─── Preprocessing & Decision Engine Foundation ───
// Pure TypeScript module — zero dependencies on React, Supabase, or localStorage.
// Sources: daily_network_stats (file 6) for network-level features.
// Later slices will add PVR, player, provider/game, and ticket preprocessing.

// ─── Types ───

/** A single day of network-level observations from daily_network_stats (file 6). */
export interface NetworkDailyObservation {
  date: string // ISO YYYY-MM-DD
  total_rake: number
  total_bet: number
  total_won: number
  active_players: number
}

/** Result of validating raw observations. */
export interface ValidationResult {
  valid: NetworkDailyObservation[]
  errors: DataQualityError[]
}

/** A data quality error encountered during validation. */
export interface DataQualityError {
  type: 'INVALID_DATE' | 'NAN_METRIC' | 'INFINITE_METRIC' | 'DUPLICATE_DATE'
  index: number
  detail: string
}

/** Preprocessing configuration — centralised and replaceable. */
export interface PreprocessingConfig {
  baselineWindowDays: number
  minBaselineDays: number
  rakeDropWarningPct: number
  rakeDropCriticalPct: number
  activePlayersDropWarningPct: number
  activePlayersDropCriticalPct: number
  payoutWarningPct: number
  payoutCriticalPct: number
  zScoreWarning: number
  zScoreCritical: number
}

export const DEFAULT_PREPROCESSING_CONFIG: PreprocessingConfig = {
  baselineWindowDays: 14,
  minBaselineDays: 5,
  rakeDropWarningPct: 15,
  rakeDropCriticalPct: 30,
  activePlayersDropWarningPct: 15,
  activePlayersDropCriticalPct: 30,
  payoutWarningPct: 95,
  payoutCriticalPct: 98,
  zScoreWarning: 1.5,
  zScoreCritical: 2.0,
}

/** A single preprocessed day with computed features. */
export interface PreprocessedNetworkDay {
  date: string
  total_rake: number
  total_bet: number
  total_won: number
  active_players: number
  payout_pct: number
  // Baseline (computed from previous days only)
  baseline_days: number
  baseline_sufficient: boolean
  rake_baseline: number
  payout_baseline: number
  active_players_baseline: number
  // Deltas
  rake_delta_pct: number | null
  payout_delta_pct: number | null
  active_players_delta_pct: number | null
  // Z-scores
  rake_z_score: number | null
  payout_z_score: number | null
  // Quality
  confidence: number // 0-1
}

/** Evidence attached to every decision signal. */
export interface SignalEvidence {
  source: string // e.g. "daily_network_stats"
  baseline_days: number
  direct_fact: boolean // true when signal does not depend on baseline
}

/** A single decision signal produced by the preprocessing engine. */
export interface DecisionSignal {
  id: string
  rule_id: string
  scope: 'network' | 'pvr' | 'player' | 'game'
  entity_id: string
  date: string
  category: 'critical' | 'warning' | 'info'
  metric: string
  severity: 'high' | 'medium' | 'low'
  current_value: number
  baseline_value: number | null
  delta_pct: number | null
  z_score: number | null
  confidence: number
  priority_score: number
  title: string
  explanation: string
  recommended_action: string
  evidence: SignalEvidence
}

// ─── Helpers ───

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidISODate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false
  const d = new Date(s + 'T12:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function zScore(value: number, baselineValues: number[]): number | null {
  if (baselineValues.length < 2) return null
  const m = mean(baselineValues)
  const s = stdDev(baselineValues, m)
  if (s === 0) return 0
  return (value - m) / s
}

function deltaPct(current: number, baseline: number): number | null {
  if (baseline === 0) return null
  return ((current - baseline) / Math.abs(baseline)) * 100
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ─── Data Quality Gate ───

/**
 * Validates raw observations, rejects invalid entries, sorts chronologically,
 * and removes duplicates (keeping first occurrence).
 * Returns valid observations and data quality errors separately.
 * Never silently converts invalid data to zero.
 */
export function validateNetworkObservations(
  raw: NetworkDailyObservation[],
): ValidationResult {
  const valid: NetworkDailyObservation[] = []
  const errors: DataQualityError[] = []
  const seen = new Set<string>()

  // First pass: validate individual entries
  const candidates: { obs: NetworkDailyObservation; idx: number }[] = []
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i]

    // 1. Validate date
    if (!isValidISODate(o.date)) {
      errors.push({ type: 'INVALID_DATE', index: i, detail: `"${o.date}" is not a valid ISO YYYY-MM-DD date` })
      continue
    }

    // 2. Validate numeric metrics
    const metrics: [string, number][] = [
      ['total_rake', o.total_rake],
      ['total_bet', o.total_bet],
      ['total_won', o.total_won],
      ['active_players', o.active_players],
    ]
    let metricOk = true
    for (const [name, val] of metrics) {
      if (typeof val !== 'number' || isNaN(val)) {
        errors.push({ type: 'NAN_METRIC', index: i, detail: `${name} is NaN for date ${o.date}` })
        metricOk = false
        break
      }
      if (!isFinite(val)) {
        errors.push({ type: 'INFINITE_METRIC', index: i, detail: `${name} is infinite for date ${o.date}` })
        metricOk = false
        break
      }
    }
    if (!metricOk) continue

    candidates.push({ obs: { ...o }, idx: i })
  }

  // Sort chronologically
  candidates.sort((a, b) => a.obs.date.localeCompare(b.obs.date))

  // Deduplicate by date (keep first)
  for (const c of candidates) {
    if (seen.has(c.obs.date)) {
      errors.push({ type: 'DUPLICATE_DATE', index: c.idx, detail: `Duplicate date ${c.obs.date}` })
      continue
    }
    seen.add(c.obs.date)
    valid.push(c.obs)
  }

  return { valid, errors }
}

// ─── Feature Computation ───

/**
 * Preprocesses validated network observations.
 * Computes baselines (from previous days only), deltas, z-scores, and confidence.
 * Days with insufficient baseline still get features computed with null deltas/z-scores.
 */
export function preprocessNetwork(
  observations: NetworkDailyObservation[],
  config: PreprocessingConfig = DEFAULT_PREPROCESSING_CONFIG,
): PreprocessedNetworkDay[] {
  if (observations.length === 0) return []

  const result: PreprocessedNetworkDay[] = []

  for (let i = 0; i < observations.length; i++) {
    const current = observations[i]
    const payout = current.total_bet > 0 ? (current.total_won / current.total_bet) * 100 : 0

    // Baseline: only previous days, up to baselineWindowDays
    const baselineStart = Math.max(0, i - config.baselineWindowDays)
    const baselineDays = observations.slice(baselineStart, i)
    const baselineSufficient = baselineDays.length >= config.minBaselineDays

    const rakeBaseline = baselineSufficient ? mean(baselineDays.map(d => d.total_rake)) : 0
    const payoutBaseline = baselineSufficient ? mean(baselineDays.map(d => d.total_bet > 0 ? (d.total_won / d.total_bet) * 100 : 0)) : 0
    const activeBaseline = baselineSufficient ? mean(baselineDays.map(d => d.active_players)) : 0

    const rakeDelta = baselineSufficient ? deltaPct(current.total_rake, rakeBaseline) : null
    const payoutDelta = baselineSufficient ? deltaPct(payout, payoutBaseline) : null
    const activeDelta = baselineSufficient ? deltaPct(current.active_players, activeBaseline) : null

    const rakeZ = baselineSufficient ? zScore(current.total_rake, baselineDays.map(d => d.total_rake)) : null
    const payoutZ = baselineSufficient ? zScore(payout, baselineDays.map(d => d.total_bet > 0 ? (d.total_won / d.total_bet) * 100 : 0)) : null

    // Confidence: 1.0 when baseline sufficient, scales down with fewer days
    const confidence = baselineDays.length >= config.minBaselineDays
      ? 1.0
      : baselineDays.length > 0
        ? clamp(baselineDays.length / config.minBaselineDays, 0.1, 0.9)
        : 0.1

    result.push({
      date: current.date,
      total_rake: current.total_rake,
      total_bet: current.total_bet,
      total_won: current.total_won,
      active_players: current.active_players,
      payout_pct: Math.round(payout * 100) / 100,
      baseline_days: baselineDays.length,
      baseline_sufficient: baselineSufficient,
      rake_baseline: Math.round(rakeBaseline * 100) / 100,
      payout_baseline: Math.round(payoutBaseline * 100) / 100,
      active_players_baseline: Math.round(activeBaseline * 100) / 100,
      rake_delta_pct: rakeDelta !== null ? Math.round(rakeDelta * 10) / 10 : null,
      payout_delta_pct: payoutDelta !== null ? Math.round(payoutDelta * 10) / 10 : null,
      active_players_delta_pct: activeDelta !== null ? Math.round(activeDelta * 10) / 10 : null,
      rake_z_score: rakeZ !== null ? Math.round(rakeZ * 100) / 100 : null,
      payout_z_score: payoutZ !== null ? Math.round(payoutZ * 100) / 100 : null,
      confidence,
    })
  }

  return result
}

// ─── Signal Generation ───

let signalCounter = 0
function nextSignalId(): string {
  return `sig-${++signalCounter}-${Date.now().toString(36)}`
}

function priorityScore(severity: 'high' | 'medium' | 'low', confidence: number): number {
  const sevWeight = severity === 'high' ? 3 : severity === 'medium' ? 2 : 1
  return Math.round(sevWeight * confidence * 100)
}

interface BaselineRef {
  value: number
  days: number
}

/**
 * Generates decision signals from preprocessed network days.
 * Returns all signals (alert history). Use buildDecisionQueue for deduplicated prioritised queue.
 */
export function generateNetworkSignals(
  days: PreprocessedNetworkDay[],
  config: PreprocessingConfig = DEFAULT_PREPROCESSING_CONFIG,
): DecisionSignal[] {
  const signals: DecisionSignal[] = []

  for (const day of days) {
    const hasRakeNegative = false // track to prevent double-signalling

    // ── RULE 1: NETWORK_RAKE_NEGATIVE ──
    if (day.total_rake < 0) {
      const baseline: BaselineRef = day.baseline_sufficient
        ? { value: day.rake_baseline, days: day.baseline_days }
        : { value: 0, days: 0 }

      signals.push({
        id: nextSignalId(),
        rule_id: 'NETWORK_RAKE_NEGATIVE',
        scope: 'network',
        entity_id: 'network',
        date: day.date,
        category: 'critical',
        metric: 'rake',
        severity: 'high',
        current_value: day.total_rake,
        baseline_value: day.baseline_sufficient ? day.rake_baseline : null,
        delta_pct: day.rake_delta_pct,
        z_score: day.rake_z_score,
        confidence: 1.0, // direct fact, always confident
        priority_score: priorityScore('high', 1.0),
        title: `Rake negativo il ${day.date}`,
        explanation: day.baseline_sufficient
          ? `Rake giornaliero di ${day.total_rake.toFixed(2)}€ (baseline ultimi ${day.baseline_days} giorni: ${day.rake_baseline.toFixed(2)}€, delta ${day.rake_delta_pct?.toFixed(1)}%).`
          : `Rake giornaliero di ${day.total_rake.toFixed(2)}€. Baseline insufficiente (${day.baseline_days}/${config.minBaselineDays} giorni).`,
        recommended_action: 'Aprire il drill-down per identificare PVR e giocatori che hanno contribuito al rake negativo.',
        evidence: {
          source: 'daily_network_stats',
          baseline_days: baseline.days,
          direct_fact: true,
        },
      })
      continue // Don't also fire RAKE_DROP for the same day
    }

    // ── RULE 2: NETWORK_RAKE_DROP ──
    if (day.baseline_sufficient && day.rake_delta_pct !== null) {
      const absDelta = Math.abs(day.rake_delta_pct!)
      let severity: 'high' | 'medium' | 'low' | null = null

      if (absDelta >= config.rakeDropCriticalPct || (day.rake_z_score !== null && Math.abs(day.rake_z_score!) >= config.zScoreCritical)) {
        severity = 'high'
      } else if (absDelta >= config.rakeDropWarningPct || (day.rake_z_score !== null && Math.abs(day.rake_z_score!) >= config.zScoreWarning)) {
        severity = 'medium'
      }

      if (severity) {
        signals.push({
          id: nextSignalId(),
          rule_id: 'NETWORK_RAKE_DROP',
          scope: 'network',
          entity_id: 'network',
          date: day.date,
          category: severity === 'high' ? 'critical' : 'warning',
          metric: 'rake',
          severity,
          current_value: day.total_rake,
          baseline_value: day.rake_baseline,
          delta_pct: day.rake_delta_pct,
          z_score: day.rake_z_score,
          confidence: day.confidence,
          priority_score: priorityScore(severity, day.confidence),
          title: `Calo rake il ${day.date}`,
          explanation: `Rake di ${day.total_rake.toFixed(2)}€ vs baseline ${day.rake_baseline.toFixed(2)}€ (${day.baseline_days} giorni). Delta: ${day.rake_delta_pct!.toFixed(1)}%${day.rake_z_score !== null ? `, z-score: ${day.rake_z_score!.toFixed(2)}` : ''}.`,
          recommended_action: 'Verificare andamento PVR e giocatori per il periodo.',
          evidence: {
            source: 'daily_network_stats',
            baseline_days: day.baseline_days,
            direct_fact: false,
          },
        })
      }
    }

    // ── RULE 3: NETWORK_PAYOUT_ANOMALY ──
    const payoutAnomaly = day.baseline_sufficient
      ? (day.payout_pct >= config.payoutWarningPct || (day.payout_z_score !== null && day.payout_z_score >= config.zScoreWarning))
      : false

    const payoutHighSeverity = day.baseline_sufficient
      ? (day.payout_pct >= config.payoutCriticalPct || (day.payout_z_score !== null && day.payout_z_score >= config.zScoreCritical))
      : false

    if (day.payout_pct >= config.payoutWarningPct) {
      // Direct fact: payout above threshold
      const sev = payoutHighSeverity ? 'high' : 'medium'
      signals.push({
        id: nextSignalId(),
        rule_id: 'NETWORK_PAYOUT_ANOMALY',
        scope: 'network',
        entity_id: 'network',
        date: day.date,
        category: sev === 'high' ? 'critical' : 'warning',
        metric: 'payout',
        severity: sev,
        current_value: day.payout_pct,
        baseline_value: day.baseline_sufficient ? day.payout_baseline : null,
        delta_pct: day.payout_delta_pct,
        z_score: day.payout_z_score,
        confidence: day.confidence,
        priority_score: priorityScore(sev, day.confidence),
        title: `Payout anomalo il ${day.date}`,
        explanation: day.baseline_sufficient
          ? `Payout del ${day.payout_pct.toFixed(1)}% (baseline: ${day.payout_baseline.toFixed(1)}%, ${day.baseline_days} giorni)${day.payout_z_score !== null ? `, z-score: ${day.payout_z_score!.toFixed(2)}` : ''}.`
          : `Payout del ${day.payout_pct.toFixed(1)}%. Baseline insufficiente.`,
        recommended_action: 'Verificare se il payout elevato è legato a vincite consistenti o a un calo del bet. Azione prudente raccomandata.',
        evidence: {
          source: 'daily_network_stats',
          baseline_days: day.baseline_days,
          direct_fact: day.payout_pct >= config.payoutCriticalPct,
        },
      })
    }
  }

  return signals
}

// ─── Decision Queue ───

/**
 * Builds a prioritised decision queue from signals.
 * Deduplicates: keeps only the highest-priority signal per rule_id+scope+entity_id.
 * Then sorts by priority_score descending and applies the limit.
 * The original signals array is never mutated.
 */
export function buildDecisionQueue(
  signals: DecisionSignal[],
  limit: number = 10,
): DecisionSignal[] {
  // Deduplicate by rule_id + scope + entity_id (keep highest priority_score)
  const deduped = new Map<string, DecisionSignal>()
  for (const s of signals) {
    const key = `${s.rule_id}|${s.scope}|${s.entity_id}`
    const existing = deduped.get(key)
    if (!existing || s.priority_score > existing.priority_score) {
      deduped.set(key, s)
    }
  }

  // Sort by priority_score descending, then by date descending for ties
  const sorted = [...deduped.values()].sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score
    return b.date.localeCompare(a.date)
  })

  return sorted.slice(0, limit)
}

// Reset signal counter (useful for tests)
export function __resetSignalCounter(): void {
  signalCounter = 0
}
