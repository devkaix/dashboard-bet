import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatCompact } from './data';
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
