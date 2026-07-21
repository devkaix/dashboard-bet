import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatCompact, convertSignalsToAlerts, buildBriefingFromSignals, buildNetworkDecisionPipeline, type Rankings } from './data';
import {
  validateNetworkObservations,
  preprocessNetwork,
  generateNetworkSignals,
  buildDecisionQueue,
  DEFAULT_PREPROCESSING_CONFIG,
  type DecisionSignal,
  type NetworkDailyObservation,
} from './preprocessing';

describe('formatting utilities', () => {
  it('formats currency with EUR symbol and two decimals', () => {
    const formatted = formatCurrency(1234.56);
    expect(formatted).toContain('€');
    expect(formatted).toMatch(/1[\s.\u202f\u00A0]?234[,.]56/);
    expect(formatCurrency(0)).toMatch(/0[,.]00/);
    expect(formatCurrency(-100)).toMatch(/-100[,.]00/);
  });

  it('formats percent in Italian locale', () => {
    expect(formatPercent(12.5)).toMatch(/12[,.]5%/);
    expect(formatPercent(0)).toMatch(/0[,.]0%/);
  });

  it('formats compact numbers', () => {
    expect(formatCompact(1500)).toMatch(/1[,.]5/);
    expect(formatCompact(1000000)).toMatch(/1/);
  });
});

// ─── Integration: DailyKPI → preprocessing pipeline end-to-end ───

