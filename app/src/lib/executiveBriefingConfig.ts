// ── Executive Briefing configuration ───────────────────────────────────────
// Centralised thresholds and rules. No magic numbers in components.

export type ExecutiveSeverity = 'critical' | 'warning' | 'info'
export type ExecutiveConfidence = 'high' | 'medium' | 'low'

export interface ExecutiveBriefingConfig {
  // Minimum economic relevance for a PVR to be mentioned
  pvr: {
    minRakeEur: number
    minBetEur: number
    minDeltaEur: number
    minGrowthPct: number
    minDeclinePct: number
    criticalDeclinePct: number
    inactivityThresholdEur: number
  }
  network: {
    minDeltaEur: number
    minDeltaPct: number
    criticalDeclinePct: number
    negativeRakeThresholdEur: number
    payoutChangeMinPts: number
    payoutMinVolumeEur: number
  }
  concentration: {
    topContributors: number
    highConcentrationPct: number
  }
  confidence: {
    highCoveragePct: number
    mediumCoveragePct: number
    reconciliationTolerancePct: number
  }
  ranking: {
    topGrowthCount: number
    topDeclineCount: number
    maxInsights: number
    maxPriorities: number
    summarySentences: number
  }
  severityThresholds: {
    critical: { minImpactEur: number; minDeclinePct: number }
    warning: { minImpactEur: number; minDeclinePct: number }
  }
  actions: {
    allowed: string[]
    forbidden: string[]
  }
}

export const DEFAULT_EXECUTIVE_BRIEFING_CONFIG: ExecutiveBriefingConfig = {
  pvr: {
    minRakeEur: 50,
    minBetEur: 200,
    minDeltaEur: 50,
    minGrowthPct: 0.15,
    minDeclinePct: 0.15,
    criticalDeclinePct: 0.35,
    inactivityThresholdEur: 0,
  },
  network: {
    minDeltaEur: 200,
    minDeltaPct: 0.05,
    criticalDeclinePct: 0.15,
    negativeRakeThresholdEur: 0,
    payoutChangeMinPts: 3,
    payoutMinVolumeEur: 1000,
  },
  concentration: {
    topContributors: 3,
    highConcentrationPct: 0.6,
  },
  confidence: {
    highCoveragePct: 0.85,
    mediumCoveragePct: 0.5,
    reconciliationTolerancePct: 0.02,
  },
  ranking: {
    topGrowthCount: 3,
    topDeclineCount: 3,
    maxInsights: 10,
    maxPriorities: 3,
    summarySentences: 3,
  },
  severityThresholds: {
    critical: { minImpactEur: 1000, minDeclinePct: 0.35 },
    warning: { minImpactEur: 500, minDeclinePct: 0.15 },
  },
  actions: {
    allowed: [
      'contattare il PVR per verificare il calo del volume',
      'approfondire una variazione payout',
      'verificare un PVR senza movimento',
      'monitorare un fenomeno',
      'riconoscere un PVR con crescita significativa',
    ],
    forbidden: [
      'aumentare il fido',
      'bloccare un giocatore',
      'chiudere un PVR',
      'sospendere pagamenti',
      'attribuire colpe',
      'dichiarare frodi',
    ],
  },
}

export function isForbiddenAction(action: string, config: ExecutiveBriefingConfig): boolean {
  const lower = action.toLowerCase()
  return config.actions.forbidden.some((f) => lower.includes(f.toLowerCase()))
}
