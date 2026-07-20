import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateNetworkObservations,
  preprocessNetwork,
  generateNetworkSignals,
  buildDecisionQueue,
  DEFAULT_PREPROCESSING_CONFIG,
  __resetSignalCounter,
  type NetworkDailyObservation,
  type PreprocessingConfig,
  type DecisionSignal,
} from './preprocessing'

// ─── Test helpers ───

function makeDay(overrides: Partial<NetworkDailyObservation> & { date: string }): NetworkDailyObservation {
  return {
    total_rake: 2000,
    total_bet: 20000,
    total_won: 18000,
    active_players: 25,
    ...overrides,
  }
}

// Generate N consecutive stable days
function stableDays(n: number, startDate = '2026-06-01'): NetworkDailyObservation[] {
  const days: NetworkDailyObservation[] = []
  const base = new Date(startDate + 'T00:00:00')
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    days.push(makeDay({ date: d.toISOString().slice(0, 10) }))
  }
  return days
}

beforeEach(() => {
  __resetSignalCounter()
})

// ═══════════════════════════════════════════
// VALIDATION & QUALITY GATE
// ═══════════════════════════════════════════

describe('validateNetworkObservations', () => {
  it('sorts chronologically', () => {
    const raw = [
      makeDay({ date: '2026-06-03' }),
      makeDay({ date: '2026-06-01' }),
      makeDay({ date: '2026-06-02' }),
    ]
    const { valid, errors } = validateNetworkObservations(raw)
    expect(errors).toHaveLength(0)
    expect(valid.map(d => d.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('rejects invalid date format', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '01/06/2026' })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INVALID_DATE')
  })

  it('rejects NaN metric', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', total_rake: NaN })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('NAN_METRIC')
  })

  it('rejects infinite metric', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', total_bet: Infinity })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INFINITE_METRIC')
  })

  it('detects and removes duplicate dates (keeps first)', () => {
    const raw = [
      makeDay({ date: '2026-06-01', total_rake: 100 }),
      makeDay({ date: '2026-06-01', total_rake: 200 }),
      makeDay({ date: '2026-06-02', total_rake: 300 }),
    ]
    const { valid, errors } = validateNetworkObservations(raw)
    expect(valid).toHaveLength(2)
    expect(valid[0].total_rake).toBe(100) // first occurrence kept
    expect(errors.some(e => e.type === 'DUPLICATE_DATE')).toBe(true)
  })

  it('returns empty valid array for empty input', () => {
    const { valid, errors } = validateNetworkObservations([])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('does not mutate input array', () => {
    const raw = [
      makeDay({ date: '2026-06-03' }),
      makeDay({ date: '2026-06-01' }),
    ]
    const original = [...raw]
    validateNetworkObservations(raw)
    expect(raw).toEqual(original)
  })
})

// ═══════════════════════════════════════════
// FEATURE COMPUTATION
// ═══════════════════════════════════════════

describe('preprocessNetwork', () => {
  it('computes payout correctly', () => {
    const days = [makeDay({ date: '2026-06-01', total_bet: 1000, total_won: 900 })]
    const result = preprocessNetwork(days)
    expect(result[0].payout_pct).toBe(90)
  })

  it('payout is 0 when total_bet is 0', () => {
    const days = [makeDay({ date: '2026-06-01', total_bet: 0, total_won: 100 })]
    const result = preprocessNetwork(days)
    expect(result[0].payout_pct).toBe(0)
  })

  it('baseline insufficient for first days', () => {
    const days = stableDays(3)
    const result = preprocessNetwork(days, { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 5 })
    for (const d of result) {
      expect(d.baseline_sufficient).toBe(false)
      expect(d.rake_delta_pct).toBeNull()
      expect(d.rake_z_score).toBeNull()
    }
  })

  it('baseline sufficient after minBaselineDays', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 3 }
    const days = stableDays(5)
    const result = preprocessNetwork(days, config)
    // Days 0-2: insufficient, Days 3-4: sufficient
    expect(result[0].baseline_sufficient).toBe(false)
    expect(result[1].baseline_sufficient).toBe(false)
    expect(result[2].baseline_sufficient).toBe(false)
    expect(result[3].baseline_sufficient).toBe(true)
    expect(result[4].baseline_sufficient).toBe(true)
  })

  it('computes delta correctly', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, baselineWindowDays: 10, minBaselineDays: 1 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 1600 }), // -20% delta
    ]
    const result = preprocessNetwork(days, config)
    expect(result[1].baseline_sufficient).toBe(true)
    expect(result[1].rake_delta_pct).toBe(-20)
  })

  it('computes z-score correctly', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, baselineWindowDays: 10, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 2050 }),
      makeDay({ date: '2026-06-04', total_rake: 1900 }),
    ]
    const result = preprocessNetwork(days, config)
    // Day 3 baseline: [2000, 2100, 2050], mean=2033.33, std≈40.82
    // z-score = (1900-2033.33)/40.82 ≈ -3.27
    expect(result[3].baseline_sufficient).toBe(true)
    expect(result[3].rake_z_score).toBeLessThan(-3)
  })

  it('baseline uses only previous days, never current', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 1 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 100 }),
      makeDay({ date: '2026-06-02', total_rake: 200 }),
    ]
    const result = preprocessNetwork(days, config)
    // Day 1 baseline should be [100], mean=100, delta=(200-100)/100=100%
    expect(result[1].rake_baseline).toBe(100)
    expect(result[1].rake_delta_pct).toBe(100)
  })

  it('baseline respects windowDays limit', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, baselineWindowDays: 2, minBaselineDays: 1 }
    const days = stableDays(5)
    const result = preprocessNetwork(days, config)
    // Day 4 should have baseline from days 2-3 only
    expect(result[4].baseline_days).toBeLessThanOrEqual(2)
  })

  it('empty input returns empty array', () => {
    expect(preprocessNetwork([])).toEqual([])
  })

  it('confidence scales with baseline days', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 5 }
    const days = stableDays(4)
    const result = preprocessNetwork(days, config)
    // Day 3 has 3 baseline days, confidence = 3/5 = 0.6
    expect(result[3].confidence).toBeCloseTo(0.6, 1)
    // Day 0 has 0 baseline days, confidence = 0.1
    expect(result[0].confidence).toBe(0.1)
  })
})

