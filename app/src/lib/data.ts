// ─── Type definitions ───

export interface Region {
  id: number
  name: string
  area_manager_id: number
}

export interface AreaManager {
  id: number
  name: string
  region_id: number
  email: string
  phone: string
}

export interface PVR {
  id: number
  code: string
  name: string
  area_manager_id: number
  address: string
  city: string
  cap: string
  fido: number
  fido_used: number
  saldo: number
  status: string
  health_score: number
  created_at: string
}

export interface Agent {
  id: number
  code: string
  name: string
  pvr_id: number
  email: string
  phone: string
  commission_rate: number
  created_at: string
}

export interface Player {
  id: number
  username: string
  first_name: string
  last_name: string
  fiscal_code: string
  email: string
  phone: string
  address: string
  city: string
  pvr_id: number
  agent_id: number
  registration_date: string
  last_activity_date: string
  status: string
  health_score: number
  total_buy_in: number
  total_bet: number
  total_won: number
  total_rake: number
  avg_payout: number
  active_days: number
  created_at: string
  updated_at: string
}

export interface DailyKPI {
  date: string
  total_buy_in: number
  total_bet: number
  total_won: number
  total_rake: number
  avg_payout: number
  active_players: number
  total_bets_count: number
}

export interface DailyStat {
  id: number
  player_id: number
  username: string
  date: string
  buy_in: number
  bet: number
  won: number
  rake: number
  payout: number
  pvr_id: number
  created_at: string
}

export interface RankingPlayer {
  rank: number
  username: string
  total_rake: number
  total_bet: number
  active_days: number
  pvr_id: number
}

export interface RankingPVR {
  rank: number
  pvr_id: number
  pvr_name: string
  total_rake: number
  total_bet: number
  active_players: number
  health_score: number
}

export interface Alert {
  id: number
  type: string
  category: string
  title: string
  description: string
  severity: string
  date: string
  metric: string
  value: number
  status: string
}

export interface BriefingItem {
  id: number
  title: string
  description: string
  severity?: string
  impact?: string
  priority?: string
  action?: string
  target?: string
  metric?: string
  value?: number
}

export interface Briefing {
  date: string
  generated_at: string
  criticals: BriefingItem[]
  opportunities: BriefingItem[]
  suggestions: BriefingItem[]
}

export interface Metadata {
  export_date: string
  period_start: string
  period_end: string
  total_players: number
  total_records: number
  total_days: number
  total_pvrs: number
  total_agents: number
  total_area_managers: number
  total_regions: number
  pareto_10_percent: number
  pareto_20_percent: number
}

export interface MonthlyAggregates {
  rake: number
  bet: number
  active_players: number
}

export interface Rankings {
  top_players_by_rake: RankingPlayer[]
  top_players_by_bet: RankingPlayer[]
  top_pvrs: RankingPVR[]
}

export interface DaznBetData {
  metadata: Metadata
  regions: Region[]
  area_managers: AreaManager[]
  pvrs: PVR[]
  agents: Agent[]
  players: Player[]
  daily_kpis: DailyKPI[]
  daily_stats: DailyStat[]
  monthly_aggregates: MonthlyAggregates
  rankings: Rankings
  alerts: Alert[]
  briefing: Briefing
}

// ─── Data cache ───
let cachedData: DaznBetData | null = null

export async function loadData(): Promise<DaznBetData> {
  if (cachedData) return cachedData
  const res = await fetch('data/daznbet_data.json?_=' + Date.now())
  if (!res.ok) throw new Error(`Failed to load data: ${res.status}`)
  cachedData = await res.json() as DaznBetData
  return cachedData
}

export function getCachedData(): DaznBetData | null {
  return cachedData
}

// ─── Convenience exports (require data to be loaded) ───
export function getData(): DaznBetData {
  if (!cachedData) throw new Error('Data not loaded yet. Call loadData() first.')
  return cachedData
}

// ─── Computed values (require data to be loaded) ───
export function getTotalRake(): number {
  return getData().monthly_aggregates.rake
}

export function getTotalBet(): number {
  return getData().monthly_aggregates.bet
}

export function getTotalWon(): number {
  return getTotalBet() - getTotalRake()
}

export function getAvgActivePlayersPerDay(): number {
  const d = getData()
  return d.daily_kpis.reduce((sum, dk) => sum + dk.active_players, 0) / d.daily_kpis.length
}

export function getAvgPayout(): number {
  return getData().daily_kpis.reduce((sum, d) => sum + d.avg_payout, 0) / getData().daily_kpis.length
}

// ─── Direct accessors (require data to be loaded) ───
export function getDailyKpis(): DailyKPI[] {
  return getData().daily_kpis
}

export function getRankings(): Rankings {
  return getData().rankings
}

export function getAlerts(): Alert[] {
  return getData().alerts
}

export function getBriefing(): Briefing {
  return getData().briefing
}

export function getPvrs(): PVR[] {
  return getData().pvrs
}

export function getMetadata(): Metadata {
  return getData().metadata
}

// ─── Formatting utilities ───
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value) + '%'
}

export function getPvrName(pvrId: number): string {
  const pvr = getData().pvrs.find((p) => p.id === pvrId)
  return pvr ? pvr.name : `PVR ${pvrId}`
}

export function getPlayerStatus(healthScore: number): {
  label: string
  color: string
} {
  if (healthScore >= 75) return { label: 'Attivo', color: 'positive' }
  if (healthScore >= 50) return { label: 'A Rischio', color: 'warning' }
  return { label: 'Critico', color: 'negative' }
}

// ─── Safe defaults ───
const emptyMetadata: Metadata = { export_date: '', period_start: '', period_end: '', total_players: 0, total_records: 0, total_days: 0, total_pvrs: 0, total_agents: 0, total_area_managers: 0, total_regions: 0, pareto_10_percent: 0, pareto_20_percent: 0 }
const emptyMonthlyAggregates: MonthlyAggregates = { rake: 0, bet: 0, active_players: 0 }
const emptyRankings: Rankings = { top_players_by_rake: [], top_players_by_bet: [], top_pvrs: [] }
const emptyBriefing: Briefing = { date: '', generated_at: '', criticals: [], opportunities: [], suggestions: [] }

// ─── Singleton exports for convenience ───
// These will be populated after loadData() is called
export const dataStore = {
  get metadata() { return cachedData?.metadata ?? emptyMetadata },
  get regions() { return cachedData?.regions ?? [] },
  get area_managers() { return cachedData?.area_managers ?? [] },
  get pvrs() { return cachedData?.pvrs ?? [] },
  get agents() { return cachedData?.agents ?? [] },
  get players() { return cachedData?.players ?? [] },
  get daily_kpis() { return cachedData?.daily_kpis ?? [] },
  get daily_stats() { return cachedData?.daily_stats ?? [] },
  get monthly_aggregates() { return cachedData?.monthly_aggregates ?? emptyMonthlyAggregates },
  get rankings() { return cachedData?.rankings ?? emptyRankings },
  get alerts() { return cachedData?.alerts ?? [] },
  get briefing() { return cachedData?.briefing ?? emptyBriefing },
}