describe('preprocessing integration', () => {
  function makeKpi(date: string, rake: number, bet: number, won: number, active: number) {
    return {
      date,
      total_buy_in: 0,
      total_bet: bet,
      total_won: won,
      total_rake: rake,
      avg_payout: bet > 0 ? (won / bet) * 100 : 0,
      active_players: active,
      total_bets_count: 0,
    };
  }

  it('DailyKPI → NetworkObservation explicit mapping preserves all values', () => {
    const kpi = makeKpi('2026-06-15', 2000, 20000, 18000, 25);
    const obs: NetworkDailyObservation = {
      date: kpi.date,
      total_rake: kpi.total_rake,
      total_bet: kpi.total_bet,
      total_won: kpi.total_won,
      active_players: kpi.active_players,
    };
    expect(obs.date).toBe('2026-06-15');
    expect(obs.total_rake).toBe(2000);
    expect(obs.total_bet).toBe(20000);
    expect(obs.total_won).toBe(18000);
    expect(obs.active_players).toBe(25);
  })

  it('validation rejects invalid rows, preprocessing uses only valid', () => {
    const kpis = [
      makeKpi('2026-06-01', 2000, 20000, 18000, 25),
      makeKpi('invalid', 2000, 20000, 18000, 25), // invalid date
      makeKpi('2026-06-02', 2000, 20000, 18000, 25),
      makeKpi('2026-06-02', 2000, 20000, 18000, 25), // duplicate
    ];
    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date,
      total_rake: dk.total_rake,
      total_bet: dk.total_bet,
      total_won: dk.total_won,
      active_players: dk.active_players,
    }));
    const validation = validateNetworkObservations(observations);
    // 1 invalid date + 1 duplicate = 2 errors, 2 valid
    expect(validation.valid).toHaveLength(2);
    expect(validation.errors).toHaveLength(2);

    const processed = preprocessNetwork(validation.valid);
    expect(processed).toHaveLength(2);
    expect(processed.map(d => d.date)).toEqual(['2026-06-01', '2026-06-02']);
  })

  it('full pipeline produces signals from real-style data', () => {
    const kpis: Array<ReturnType<typeof makeKpi>> = [];
    for (let d = 1; d <= 10; d++) {
      kpis.push(makeKpi(`2026-06-${String(d).padStart(2, '0')}`, 2000, 20000, 18000, 25));
    }
    // Day 11 has negative rake
    kpis.push(makeKpi('2026-06-11', -500, 15000, 15500, 20));

    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date,
      total_rake: dk.total_rake,
      total_bet: dk.total_bet,
      total_won: dk.total_won,
      active_players: dk.active_players,
    }));
    const validation = validateNetworkObservations(observations);
    expect(validation.errors).toHaveLength(0);
    expect(validation.valid).toHaveLength(11);

    const processed = preprocessNetwork(validation.valid);
    const signals = generateNetworkSignals(processed);

    // Should have NETWORK_RAKE_NEGATIVE for day 11
    const negSignals = signals.filter(s => s.rule_id === 'NETWORK_RAKE_NEGATIVE');
    expect(negSignals).toHaveLength(1);
    expect(negSignals[0].date).toBe('2026-06-11');
    expect(negSignals[0].severity).toBe('high');

    // Queue should contain the negative rake signal
    const queue = buildDecisionQueue(signals, 10);
    expect(queue.length).toBeGreaterThanOrEqual(1);
    expect(queue[0].rule_id).toBe('NETWORK_RAKE_NEGATIVE');
  })

  it('signals have deterministic string IDs', () => {
    const kpis = [
      makeKpi('2026-06-01', 2000, 20000, 18000, 25),
      makeKpi('2026-06-02', -100, 10000, 10100, 10),
    ];
    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date,
      total_rake: dk.total_rake,
      total_bet: dk.total_bet,
      total_won: dk.total_won,
      active_players: dk.active_players,
    }));
    const processed = preprocessNetwork(validateNetworkObservations(observations).valid);
    const signals1 = generateNetworkSignals(processed);
    const signals2 = generateNetworkSignals(preprocessNetwork(validateNetworkObservations(observations).valid));
    expect(signals1[0].id).toBe(signals2[0].id);
    expect(typeof signals1[0].id).toBe('string');
    expect(signals1[0].id).toContain('NETWORK_RAKE_NEGATIVE');
    expect(signals1[0].id).toContain('2026-06-02');
  })

  it('decision queue present and deduplicated', () => {
    const kpis: Array<ReturnType<typeof makeKpi>> = [];
    for (let d = 1; d <= 10; d++) {
      kpis.push(makeKpi(`2026-06-${String(d).padStart(2, '0')}`, 2000, 20000, 18000, 25));
    }
    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date, total_rake: dk.total_rake, total_bet: dk.total_bet,
      total_won: dk.total_won, active_players: dk.active_players,
    }));
    const processed = preprocessNetwork(validateNetworkObservations(observations).valid);
    const signals = generateNetworkSignals(processed);
    const queue = buildDecisionQueue(signals, 5);
    // Queue should have at most 5 entries, each unique by rule+scope+entity
    expect(queue.length).toBeLessThanOrEqual(5);
    const keys = new Set(queue.map(s => `${s.rule_id}|${s.scope}|${s.entity_id}`));
    expect(keys.size).toBe(queue.length);
  })

  it('no player alerts generated (scope is always network)', () => {
    const kpis = [makeKpi('2026-06-01', -100, 10000, 10100, 10)];
    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date, total_rake: dk.total_rake, total_bet: dk.total_bet,
      total_won: dk.total_won, active_players: dk.active_players,
    }));
    const processed = preprocessNetwork(validateNetworkObservations(observations).valid);
    const signals = generateNetworkSignals(processed);
    for (const s of signals) {
      expect(s.scope).toBe('network');
      expect(s.entity_id).toBe('network');
    }
  })

  it('negative rake day count is accurate from signals', () => {
    const kpis = [
      makeKpi('2026-06-01', 2000, 20000, 18000, 25),
      makeKpi('2026-06-02', -100, 10000, 10100, 10),
      makeKpi('2026-06-03', -200, 10000, 10200, 10),
      makeKpi('2026-06-04', 2000, 20000, 18000, 25),
    ];
    const observations: NetworkDailyObservation[] = kpis.map(dk => ({
      date: dk.date, total_rake: dk.total_rake, total_bet: dk.total_bet,
      total_won: dk.total_won, active_players: dk.active_players,
    }));
    const processed = preprocessNetwork(validateNetworkObservations(observations).valid);
    const signals = generateNetworkSignals(processed);
    const negCount = signals.filter(s => s.rule_id === 'NETWORK_RAKE_NEGATIVE').length;
    expect(negCount).toBe(2);
  })
})