// ═══════════════════════════════════════════
// SIGNAL GENERATION
// ═══════════════════════════════════════════

describe('generateNetworkSignals', () => {
  it('NETWORK_RAKE_NEGATIVE fires without baseline', () => {
    const days = [makeDay({ date: '2026-06-01', total_rake: -500 })]
    const processed = preprocessNetwork(days)
    const signals = generateNetworkSignals(processed)
    expect(signals).toHaveLength(1)
    expect(signals[0].rule_id).toBe('NETWORK_RAKE_NEGATIVE')
    expect(signals[0].severity).toBe('high')
    expect(signals[0].evidence.direct_fact).toBe(true)
  })

  it('NETWORK_RAKE_NEGATIVE includes baseline when available', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: -500 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    expect(signals).toHaveLength(1)
    expect(signals[0].rule_id).toBe('NETWORK_RAKE_NEGATIVE')
    expect(signals[0].baseline_value).not.toBeNull()
  })

  it('NETWORK_RAKE_NEGATIVE and NETWORK_RAKE_DROP are not both fired for same day', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: -500 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    // Should only have RAKE_NEGATIVE, not RAKE_DROP
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_NEGATIVE')).toHaveLength(1)
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')).toHaveLength(0)
  })

  it('NETWORK_RAKE_DROP fires on warning threshold', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2, rakeDropWarningPct: 10, rakeDropCriticalPct: 50, zScoreWarning: 999, zScoreCritical: 999 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 1700 }), // -17% from baseline ~2050: triggers warning (delta > 10%), not critical (< 50%)
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const drops = signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')
    expect(drops.length).toBeGreaterThanOrEqual(1)
    expect(drops[0].severity).toBe('medium')
  })

  it('NETWORK_RAKE_DROP fires on critical threshold', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2, rakeDropCriticalPct: 20 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 1500 }), // -27% from baseline
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const drops = signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')
    expect(drops.length).toBeGreaterThanOrEqual(1)
    expect(drops[0].severity).toBe('high')
  })

  it('NETWORK_RAKE_DROP does not fire without sufficient baseline', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 10 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 100 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')).toHaveLength(0)
  })

  it('NETWORK_PAYOUT_ANOMALY fires on high payout', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, payoutWarningPct: 95, minBaselineDays: 1 }
    const days = [
      makeDay({ date: '2026-06-01', total_bet: 10000, total_won: 2000 }),
      makeDay({ date: '2026-06-02', total_bet: 10000, total_won: 9700 }), // 97% payout
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const payoutAnomalies = signals.filter(s => s.rule_id === 'NETWORK_PAYOUT_ANOMALY')
    expect(payoutAnomalies.length).toBeGreaterThanOrEqual(1)
  })

  it('priority score is higher for high severity', () => {
    const days = [makeDay({ date: '2026-06-01', total_rake: -500 })]
    const processed = preprocessNetwork(days)
    const signals = generateNetworkSignals(processed)
    expect(signals[0].priority_score).toBeGreaterThan(200) // high * 1.0 * 100 = 300
  })

  it('every signal has all required fields', () => {
    const days = [makeDay({ date: '2026-06-01', total_rake: -500 })]
    const processed = preprocessNetwork(days)
    const signals = generateNetworkSignals(processed)
    const s = signals[0]
    expect(s.id).toBeTruthy()
    expect(s.rule_id).toBeTruthy()
    expect(s.scope).toBe('network')
    expect(s.entity_id).toBeTruthy()
    expect(s.date).toBeTruthy()
    expect(s.category).toBeTruthy()
    expect(s.metric).toBeTruthy()
    expect(s.severity).toBeTruthy()
    expect(typeof s.current_value).toBe('number')
    expect(typeof s.confidence).toBe('number')
    expect(typeof s.priority_score).toBe('number')
    expect(s.title).toBeTruthy()
    expect(s.explanation).toBeTruthy()
    expect(s.recommended_action).toBeTruthy()
    expect(s.evidence.source).toBeTruthy()
    expect(typeof s.evidence.baseline_days).toBe('number')
    expect(typeof s.evidence.direct_fact).toBe('boolean')
  })
})

