import { describe, it, expect } from 'vitest'
import {
  validateNetworkObservations,
  preprocessNetwork,
  generateNetworkSignals,
  buildDecisionQueue,
  DEFAULT_PREPROCESSING_CONFIG,
  type NetworkDailyObservation,
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

function stableDays(n: number, startDate = '2026-06-01'): NetworkDailyObservation[] {
  const days: NetworkDailyObservation[] = []
  const base = new Date(startDate + 'T12:00:00Z')
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i)
    days.push(makeDay({ date: d.toISOString().slice(0, 10) }))
  }
  return days
}

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

  it('rejects negative total_bet', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', total_bet: -100 })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INVALID_DOMAIN_VALUE')
  })

  it('rejects negative total_won', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', total_won: -100 })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INVALID_DOMAIN_VALUE')
  })

  it('rejects negative active_players', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', active_players: -5 })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INVALID_DOMAIN_VALUE')
  })

  it('rejects non-integer active_players', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', active_players: 5.5 })])
    expect(valid).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('INVALID_DOMAIN_VALUE')
  })

  it('accepts negative rake (valid domain)', () => {
    const { valid, errors } = validateNetworkObservations([makeDay({ date: '2026-06-01', total_rake: -500 })])
    expect(valid).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(valid[0].total_rake).toBe(-500)
  })

  it('detects and removes duplicate dates (keeps first)', () => {
    const raw = [
      makeDay({ date: '2026-06-01', total_rake: 100 }),
      makeDay({ date: '2026-06-01', total_rake: 200 }),
      makeDay({ date: '2026-06-02', total_rake: 300 }),
    ]
    const { valid, errors } = validateNetworkObservations(raw)
    expect(valid).toHaveLength(2)
    expect(valid[0].total_rake).toBe(100)
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

  it('payout is null when total_bet is 0', () => {
    const days = [makeDay({ date: '2026-06-01', total_bet: 0, total_won: 100 })]
    const result = preprocessNetwork(days)
    expect(result[0].payout_pct).toBeNull()
    expect(result[0].payout_delta_pct).toBeNull()
    expect(result[0].payout_z_score).toBeNull()
    expect(result[0].payout_baseline).toBeNull()
  })

  it('payout baseline excludes bet=0 days', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 1 }
    const days = [
      makeDay({ date: '2026-06-01', total_bet: 0, total_won: 0 }),
      makeDay({ date: '2026-06-02', total_bet: 1000, total_won: 900 }), // 90% payout
      makeDay({ date: '2026-06-03', total_bet: 1000, total_won: 920 }), // 92% payout
    ]
    const result = preprocessNetwork(days, config)
    // Day 2 baseline: [day1 payout=null → excluded, day2 payout=90%]. mean=90
    expect(result[2].payout_baseline).toBe(90)
    expect(result[2].payout_delta_pct).toBeCloseTo(2.2, 0) // (92-90)/90*100
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
      makeDay({ date: '2026-06-02', total_rake: 1600 }),
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
    expect(result[1].rake_baseline).toBe(100)
    expect(result[1].rake_delta_pct).toBe(100)
  })

  it('baseline respects windowDays limit', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, baselineWindowDays: 2, minBaselineDays: 1 }
    const days = stableDays(5)
    const result = preprocessNetwork(days, config)
    expect(result[4].baseline_days).toBeLessThanOrEqual(2)
  })

  it('empty input returns empty array', () => {
    expect(preprocessNetwork([])).toEqual([])
  })

  it('confidence scales with baseline days', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 5 }
    const days = stableDays(4)
    const result = preprocessNetwork(days, config)
    expect(result[3].confidence).toBeCloseTo(0.6, 1)
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
    expect(signals[0].evidence.baseline_days).toBe(0)
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
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_NEGATIVE')).toHaveLength(1)
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')).toHaveLength(0)
  })

  it('NETWORK_RAKE_DROP: delta negative over warning → medium', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2, rakeDropWarningPct: 10, rakeDropCriticalPct: 50, zScoreWarning: 999, zScoreCritical: 999 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 1700 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const drops = signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')
    expect(drops.length).toBeGreaterThanOrEqual(1)
    expect(drops[0].severity).toBe('medium')
  })

  it('NETWORK_RAKE_DROP: delta negative over critical → high', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2, rakeDropCriticalPct: 20, zScoreWarning: 999, zScoreCritical: 999 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 1500 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const drops = signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')
    expect(drops.length).toBeGreaterThanOrEqual(1)
    expect(drops[0].severity).toBe('high')
  })

  it('NETWORK_RAKE_DROP: rake increase (+50%) → no signal', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 3000 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')).toHaveLength(0)
  })

  it('NETWORK_RAKE_DROP: high positive z-score → no signal', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: 4000 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    // z-score is highly positive (good), should NOT fire RAKE_DROP
    expect(signals.filter(s => s.rule_id === 'NETWORK_RAKE_DROP')).toHaveLength(0)
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
      makeDay({ date: '2026-06-02', total_bet: 10000, total_won: 9700 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const payoutAnomalies = signals.filter(s => s.rule_id === 'NETWORK_PAYOUT_ANOMALY')
    expect(payoutAnomalies.length).toBeGreaterThanOrEqual(1)
  })

  it('NETWORK_PAYOUT_ANOMALY: payout under absolute threshold but z-score high → still fires', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, payoutWarningPct: 200, zScoreWarning: 1.0, zScoreCritical: 3, minBaselineDays: 2 }
    const days = [
      makeDay({ date: '2026-06-01', total_bet: 10000, total_won: 9000 }),
      makeDay({ date: '2026-06-02', total_bet: 10000, total_won: 9100 }),
      makeDay({ date: '2026-06-03', total_bet: 10000, total_won: 9500 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    const anomalies = signals.filter(s => s.rule_id === 'NETWORK_PAYOUT_ANOMALY')
    expect(anomalies.length).toBeGreaterThanOrEqual(1)
    // Fired via z-score, not direct threshold
    expect(anomalies[0].evidence.direct_fact).toBe(false)
  })

  it('NETWORK_PAYOUT_ANOMALY: bet=0 produces null payout → no signal', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, payoutWarningPct: 50, minBaselineDays: 1 }
    const days = [
      makeDay({ date: '2026-06-01', total_bet: 0, total_won: 0 }),
      makeDay({ date: '2026-06-02', total_bet: 0, total_won: 0 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    expect(signals.filter(s => s.rule_id === 'NETWORK_PAYOUT_ANOMALY')).toHaveLength(0)
  })

  it('IDs are deterministic (same input → same ID)', () => {
    const days = [makeDay({ date: '2026-06-17', total_rake: -500 })]
    const processed1 = preprocessNetwork(days)
    const signals1 = generateNetworkSignals(processed1)

    const processed2 = preprocessNetwork(days)
    const signals2 = generateNetworkSignals(processed2)

    expect(signals1).toHaveLength(signals2.length)
    expect(signals1[0].id).toBe(signals2[0].id)
    expect(signals1[0].id).toBe('NETWORK_RAKE_NEGATIVE:network:network:2026-06-17')
  })

  it('IDs are stable regardless of execution order', () => {
    const days1 = [makeDay({ date: '2026-06-01', total_rake: -100 })]
    const days2 = [makeDay({ date: '2026-06-02', total_rake: -200 })]

    const s1 = generateNetworkSignals(preprocessNetwork(days1))
    const s2 = generateNetworkSignals(preprocessNetwork(days2))

    // IDs should be based on date, not on global counter
    expect(s1[0].id).toContain('2026-06-01')
    expect(s2[0].id).toContain('2026-06-02')
  })

  it('baseline_days in evidence is real count even when baseline insufficient', () => {
    const config = { ...DEFAULT_PREPROCESSING_CONFIG, minBaselineDays: 10 }
    const days = [
      makeDay({ date: '2026-06-01', total_rake: 2000 }),
      makeDay({ date: '2026-06-02', total_rake: 2100 }),
      makeDay({ date: '2026-06-03', total_rake: -500 }),
    ]
    const processed = preprocessNetwork(days, config)
    const signals = generateNetworkSignals(processed, config)
    expect(signals[0].rule_id).toBe('NETWORK_RAKE_NEGATIVE')
    expect(signals[0].baseline_value).toBeNull()
    expect(signals[0].delta_pct).toBeNull()
    expect(signals[0].evidence.baseline_days).toBe(2) // real count, not 0
  })

  it('priority score is higher for high severity', () => {
    const days = [makeDay({ date: '2026-06-01', total_rake: -500 })]
    const processed = preprocessNetwork(days)
    const signals = generateNetworkSignals(processed)
    expect(signals[0].priority_score).toBeGreaterThan(200)
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
    const signals = makeTwoSignals('NETWORK_RAKE_DROP', 200, 300)
    const queue = buildDecisionQueue(signals)
    expect(queue).toHaveLength(1)
    expect(queue[0].priority_score).toBe(300)
  })

  it('tie-break: same priority_score keeps most recent date', () => {
    const sig1 = makeSignal('NETWORK_RAKE_DROP', '2026-06-01', 300)
    const sig2 = makeSignal('NETWORK_RAKE_DROP', '2026-06-05', 300)
    const queue = buildDecisionQueue([sig1, sig2])
    expect(queue).toHaveLength(1)
    expect(queue[0].date).toBe('2026-06-05')
  })

  it('sorts by priority_score descending', () => {
    const sig1 = makeSignal('R1', '2026-06-01', 100)
    const sig2 = makeSignal('R2', '2026-06-01', 300)
    const queue = buildDecisionQueue([sig1, sig2])
    expect(queue[0].priority_score).toBe(300)
    expect(queue[1].priority_score).toBe(100)
  })

  it('applies limit correctly', () => {
    const signals: DecisionSignal[] = []
    for (let i = 0; i < 20; i++) {
      signals.push(makeSignal(`R${i}`, '2026-06-01', 100 - i))
    }
    const queue = buildDecisionQueue(signals, 5)
    expect(queue).toHaveLength(5)
  })

  it('limit <= 0 returns empty array', () => {
    const signals = [makeSignal('R1', '2026-06-01', 100)]
    expect(buildDecisionQueue(signals, 0)).toEqual([])
    expect(buildDecisionQueue(signals, -1)).toEqual([])
  })

  it('does not mutate input array', () => {
    const signals = [makeSignal('R1', '2026-06-01', 100)]
    const original = [...signals]
    buildDecisionQueue(signals)
    expect(signals).toEqual(original)
  })

  it('empty input returns empty array', () => {
    expect(buildDecisionQueue([])).toEqual([])
  })
})

// ─── Signal helpers ───

function makeSignal(ruleId: string, date: string, priorityScore: number): DecisionSignal {
  return {
    id: `${ruleId}:network:network:${date}`,
    rule_id: ruleId,
    scope: 'network',
    entity_id: 'network',
    date,
    category: 'warning',
    metric: 'rake',
    severity: 'medium',
    current_value: 1000,
    baseline_value: 2000,
    delta_pct: -50,
    z_score: -2,
    confidence: 1,
    priority_score: priorityScore,
    title: 'x',
    explanation: 'x',
    recommended_action: 'x',
    evidence: { source: 'x', baseline_days: 5, direct_fact: false },
  }
}

function makeTwoSignals(ruleId: string, low: number, high: number): DecisionSignal[] {
  return [
    makeSignal(ruleId, '2026-06-01', low),
    makeSignal(ruleId, '2026-06-02', high),
  ]
}