describe('convertSignalsToAlerts', () => {
  it('does not mutate input array', () => {
    const signals = [
      { id: 's1', rule_id: 'R1', scope: 'network' as const, entity_id: 'n1',
        date: '2026-06-01', category: 'critical' as const, metric: 'rake',
        severity: 'high' as const, current_value: -500, baseline_value: 2000,
        delta_pct: -25, z_score: -2.5, confidence: 1, priority_score: 300,
        title: 'x', explanation: 'x', recommended_action: 'x',
        evidence: { source: 'x', baseline_days: 5, direct_fact: true } },
    ];
    const original = [...signals];
    convertSignalsToAlerts(signals);
    expect(signals).toEqual(original);
  })

  it('copies all metadata fields from DecisionSignal', () => {
    const signals = [
      { id: 'sig-1', rule_id: 'NETWORK_RAKE_NEGATIVE', scope: 'network' as const, entity_id: 'network',
        date: '2026-06-17', category: 'critical' as const, metric: 'rake',
        severity: 'high' as const, current_value: -4603.42, baseline_value: 2000,
        delta_pct: -330, z_score: -3.5, confidence: 1, priority_score: 300,
        title: 'Rake negativo', explanation: 'Rake negativo il 2026-06-17',
        recommended_action: 'Aprire drill-down', evidence: { source: 'daily_network_stats', baseline_days: 5, direct_fact: true } },
    ];
    const alerts = convertSignalsToAlerts(signals);
    expect(alerts).toHaveLength(1);
    const a = alerts[0];
    expect(a.id).toBe('sig-1');
    expect(a.rule_id).toBe('NETWORK_RAKE_NEGATIVE');
    expect(a.recommended_action).toBe('Aprire drill-down');
    expect(a.confidence).toBe(1);
    expect(a.direct_fact).toBe(true);
    expect(a.scope).toBe('network');
    expect(a.entity_id).toBe('network');
    expect(a.priority_score).toBe(300);
    expect(a.severity).toBe('high');
    expect(a.category).toBe('critical');
    expect(a.evidence.source).toBe('daily_network_stats');
    expect(a.evidence.baseline_days).toBe(5);
    expect(a.evidence.direct_fact).toBe(true);
  })

  it('preserves severity and sets correct category', () => {
    const sigHigh = { id: 'h', rule_id: 'R', scope: 'network' as const, entity_id: 'n', date: '2026-06-01',
      category: 'critical' as const, metric: 'rake', severity: 'high' as const, current_value: 1,
      baseline_value: 1, delta_pct: 0, z_score: 0, confidence: 1, priority_score: 300,
      title: 'x', explanation: 'x', recommended_action: 'x', evidence: { source: 'x', baseline_days: 1, direct_fact: false } } as const;
    const sigMed = { ...sigHigh, id: 'm', severity: 'medium' as const, category: 'warning' as const, priority_score: 200 };
    const sigLow = { ...sigHigh, id: 'l', severity: 'low' as const, category: 'warning' as const, priority_score: 100 };
    const alerts = convertSignalsToAlerts([sigHigh, sigMed, sigLow]);
    expect(alerts.find(a => a.id === 'h')?.severity).toBe('high');
    expect(alerts.find(a => a.id === 'h')?.category).toBe('critical');
    expect(alerts.find(a => a.id === 'm')?.severity).toBe('medium');
    expect(alerts.find(a => a.id === 'm')?.category).toBe('warning');
    expect(alerts.find(a => a.id === 'l')?.severity).toBe('low');
    expect(alerts.find(a => a.id === 'l')?.category).toBe('warning');
  })
})

describe('buildBriefingFromSignals', () => {
  it('receives rankings as parameter (no cachedData dependency)', () => {
    const signals: DecisionSignal[] = [];
    const queue: DecisionSignal[] = [];
    const rankings: Rankings = { top_players_by_rake: [], top_players_by_bet: [], top_pvrs: [] };
    const briefing = buildBriefingFromSignals(signals, queue, rankings);
    expect(briefing.criticals).toEqual([]);
    expect(briefing.opportunities).toEqual([]);
    expect(briefing.suggestions).toEqual([]);
  })

  it('creates opportunity from ranking data when available', () => {
    const signals: DecisionSignal[] = [];
    const queue: DecisionSignal[] = [];
    const rankings: Rankings = {
      top_players_by_rake: [{ rank: 1, username: 'TopPlayer', total_rake: 5000, total_bet: 50000, active_days: 20, pvr_id: null }],
      top_players_by_bet: [],
      top_pvrs: [],
    };
    const briefing = buildBriefingFromSignals(signals, queue, rankings);
    expect(briefing.opportunities).toHaveLength(1);
    expect(briefing.opportunities[0].title).toBe('Top player identificato');
  })

  it('handles null rankings gracefully', () => {
    const briefing = buildBriefingFromSignals([], [], null);
    expect(briefing.opportunities).toEqual([]);
  })
})