// ═══════════════════════════════════════════
// DECISION QUEUE
// ═══════════════════════════════════════════

describe('buildDecisionQueue', () => {
  it('deduplicates by rule_id+scope+entity_id, keeping highest priority', () => {
    const signals = [
      {
        id: 'sig-1',
        rule_id: 'NETWORK_RAKE_DROP',
        scope: 'network' as const,
        entity_id: 'network',
        date: '2026-06-01',
        category: 'warning' as const,
        metric: 'rake',
        severity: 'medium' as const,
        current_value: 1000,
        baseline_value: 2000,
        delta_pct: -50,
        z_score: -2,
        confidence: 1,
        priority_score: 200,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 5, direct_fact: false },
      },
      {
        id: 'sig-2',
        rule_id: 'NETWORK_RAKE_DROP',
        scope: 'network' as const,
        entity_id: 'network',
        date: '2026-06-02',
        category: 'critical' as const,
        metric: 'rake',
        severity: 'high' as const,
        current_value: 500,
        baseline_value: 2000,
        delta_pct: -75,
        z_score: -3,
        confidence: 1,
        priority_score: 300,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 5, direct_fact: false },
      },
    ]
    const queue = buildDecisionQueue(signals)
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('sig-2') // higher priority kept
  })

  it('sorts by priority_score descending', () => {
    const signals = [
      {
        id: 'low', rule_id: 'R1', scope: 'network' as const, entity_id: 'n1',
        date: '2026-06-01', category: 'info' as const, metric: 'm', severity: 'low' as const,
        current_value: 1, baseline_value: 1, delta_pct: 0, z_score: 0, confidence: 1, priority_score: 100,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 1, direct_fact: false },
      },
      {
        id: 'high', rule_id: 'R2', scope: 'network' as const, entity_id: 'n1',
        date: '2026-06-01', category: 'critical' as const, metric: 'm', severity: 'high' as const,
        current_value: 1, baseline_value: 1, delta_pct: 0, z_score: 0, confidence: 1, priority_score: 300,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 1, direct_fact: false },
      },
    ]
    const queue = buildDecisionQueue(signals)
    expect(queue[0].id).toBe('high')
    expect(queue[1].id).toBe('low')
  })

  it('applies limit correctly', () => {
    const signals: DecisionSignal[] = []
    for (let i = 0; i < 20; i++) {
      signals.push({
        id: `sig-${i}`, rule_id: `R${i}`, scope: 'network' as const, entity_id: `e${i}`,
        date: '2026-06-01', category: 'info' as const, metric: 'm', severity: 'low' as const,
        current_value: i, baseline_value: 0, delta_pct: 0, z_score: 0, confidence: 1, priority_score: 100 - i,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 1, direct_fact: false },
      })
    }
    const queue = buildDecisionQueue(signals, 5)
    expect(queue).toHaveLength(5)
  })

  it('does not mutate input array', () => {
    const signals = [
      {
        id: 'sig-1', rule_id: 'R1', scope: 'network' as const, entity_id: 'n1',
        date: '2026-06-01', category: 'info' as const, metric: 'm', severity: 'low' as const,
        current_value: 1, baseline_value: 1, delta_pct: 0, z_score: 0, confidence: 1, priority_score: 100,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 1, direct_fact: false },
      },
    ]
    const original = [...signals]
    buildDecisionQueue(signals)
    expect(signals).toEqual(original)
  })

  it('empty input returns empty array', () => {
    expect(buildDecisionQueue([])).toEqual([])
  })
})
