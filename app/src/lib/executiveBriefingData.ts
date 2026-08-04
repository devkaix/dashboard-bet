// ── Executive Briefing data loader ─────────────────────────────────────────
// Supabase-backed loader. Separated from UI and from pure engine logic.

import { supabase } from './supabase'
import {
  analysisMonthToRange,
  databaseDateToAnalysisMonth,
  normalizeAnalysisMonth,
} from './analysisMonth'
import {
  aggregateNetworkPeriod,
  aggregatePvrPeriods,
  buildExecutiveBriefing,
  type ExecutiveBriefingInput,
  type ExecutiveBriefingResult,
  type NetworkPeriod,
  type PvrPeriod,
} from './executiveBriefing'
import { DEFAULT_EXECUTIVE_BRIEFING_CONFIG } from './executiveBriefingConfig'

export type { ExecutiveBriefingResult }

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

async function fetchNetworkStats(range: { start: string; end: string }): Promise<NetworkPeriod> {
  let q = supabase
    .from('daily_network_stats')
    .select('date, rake, bet, won, refund')
    .order('date', { ascending: true })
  q = q.gte('date', range.start).lte('date', range.end)

  const { data, error } = await q
  if (error) throw new Error(`daily_network_stats: ${error.message}`)

  const month = databaseDateToAnalysisMonth(range.start) || range.start.slice(0, 7)
  return aggregateNetworkPeriod(
    month,
    range.start,
    range.end,
    (data || []).map((r) => ({
      date: r.date,
      rake: toNumber(r.rake),
      bet: toNumber(r.bet),
      won: toNumber(r.won),
      refund: toNumber(r.refund),
    })),
  )
}

async function fetchPvrStats(range: { start: string; end: string }): Promise<PvrPeriod[]> {
  let q = supabase
    .from('daily_pvr_stats')
    .select('date, pvr_id, rake, bet, won, refund, pvrs!inner(name, exalogic_id)')
    .order('date', { ascending: true })
  q = q.gte('date', range.start).lte('date', range.end)

  const { data, error } = await q
  if (error) throw new Error(`daily_pvr_stats: ${error.message}`)

  const periods = aggregatePvrPeriods(
    (data || []).map((r) => ({
      date: String((r as Record<string, unknown>).date),
      pvr_id: String((r as Record<string, unknown>).pvr_id),
      pvrs: ((r as Record<string, unknown>).pvrs as { name: string; exalogic_id: string | null } | null) || null,
      rake: toNumber((r as Record<string, unknown>).rake),
      bet: toNumber((r as Record<string, unknown>).bet),
      won: toNumber((r as Record<string, unknown>).won),
      refund: toNumber((r as Record<string, unknown>).refund),
    })),
  )

  // Fetch player count per PVR for inactivity classification
  const { data: playerCounts } = await supabase
    .from('players')
    .select('pvr_id')
    .not('pvr_id', 'is', null)
  const playerCountByPvr = new Map<string, number>()
  for (const row of playerCounts || []) {
    const pid = String((row as Record<string, unknown>).pvr_id)
    playerCountByPvr.set(pid, (playerCountByPvr.get(pid) || 0) + 1)
  }

  // Populate assignedPlayers on active PVRs
  for (const p of periods) {
    p.assignedPlayers = playerCountByPvr.get(p.pvrId) || 0
  }

  // Include PVRs from the pvrs table that have zero records in daily_pvr_stats
  // (truly inactive PVRs with no data at all). Exclude agent entries
  // (consistent with fetchNetworkHierarchy in data.ts).
  const activeIds = new Set(periods.map((p) => p.pvrId))
  const { data: allPvrs, error: pvrErr } = await supabase
    .from('pvrs')
    .select('id, name, exalogic_id')
    .neq('tipo', 'agent')
  if (!pvrErr && allPvrs) {
    for (const pvr of allPvrs) {
      const id = String((pvr as Record<string, unknown>).id)
      if (!activeIds.has(id)) {
        periods.push({
          pvrId: id,
          pvrName: String((pvr as Record<string, unknown>).name || id),
          pvrExalogicId: (pvr as Record<string, unknown>).exalogic_id as string | null || null,
          rake: 0,
          bet: 0,
          won: 0,
          refund: 0,
          payout: 0,
          days: 0,
          negativeRakeDays: 0,
          assignedPlayers: playerCountByPvr.get(id) || 0,
        })
      }
    }
  }

  return periods
}

async function fetchLastUpload(month: string): Promise<string | null> {
  const range = analysisMonthToRange(month)
  const { data, error } = await supabase
    .from('excel_uploads')
    .select('uploaded_at')
    .eq('status', 'completed')
    .gte('uploaded_at', `${range.start}T00:00:00Z`)
    .lt('uploaded_at', `${range.end}T23:59:59Z`)
    .order('uploaded_at', { ascending: false })
    .limit(1)

  if (error) {
    // excel_uploads is optional for briefing; do not fail the whole page.
    return null
  }
  return (data?.[0] as { uploaded_at?: string } | undefined)?.uploaded_at || null
}

export interface ExecutiveBriefingLoaderOptions {
  month: string
}

export async function loadExecutiveBriefingData(
  month: string,
): Promise<ExecutiveBriefingResult> {
  const normalized = normalizeAnalysisMonth(month)
  const currentRange = analysisMonthToRange(normalized)
  const prev = previousMonth(normalized)
  const previousRange = analysisMonthToRange(prev)

  const [networkCurrent, networkPrevious, pvrsCurrent, pvrsPrevious, lastUploadDate] =
    await Promise.all([
      fetchNetworkStats(currentRange),
      fetchNetworkStats(previousRange).catch(() => {
        // If previous month is completely missing, treat as absent rather than fail.
        return null
      }),
      fetchPvrStats(currentRange),
      fetchPvrStats(previousRange).catch(() => null),
      fetchLastUpload(normalized),
    ])

  const input: ExecutiveBriefingInput = {
    currentMonth: normalized,
    previousMonth: prev,
    networkCurrent,
    networkPrevious,
    pvrsCurrent,
    pvrsPrevious: pvrsPrevious || [],
    lastUploadDate,
    config: DEFAULT_EXECUTIVE_BRIEFING_CONFIG,
  }

  return buildExecutiveBriefing(input)
}

export async function inferLatestMonth(): Promise<string> {
  const { data, error } = await supabase
    .from('daily_network_stats')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`latest month lookup: ${error.message}`)
  const date = (data?.[0] as { date?: string } | undefined)?.date
  if (!date) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  return databaseDateToAnalysisMonth(date) || date.slice(0, 7)
}

export function resolveExecutiveMonth(): string {
  // Priority: URL → localStorage → latest DB (async, caller may override) → current month
  const params = new URLSearchParams(window.location.search)
  const urlMonth = params.get('month')
  if (urlMonth) {
    try {
      return normalizeAnalysisMonth(urlMonth)
    } catch {
      // fall through
    }
  }
  const stored = localStorage.getItem('analysisMonth')
  if (stored) {
    try {
      return normalizeAnalysisMonth(stored)
    } catch {
      // fall through
    }
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
