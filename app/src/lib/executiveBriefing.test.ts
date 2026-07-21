import { describe, it, expect } from 'vitest'
import {
  aggregateNetworkPeriod,
  aggregatePvrPeriods,
  computePvrContributions,
  generateNetworkInsights,
  generatePvrInsights,
  deduplicateInsights,
  rankInsights,
  generatePriorities,
  generateExecutiveSummary,
  buildExecutiveBriefing,
  type NetworkPeriod,
  type PvrPeriod,
  type ExecutiveInsight,
} from './executiveBriefing'
import { DEFAULT_EXECUTIVE_BRIEFING_CONFIG } from './executiveBriefingConfig'

const cfg = DEFAULT_EXECUTIVE_BRIEFING_CONFIG

function network(
  month: string,
  rake: number,
  bet: number,
  won: number,
  opts?: Partial<NetworkPeriod>,
): NetworkPeriod {
  return {
    month,
    start: `${month}-01`,
    end: `${month}-30`,
    rake,
    bet,
    won,
    refund: 0,
    payout: bet > 0 ? (won / bet) * 100 : 0,
    days: opts?.days ?? 30,
    negativeRakeDays: opts?.negativeRakeDays ?? 0,
    worstDay: opts?.worstDay ?? null,
    dailyRake: opts?.dailyRake ?? [],
  }
}

function pvr(
  id: string,
  name: string,
  rake: number,
  bet: number,
  won: number,
  opts?: Partial<PvrPeriod>,
): PvrPeriod {
  return {
    pvrId: id,
    pvrName: name,
    pvrExalogicId: id,
    rake,
    bet,
    won,
    refund: 0,
    payout: bet > 0 ? (won / bet) * 100 : 0,
    days: opts?.days ?? 30,
    negativeRakeDays: opts?.negativeRakeDays ?? 0,
  }
}

function availability(
  currentMonth: string,
  previousMonth: string | null,
  opts?: { confidence?: 'high' | 'medium' | 'low'; currentCoveragePct?: number },
) {
  return {
    currentMonth,
    previousMonth,
    currentCoveragePct: opts?.currentCoveragePct ?? 1,
    previousCoveragePct: previousMonth ? 1 : 0,
    currentDaysPresent: 30,
    previousDaysPresent: previousMonth ? 30 : 0,
    currentExpectedDays: 30,
    previousExpectedDays: previousMonth ? 30 : 0,
    comparisonAvailable: !!previousMonth,
    lastUploadDate: null,
    networkRake: 10000,
    pvrRakeSum: 10000,
    reconciliationDiffPct: 0,
    confidence: opts?.confidence ?? 'high',
    notes: [],
  }
}

describe('aggregateNetworkPeriod', () => {
  it('sums daily rows into monthly totals', () => {
    const p = aggregateNetworkPeriod('2026-06', '2026-06-01', '2026-06-30', [
      { date: '2026-06-01', rake: 100, bet: 500, won: 400, refund: 0 },
      { date: '2026-06-02', rake: 200, bet: 600, won: 500, refund: 0 },
    ])
    expect(p.rake).toBe(300)
    expect(p.bet).toBe(1100)
    expect(p.won).toBe(900)
    expect(p.payout).toBeCloseTo((900 / 1100) * 100)
  })

  it('detects negative rake days', () => {
    const p = aggregateNetworkPeriod('2026-06', '2026-06-01', '2026-06-30', [
      { date: '2026-06-01', rake: -10, bet: 500, won: 600, refund: 0 },
      { date: '2026-06-02', rake: 100, bet: 500, won: 400, refund: 0 },
    ])
    expect(p.negativeRakeDays).toBe(1)
    expect(p.worstDay).toEqual({ date: '2026-06-01', rake: -10 })
  })
})

describe('aggregatePvrPeriods', () => {
  it('aggregates per PVR', () => {
    const pvrs = aggregatePvrPeriods([
      { date: '2026-06-01', pvr_id: 'A', pvrs: { name: 'Alpha', exalogic_id: '1' }, rake: 100, bet: 500, won: 400, refund: 0 },
      { date: '2026-06-02', pvr_id: 'A', pvrs: { name: 'Alpha', exalogic_id: '1' }, rake: 50, bet: 300, won: 250, refund: 0 },
      { date: '2026-06-01', pvr_id: 'B', pvrs: { name: 'Beta', exalogic_id: '2' }, rake: 200, bet: 800, won: 700, refund: 0 },
    ])
    expect(pvrs).toHaveLength(2)
    const alpha = pvrs.find((p) => p.pvrId === 'A')!
    expect(alpha.rake).toBe(150)
    expect(alpha.days).toBe(2)
  })
})