describe('buildNetworkDecisionPipeline', () => {
  it('July period uses June historical data as baseline', () => {
    // June historical data (3 days)
    const historical: NetworkDailyObservation[] = [
      { date: '2026-06-28', total_rake: 2000, total_bet: 20000, total_won: 18000, active_players: 25 },
      { date: '2026-06-29', total_rake: 2100, total_bet: 21000, total_won: 18900, active_players: 26 },
      { date: '2026-06-30', total_rake: 2050, total_bet: 20500, total_won: 18450, active_players: 24 },
    ];
    // July period (2 days)
    const period: NetworkDailyObservation[] = [
      { date: '2026-07-01', total_rake: 1950, total_bet: 19500, total_won: 17550, active_players: 23 },
      { date: '2026-07-02', total_rake: -500, total_bet: 5000, total_won: 5500, active_players: 10 },
    ];

    const pipeline = buildNetworkDecisionPipeline(historical, period, DEFAULT_PREPROCESSING_CONFIG, '2026-07-01', '2026-07-02');

    // Signals should only be from July
    const dates = pipeline.signals.map(s => s.date);
    expect(dates.every(d => d >= '2026-07-01')).toBe(true);
    expect(dates.every(d => d <= '2026-07-02')).toBe(true);

    // July 1 should have baseline from June
    const july1Signals = pipeline.signals.filter(s => s.date === '2026-07-01');
    // July 2 should have NETWORK_RAKE_NEGATIVE
    const july2Neg = pipeline.signals.filter(s => s.date === '2026-07-02' && s.rule_id === 'NETWORK_RAKE_NEGATIVE');
    expect(july2Neg).toHaveLength(1);
  })

  it('June signals never appear in July output', () => {
    const historical: NetworkDailyObservation[] = [
      { date: '2026-06-17', total_rake: -4600, total_bet: 50000, total_won: 54600, active_players: 30 },
    ];
    const period: NetworkDailyObservation[] = [
      { date: '2026-07-01', total_rake: 2000, total_bet: 20000, total_won: 18000, active_players: 25 },
    ];
    const pipeline = buildNetworkDecisionPipeline(historical, period, DEFAULT_PREPROCESSING_CONFIG, '2026-07-01', '2026-07-01');
    // No signal from June should appear
    expect(pipeline.signals.every(s => s.date >= '2026-07-01')).toBe(true);
    expect(pipeline.signals.find(s => s.date === '2026-06-17')).toBeUndefined();
  })

  it('historical lookback with 14 records but fewer calendar days works', () => {
    const historical: NetworkDailyObservation[] = [];
    // 14 days of data but within a short calendar window
    for (let i = 1; i <= 14; i++) {
      historical.push({ date: `2026-06-${String(17 + i - 1).padStart(2, '0')}`, total_rake: 2000, total_bet: 20000, total_won: 18000, active_players: 25 });
    }
    const period: NetworkDailyObservation[] = [
      { date: '2026-07-01', total_rake: 1500, total_bet: 15000, total_won: 13500, active_players: 20 },
    ];
    const pipeline = buildNetworkDecisionPipeline(historical, period, DEFAULT_PREPROCESSING_CONFIG, '2026-07-01', '2026-07-01');
    // Signal from July 1 should exist (rake drop from 2000 to 1500 = -25% > warning 20%)
    expect(pipeline.signals.some(s => s.date === '2026-07-01')).toBe(true);
    // No June signals exposed
    expect(pipeline.signals.every(s => s.date >= '2026-07-01')).toBe(true);
  })

  it('does not mutate input arrays', () => {
    const historical: NetworkDailyObservation[] = [
      { date: '2026-06-01', total_rake: 2000, total_bet: 20000, total_won: 18000, active_players: 25 },
    ];
    const period: NetworkDailyObservation[] = [
      { date: '2026-07-01', total_rake: 2000, total_bet: 20000, total_won: 18000, active_players: 25 },
    ];
    const histCopy = [...historical];
    const periodCopy = [...period];
    buildNetworkDecisionPipeline(historical, period, DEFAULT_PREPROCESSING_CONFIG, '2026-07-01', '2026-07-01');
    expect(historical).toEqual(histCopy);
    expect(period).toEqual(periodCopy);
  })

  it('validation errors are returned separately', () => {
    const historical: NetworkDailyObservation[] = [];
    const period: NetworkDailyObservation[] = [
      { date: 'invalid', total_rake: NaN, total_bet: -100, total_won: 0, active_players: 5.5 },
    ];
    const pipeline = buildNetworkDecisionPipeline(historical, period, DEFAULT_PREPROCESSING_CONFIG);
    expect(pipeline.validation.errors.length).toBeGreaterThan(0);
    // Invalid data should not generate signals
    expect(pipeline.signals).toHaveLength(0);
  })
})