describe('computePvrContributions', () => {
  it('attributes decline using gross decline shares', () => {
    const current = [pvr('A', 'Alpha', 800, 0, 0), pvr('B', 'Beta', 1200, 0, 0)]
    const previous = [pvr('A', 'Alpha', 1000, 0, 0), pvr('B', 'Beta', 1000, 0, 0)]
    const netCurrent = network('2026-06', 2000, 0, 0)
    const netPrevious = network('2026-05', 2000, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const a = contribs.find((c) => c.pvrId === 'A')!
    const b = contribs.find((c) => c.pvrId === 'B')!
    expect(a.negativeImpact).toBe(200)
    expect(b.positiveOffset).toBe(200)
    expect(a.shareOfGrossDecline).toBe(1) // only A declined
    expect(b.shareOfGrossDecline).toBeNull()
  })

  it('detects PVRs present previously but missing now', () => {
    const current = [pvr('A', 'Alpha', 1000, 0, 0)]
    const previous = [pvr('B', 'Beta', 500, 0, 0)]
    const netCurrent = network('2026-06', 1000, 0, 0)
    const netPrevious = network('2026-05', 1500, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const b = contribs.find((c) => c.pvrId === 'B')!
    expect(b.currentRake).toBe(0)
    expect(b.negativeImpact).toBe(500)
    expect(b.isInactive).toBe(true)
  })
})

describe('generateNetworkInsights', () => {
  it('produces rake growth insight', () => {
    const current = network('2026-06', 12000, 100000, 90000)
    const previous = network('2026-05', 10000, 90000, 80000)
    const insights = generateNetworkInsights(current, previous, availability('2026-06', '2026-05'), cfg)
    const rake = insights.find((i) => i.category === 'network_performance' && i.title.includes('Rake'))
    expect(rake).toBeDefined()
    expect(rake!.deltaPct).toBeCloseTo(0.2)
    expect(rake!.severity).toBe('info')
  })

  it('produces rake decline insight', () => {
    const current = network('2026-06', 8000, 90000, 80000)
    const previous = network('2026-05', 10000, 100000, 90000)
    const insights = generateNetworkInsights(current, previous, availability('2026-06', '2026-05'), cfg)
    const rake = insights.find((i) => i.category === 'network_performance' && i.title.includes('calo'))
    expect(rake).toBeDefined()
    expect(rake!.severity).toBe('warning')
  })

  it('does not treat missing previous month as zero', () => {
    const current = network('2026-06', 10000, 100000, 90000)
    const insights = generateNetworkInsights(current, null, availability('2026-06', null), cfg)
    expect(insights.some((i) => i.category === 'network_performance')).toBe(false)
  })

  it('produces negative rake days insight', () => {
    const current = network('2026-06', 10000, 100000, 90000, { negativeRakeDays: 3, worstDay: { date: '2026-06-17', rake: -500 } })
    const insights = generateNetworkInsights(current, null, availability('2026-06', null), cfg)
    const neg = insights.find((i) => i.category === 'negative_rake')
    expect(neg).toBeDefined()
    expect(neg!.currentValue).toBe(3)
    expect(neg!.severity).toBe('critical')
  })

  it('produces payout change insight only with sufficient volume', () => {
    const current = network('2026-06', 10000, 50000, 45000)
    const previous = network('2026-05', 10000, 50000, 40000)
    const insights = generateNetworkInsights(current, previous, availability('2026-06', '2026-05'), cfg)
    const payout = insights.find((i) => i.category === 'payout_change')
    expect(payout).toBeDefined()
  })

  it('skips payout change when volume is too low', () => {
    const current = network('2026-06', 100, 500, 450)
    const previous = network('2026-05', 100, 500, 400)
    const insights = generateNetworkInsights(current, previous, availability('2026-06', '2026-05'), cfg)
    expect(insights.some((i) => i.category === 'payout_change')).toBe(false)
  })

  it('flags low confidence when previous month is missing', () => {
    const current = network('2026-06', 10000, 100000, 90000)
    const insights = generateNetworkInsights(current, null, availability('2026-06', null, { confidence: 'low' }), cfg)
    const dq = insights.find((i) => i.category === 'data_quality')
    expect(dq).toBeDefined()
    expect(dq!.confidence).toBe('low')
  })
})

describe('generatePvrInsights', () => {
  it('produces decline concentration insight', () => {
    const current = [pvr('A', 'Alpha', 800, 0, 0), pvr('B', 'Beta', 1200, 0, 0)]
    const previous = [pvr('A', 'Alpha', 1000, 0, 0), pvr('B', 'Beta', 1000, 0, 0)]
    const netCurrent = network('2026-06', 2000, 0, 0)
    const netPrevious = network('2026-05', 2000, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const insights = generatePvrInsights(contribs, netCurrent, netPrevious, availability('2026-06', '2026-05'), cfg)
    expect(insights.some((i) => i.category === 'decline_concentration')).toBe(true)
  })

  it('excludes growth on economically irrelevant PVRs', () => {
    const current = [pvr('A', 'Alpha', 10, 0, 0)]
    const previous = [pvr('A', 'Alpha', 1, 0, 0)]
    const netCurrent = network('2026-06', 10, 0, 0)
    const netPrevious = network('2026-05', 1, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const insights = generatePvrInsights(contribs, netCurrent, netPrevious, availability('2026-06', '2026-05'), cfg)
    expect(insights.some((i) => i.category === 'pvr_growth')).toBe(false)
  })

  it('produces PVR decline insight', () => {
    const current = [pvr('A', 'Alpha', 500, 0, 0)]
    const previous = [pvr('A', 'Alpha', 1000, 0, 0)]
    const netCurrent = network('2026-06', 500, 0, 0)
    const netPrevious = network('2026-05', 1000, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const insights = generatePvrInsights(contribs, netCurrent, netPrevious, availability('2026-06', '2026-05'), cfg)
    expect(insights.some((i) => i.category === 'pvr_decline')).toBe(true)
  })

  it('produces inactivity insight', () => {
    const current = [pvr('A', 'Alpha', 0, 0, 0)]
    const previous = [pvr('A', 'Alpha', 500, 0, 0)]
    const netCurrent = network('2026-06', 0, 0, 0)
    const netPrevious = network('2026-05', 500, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const insights = generatePvrInsights(contribs, netCurrent, netPrevious, availability('2026-06', '2026-05'), cfg)
    expect(insights.some((i) => i.category === 'pvr_inactivity')).toBe(true)
  })
})

describe('deduplication and ranking', () => {
  it('deduplicates insights by entity/category/month keeping highest priority', () => {
    const current = [pvr('A', 'Alpha', 500, 0, 0)]
    const previous = [pvr('A', 'Alpha', 1000, 0, 0)]
    const netCurrent = network('2026-06', 500, 0, 0)
    const netPrevious = network('2026-05', 1000, 0, 0)
    const contribs = computePvrContributions(current, previous, netCurrent, netPrevious, cfg)
    const raw = generatePvrInsights(contribs, netCurrent, netPrevious, availability('2026-06', '2026-05'), cfg)
    const deduped = deduplicateInsights(raw)
    expect(deduped.length).toBeLessThanOrEqual(raw.length)
  })

  it('ranks insights by priority score', () => {
    const insights = [
      { priorityScore: 10, economicImpact: 100, title: 'B' },
      { priorityScore: 20, economicImpact: 50, title: 'A' },
    ] as unknown as Parameters<typeof rankInsights>[0]
    expect(rankInsights(insights)[0].title).toBe('A')
  })

  it('limits insights to 10', () => {
    const insights = Array.from({ length: 15 }, (_, i) => ({
      priorityScore: i,
      economicImpact: i,
      title: `Insight ${i}`,
    })) as unknown as ExecutiveInsight[]
    const ranked = rankInsights(insights).slice(0, cfg.ranking.maxInsights)
    expect(ranked.length).toBe(10)
  })
})

describe('priorities', () => {
  it('generates max 3 priorities', () => {
    const insights = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      severity: i % 2 === 0 ? 'critical' : 'warning',
      priorityScore: 100 - i,
      economicImpact: 1000,
      entity: 'pvr',
      entityId: `pvr-${i}`,
      entityName: `PVR ${i}`,
      suggestedAction: 'contattare il PVR',
      confidence: 'high',
      drilldownUrl: `/pvr/pvr-${i}`,
    })) as unknown as ExecutiveInsight[]
    const priorities = generatePriorities(insights, cfg)
    expect(priorities.length).toBeLessThanOrEqual(3)
  })

  it('does not duplicate same entity', () => {
    const insights = [
      { id: 'i1', severity: 'critical', priorityScore: 100, economicImpact: 1000, entity: 'pvr', entityId: 'A', entityName: 'A', suggestedAction: 'x', confidence: 'high', drilldownUrl: '' },
      { id: 'i2', severity: 'critical', priorityScore: 90, economicImpact: 900, entity: 'pvr', entityId: 'A', entityName: 'A', suggestedAction: 'y', confidence: 'high', drilldownUrl: '' },
      { id: 'i3', severity: 'critical', priorityScore: 80, economicImpact: 800, entity: 'pvr', entityId: 'B', entityName: 'B', suggestedAction: 'z', confidence: 'high', drilldownUrl: '' },
    ] as unknown as ExecutiveInsight[]
    const priorities = generatePriorities(insights, cfg)
    expect(priorities.length).toBe(2)
    expect(priorities[0].sourceInsightIds).toContain('i1')
  })

  it('never suggests forbidden actions', () => {
    const insights = [
      { id: 'i1', severity: 'critical', priorityScore: 100, economicImpact: 1000, entity: 'pvr', entityId: 'A', entityName: 'A', suggestedAction: 'aumentare il fido', confidence: 'high', drilldownUrl: '' },
    ] as unknown as ExecutiveInsight[]
    const priorities = generatePriorities(insights, cfg)
    expect(priorities[0].action).not.toMatch(/fido/i)
  })
})

describe('executive summary', () => {
  it('produces max 3 sentences', () => {
    const current = network('2026-06', 10000, 100000, 90000)
    const previous = network('2026-05', 12000, 110000, 98000)
    const contribs = computePvrContributions([], [], current, previous, cfg)
    const priorities = generatePriorities([], cfg)
    const summary = generateExecutiveSummary(current, previous, contribs, priorities, availability('2026-06', '2026-05'), cfg)
    expect(summary.length).toBeLessThanOrEqual(3)
    expect(summary[0]).toMatch(/Rake/)
  })

  it('handles missing previous month', () => {
    const current = network('2026-06', 10000, 100000, 90000)
    const contribs = computePvrContributions([], [], current, null, cfg)
    const summary = generateExecutiveSummary(current, null, contribs, [], availability('2026-06', null), cfg)
    expect(summary.length).toBeGreaterThan(0)
    expect(summary[0]).toMatch(/confronto.*non è disponibile/)
  })
})

describe('buildExecutiveBriefing', () => {
  it('builds complete result for declining network', () => {
    const current = network('2026-06', 8000, 90000, 80000)
    const previous = network('2026-05', 10000, 100000, 90000)
    const pvrsCurrent = [pvr('A', 'Alpha', 3000, 0, 0), pvr('B', 'Beta', 5000, 0, 0)]
    const pvrsPrevious = [pvr('A', 'Alpha', 4000, 0, 0), pvr('B', 'Beta', 6000, 0, 0)]
    const result = buildExecutiveBriefing({
      currentMonth: '2026-06',
      previousMonth: '2026-05',
      networkCurrent: current,
      networkPrevious: previous,
      pvrsCurrent,
      pvrsPrevious,
      lastUploadDate: null,
    })
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.insights.length).toBeGreaterThan(0)
    expect(result.priorities.length).toBeGreaterThan(0)
    expect(result.pvrContributions.length).toBe(2)
  })

  it('does not modify input', () => {
    const current = network('2026-06', 8000, 90000, 80000)
    const previous = network('2026-05', 10000, 100000, 90000)
    const input = {
      currentMonth: '2026-06',
      previousMonth: '2026-05',
      networkCurrent: current,
      networkPrevious: previous,
      pvrsCurrent: [pvr('A', 'Alpha', 3000, 0, 0)],
      pvrsPrevious: [pvr('A', 'Alpha', 4000, 0, 0)],
      lastUploadDate: null,
    }
    const snapshot = JSON.stringify(input)
    buildExecutiveBriefing(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
