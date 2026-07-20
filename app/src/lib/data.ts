// ─── Supabase-backed data layer (enterprise real-data only) ───
import {
  validateNetworkObservations,
  preprocessNetwork,
  generateNetworkSignals,
  buildDecisionQueue,
  type NetworkDailyObservation,
  type DecisionSignal,
  type DataQualityError,
} from "./preprocessing";
import { supabase } from "./supabase";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

// ─── Type definitions ───

export interface DateRange {
  start?: string; // ISO date YYYY-MM-DD
  end?: string;
}

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
  id: string
  code: string
  name: string
  area_manager_id: number
  region_id: number
  address: string | null
  city: string | null
  cap: string | null
  fido: number | null
  fido_used: number | null
  saldo: number | null
  status: string | null
  health_score: number | null
  created_at: string
}

export interface Player {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  fiscal_code: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  pvr_id: string | null
  pvr_ref_code: string | null
  agent_id: number | null
  registration_date: string | null
  last_activity_date: string | null
  status: string | null
  health_score: number | null
  total_buy_in: number
  total_bet: number
  total_won: number
  total_rake: number
  avg_payout: number
  active_days: number
  created_at: string
  updated_at: string
}

export interface Agent {
  id: number
  code: string
  name: string
  pvr_id: string
  email: string
  phone: string
  commission_rate: number
  created_at: string
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
  player_id: string
  username: string
  date: string
  buy_in: number
  bet: number
  won: number
  rake: number
  payout: number
  pvr_id: string | null
  created_at: string
}

export interface RankingPlayer {
  rank: number
  username: string
  total_rake: number
  total_bet: number
  active_days: number
  pvr_id: string | null
}

export interface RankingPVR {
  rank: number
  pvr_id: string
  pvr_name: string
  total_rake: number
  total_bet: number
  active_players: number
  health_score: number | null
}

export interface Alert {
  id: string
  type: string
  category: string
  title: string
  description: string
  severity: string
  date: string
  metric: string
  value: number
  status: string
  rule_id: string
  recommended_action: string
  confidence: number
  direct_fact: boolean
  scope: string
  entity_id: string
  priority_score: number
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
  won: number
  active_players: number
}

export interface Rankings {
  top_players_by_rake: RankingPlayer[]
  top_players_by_bet: RankingPlayer[]
  top_pvrs: RankingPVR[]
}

export interface PvrTotals {
  [pvrId: string]: { rake: number; bet: number }
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
  pvr_totals: PvrTotals
  alerts: Alert[]
  briefing: Briefing
  decision_signals: DecisionSignal[]
  decision_queue: DecisionSignal[]
  preprocessing_issues: DataQualityError[]
}

// ─── Helpers ───

function applyDateRange<T extends { date: string }>(
  q: ReturnType<typeof supabase.from>,
  range: DateRange | undefined,
  tableDateColumn = "date"
) {
  // Note: this helper is used only when callers build queries manually.
  // Most queries below apply range inline via chainable filters.
  return q;
}

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(/,/g, ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}

export function playerStatus(activeDays: number): string {
  if (activeDays >= 3) return "active";
  if (activeDays >= 1) return "warning";
  return "inactive";
}

// ─── Helpers ───

function daysInMonth(y: number, m: number): number {
  // m is 1-based
  return new Date(y, m, 0).getDate();
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().split("T")[0];
}

async function inferLatestMonthRange(): Promise<DateRange> {
  const { data, error } = await supabase
    .from("daily_network_stats")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const maxDate = (data?.[0] as any)?.date as string | undefined;
  if (!maxDate) return {};
  const [y, m] = maxDate.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  return { start, end };
}

// ─── Main loader ───

export async function loadData(range?: DateRange): Promise<DaznBetData> {
  const effectiveRange = range ?? await inferLatestMonthRange();
  const metadata = await fetchMetadata(effectiveRange);
  const network = await fetchNetworkHierarchy(effectiveRange);
  const [dailyKpis, dailyStats, rankings, monthlyAggs, pvrTotals] = await Promise.all([
    fetchDailyKpis(effectiveRange),
    fetchDailyStats(effectiveRange),
    fetchRankings(effectiveRange),
    fetchMonthlyAggregates(effectiveRange),
    fetchPvrTotals(effectiveRange),
  ]);
  const players = await fetchPlayers(network.pvrs, effectiveRange);

  // ─── Preprocessing pipeline ───
  // 1. Convert DailyKPI → NetworkObservation (explicit mapping)
  const observations: NetworkDailyObservation[] = dailyKpis.map((dk) => ({
    date: dk.date,
    total_rake: dk.total_rake,
    total_bet: dk.total_bet,
    total_won: dk.total_won,
    active_players: dk.active_players,
  }));

  // 2. Validate → preprocess → signals → queue
  const validation = validateNetworkObservations(observations);
  const preprocessed = preprocessNetwork(validation.valid);
  const signals = generateNetworkSignals(preprocessed);
  const queue = buildDecisionQueue(signals, 10);

  // 3. Convert signals to Alert[] and Briefing
  const alerts = convertSignalsToAlerts(signals);
  const briefing = buildBriefingFromSignals(signals, queue, rankings);

  // ─── Metadata enrichment ───
  const totalRake = monthlyAggs.rake;
  const sortedPlayers = [...players].sort((a, b) => b.total_rake - a.total_rake);
  const top10Count = Math.max(1, Math.ceil(sortedPlayers.length * 0.1));
  const top20Count = Math.max(1, Math.ceil(sortedPlayers.length * 0.2));
  const top10Rake = sortedPlayers.slice(0, top10Count).reduce((s, p) => s + p.total_rake, 0);
  const top20Rake = sortedPlayers.slice(0, top20Count).reduce((s, p) => s + p.total_rake, 0);
  metadata.total_agents = network.agents.length;
  metadata.total_area_managers = network.area_managers.length;
  metadata.total_regions = network.regions.length;
  metadata.pareto_10_percent = totalRake > 0 ? top10Rake / totalRake : 0;
  metadata.pareto_20_percent = totalRake > 0 ? top20Rake / totalRake : 0;

  const emptyRankings: Rankings = { top_players_by_rake: [], top_players_by_bet: [], top_pvrs: [] };

  cachedData = {
    metadata,
    regions: network.regions,
    area_managers: network.area_managers,
    pvrs: network.pvrs,
    agents: network.agents,
    players,
    daily_kpis: dailyKpis,
    daily_stats: dailyStats,
    monthly_aggregates: monthlyAggs,
    rankings: rankings || emptyRankings,
    pvr_totals: pvrTotals,
    alerts,
    briefing,
    decision_signals: signals,
    decision_queue: queue,
    preprocessing_issues: validation.errors,
  };

  return cachedData;
}

// ─── Individual fetchers ───

async function fetchMetadata(range?: DateRange): Promise<Metadata> {
  let networkQ = supabase
    .from("daily_network_stats")
    .select("date")
    .order("date", { ascending: true });
  if (range?.start) networkQ = networkQ.gte("date", range.start);
  if (range?.end) networkQ = networkQ.lte("date", range.end);
  const { data: networkData } = await networkQ;

  const { count: playerCount } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true });

  const { count: pvrCount } = await supabase
    .from("pvrs")
    .select("*", { count: "exact", head: true });

  let statsQ = supabase
    .from("daily_player_stats")
    .select("*", { count: "exact", head: true });
  if (range?.start) statsQ = statsQ.gte("date", range.start);
  if (range?.end) statsQ = statsQ.lte("date", range.end);
  const { count: statsCount } = await statsQ;

  const days = (networkData || []) as Array<{ date: string }>;
  const periodStart = days.length > 0 ? days[0].date : "";
  const periodEnd = days.length > 0 ? days[days.length - 1].date : "";

  return {
    export_date: new Date().toISOString().split("T")[0],
    period_start: periodStart,
    period_end: periodEnd,
    total_players: playerCount || 0,
    total_records: statsCount || 0,
    total_days: days.length,
    total_pvrs: pvrCount || 0,
    total_agents: 0,
    total_area_managers: 0,
    total_regions: 0,
    pareto_10_percent: 0,
    pareto_20_percent: 0,
  };
}

async function fetchNetworkHierarchy(range?: DateRange): Promise<{
  pvrs: PVR[];
  regions: Region[];
  area_managers: AreaManager[];
  agents: Agent[];
}> {
  const { data } = await supabase.from("pvrs").select("*").order("name");
  const rawPvrs = (data || []) as Array<Record<string, unknown>>;

  const regionNames = Array.from(new Set(rawPvrs.map((p) => p.region as string).filter(Boolean)));
  const amNames = Array.from(new Set(rawPvrs.map((p) => p.area_manager as string).filter(Boolean)));

  const regions: Region[] = regionNames.map((name, idx) => ({
    id: idx + 1,
    name,
    area_manager_id: 0,
  }));

  const areaManagers: AreaManager[] = amNames.map((name, idx) => {
    const pvr = rawPvrs.find((p) => p.area_manager === name);
    const region = regions.find((r) => r.name === pvr?.region);
    return {
      id: idx + 1,
      name,
      region_id: region?.id || 0,
      email: "",
      phone: "",
    };
  });

  regions.forEach((region) => {
    const am = areaManagers.find((am) =>
      rawPvrs.some((p) => p.region === region.name && p.area_manager === am.name)
    );
    region.area_manager_id = am?.id || 0;
  });

  const pvrs: PVR[] = rawPvrs.map((p) => {
    const am = areaManagers.find((am) => am.name === p.area_manager);
    const region = regions.find((r) => r.name === p.region);
    return {
      id: p.id as string,
      code: (p.exalogic_id as string) || "",
      name: p.name as string,
      area_manager_id: am?.id || 0,
      region_id: region?.id || 0,
      address: null,
      city: null,
      cap: null,
      fido: null,
      fido_used: null,
      saldo: null,
      status: "active",
      health_score: null,
      created_at: (p.created_at as string) || new Date().toISOString(),
    };
  });

  // No synthetic agents until a real agent data source is introduced.
  const agents: Agent[] = [];

  return { pvrs, regions, area_managers: areaManagers, agents };
}

async function fetchPlayers(pvrs: PVR[], range?: DateRange): Promise<Player[]> {
  // 1. Player metadata (real PVR mapping from players_master / pvr_reference_map)
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, username, pvr_id, pvr_ref_code, email, registration_date, created_at, updated_at");
  if (playersError) throw playersError;

  const playerMeta = new Map<
    string,
    {
      username: string;
      pvr_id: string | null;
      pvr_ref_code: string | null;
      email: string | null;
      registration_date: string | null;
      created_at: string;
      updated_at: string;
    }
  >();
  for (const p of playersData || []) {
    playerMeta.set(p.id, {
      username: p.username || "",
      pvr_id: p.pvr_id,
      pvr_ref_code: p.pvr_ref_code,
      email: p.email,
      registration_date: p.registration_date ? p.registration_date.split("T")[0] : null,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || p.created_at || new Date().toISOString(),
    });
  }

  // 2. Aggregated daily stats per player
  let statsQ = supabase
    .from("daily_player_stats")
    .select("player_id, date, buy_in, bet, won, rake");
  if (range?.start) statsQ = statsQ.gte("date", range.start);
  if (range?.end) statsQ = statsQ.lte("date", range.end);
  const { data: stats, error: statsError } = await statsQ;
  if (statsError) throw statsError;

  const agg = new Map<
    string,
    {
      total_buy_in: number;
      total_bet: number;
      total_won: number;
      total_rake: number;
      days: Set<string>;
      minDate: string | null;
      maxDate: string | null;
    }
  >();

  for (const row of stats || []) {
    const pid = row.player_id;
    if (!agg.has(pid)) {
      agg.set(pid, {
        total_buy_in: 0,
        total_bet: 0,
        total_won: 0,
        total_rake: 0,
        days: new Set(),
        minDate: null,
        maxDate: null,
      });
    }
    const p = agg.get(pid)!;
    p.total_buy_in += toNumber(row.buy_in);
    p.total_bet += toNumber(row.bet);
    p.total_won += toNumber(row.won);
    p.total_rake += toNumber(row.rake);
    if (row.date) {
      p.days.add(row.date);
      if (!p.minDate || row.date < p.minDate) p.minDate = row.date;
      if (!p.maxDate || row.date > p.maxDate) p.maxDate = row.date;
    }
  }

  // 3. Also include players present in master data even with no daily stats
  for (const [pid, meta] of playerMeta) {
    if (!agg.has(pid)) {
      agg.set(pid, {
        total_buy_in: 0,
        total_bet: 0,
        total_won: 0,
        total_rake: 0,
        days: new Set(),
        minDate: meta.registration_date,
        maxDate: null,
      });
    }
  }

  return Array.from(agg.entries()).map(([pid, p]) => {
    const meta = playerMeta.get(pid);
    const username = meta?.username || `player-${pid.slice(0, 8)}`;
    const avgPayout = p.total_bet > 0 ? (p.total_won / p.total_bet) * 100 : 0;
    const activeDays = p.days.size;

    return {
      id: pid,
      username,
      first_name: null,
      last_name: null,
      fiscal_code: null,
      email: meta?.email || null,
      phone: null,
      address: null,
      city: null,
      pvr_id: meta?.pvr_id || null,
      pvr_ref_code: meta?.pvr_ref_code || null,
      agent_id: null,
      registration_date: meta?.registration_date || p.minDate,
      last_activity_date: p.maxDate,
      status: playerStatus(activeDays),
      health_score: null,
      total_buy_in: p.total_buy_in,
      total_bet: p.total_bet,
      total_won: p.total_won,
      total_rake: p.total_rake,
      avg_payout: avgPayout,
      active_days: activeDays,
      created_at: meta?.created_at || p.minDate || new Date().toISOString(),
      updated_at: meta?.updated_at || p.maxDate || new Date().toISOString(),
    };
  });
}

async function fetchDailyStats(range?: DateRange): Promise<DailyStat[]> {
  let q = supabase
    .from("daily_player_stats")
    .select(`
      id,
      player_id,
      players!inner(username, pvr_id),
      date, buy_in, bet, won, rake
    `)
    .order("date", { ascending: false });
  if (range?.start) q = q.gte("date", range.start);
  if (range?.end) q = q.lte("date", range.end);
  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    player_id: row.player_id,
    username: row.players?.username || "",
    date: row.date,
    buy_in: toNumber(row.buy_in),
    bet: toNumber(row.bet),
    won: toNumber(row.won),
    rake: toNumber(row.rake),
    payout: toNumber(row.bet) > 0 ? (toNumber(row.won) / toNumber(row.bet)) * 100 : 0,
    pvr_id: row.players?.pvr_id || null,
    created_at: row.created_at,
  }));
}

async function fetchDailyKpis(range?: DateRange): Promise<DailyKPI[]> {
  let netQ = supabase
    .from("daily_network_stats")
    .select("*")
    .order("date", { ascending: true });
  if (range?.start) netQ = netQ.gte("date", range.start);
  if (range?.end) netQ = netQ.lte("date", range.end);
  const { data: networkData, error: netErr } = await netQ;
  if (netErr) throw netErr;

  let activeQ = supabase
    .from("daily_player_stats")
    .select("date, player_id");
  if (range?.start) activeQ = activeQ.gte("date", range.start);
  if (range?.end) activeQ = activeQ.lte("date", range.end);
  const { data: activeData, error: activeErr } = await activeQ;
  if (activeErr) throw activeErr;

  const activeMap = new Map<string, Set<string>>();
  for (const row of activeData || []) {
    if (!activeMap.has(row.date)) activeMap.set(row.date, new Set());
    activeMap.get(row.date)!.add(row.player_id);
  }

  // Real bet count from tickets using a half-open range anchored to Europe/Rome.
  const ROME_TZ = "Europe/Rome";
  let ticketsQ = supabase.from("tickets").select("emission_date");
  if (range?.start) {
    const lower = fromZonedTime(`${range.start}T00:00:00`, ROME_TZ).toISOString();
    ticketsQ = ticketsQ.gte("emission_date", lower);
  }
  if (range?.end) {
    const upper = fromZonedTime(`${nextDay(range.end)}T00:00:00`, ROME_TZ).toISOString();
    ticketsQ = ticketsQ.lt("emission_date", upper);
  }
  const { data: ticketsData, error: ticketsErr } = await ticketsQ;
  if (ticketsErr) throw ticketsErr;

  const betsMap = new Map<string, number>();
  for (const row of ticketsData || []) {
    const ts = row.emission_date;
    if (!ts) continue;
    const date = formatInTimeZone(ts, ROME_TZ, "yyyy-MM-dd");
    betsMap.set(date, (betsMap.get(date) || 0) + 1);
  }

  return (networkData || []).map((d: Record<string, unknown>) => {
    const date = d.date as string;
    const bet = toNumber(d.bet);
    const won = toNumber(d.won);
    return {
      date,
      total_buy_in: toNumber(d.buy_in),
      total_bet: bet,
      total_won: won,
      total_rake: toNumber(d.rake),
      avg_payout: bet > 0 ? (won / bet) * 100 : 0,
      active_players: activeMap.get(date)?.size || 0,
      total_bets_count: betsMap.get(date) || 0,
    };
  });
}

async function fetchMonthlyAggregates(range?: DateRange): Promise<MonthlyAggregates> {
  let q = supabase.from("daily_network_stats").select("bet, rake, won");
  if (range?.start) q = q.gte("date", range.start);
  if (range?.end) q = q.lte("date", range.end);
  const { data, error } = await q;
  if (error) throw error;

  if (!data || data.length === 0) return { rake: 0, bet: 0, won: 0, active_players: 0 };

  const totalBet = data.reduce((sum, d) => sum + toNumber(d.bet), 0);
  const totalRake = data.reduce((sum, d) => sum + toNumber(d.rake), 0);
  const totalWon = data.reduce((sum, d) => sum + toNumber(d.won), 0);

  let activeQ = supabase
    .from("daily_player_stats")
    .select("date, player_id");
  if (range?.start) activeQ = activeQ.gte("date", range.start);
  if (range?.end) activeQ = activeQ.lte("date", range.end);
  const { data: activeData, error: activeErr } = await activeQ;
  if (activeErr) throw activeErr;

  const activeMap = new Map<string, Set<string>>();
  for (const row of activeData || []) {
    if (!activeMap.has(row.date)) activeMap.set(row.date, new Set());
    activeMap.get(row.date)!.add(row.player_id);
  }

  const avgActive = activeMap.size > 0
    ? Array.from(activeMap.values()).reduce((sum, s) => sum + s.size, 0) / activeMap.size
    : 0;

  return { rake: totalRake, bet: totalBet, won: totalWon, active_players: avgActive };
}

export async function fetchPreviousMonthAggregates(range: DateRange): Promise<MonthlyAggregates | null> {
  if (!range.start) return null;
  const [y, m] = range.start.split("-").map(Number);
  // Compute previous month
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevEnd = `${prevY}-${String(prevM).padStart(2, "0")}-${String(daysInMonth(prevY, prevM)).padStart(2, "0")}`;

  try {
    const aggs = await fetchMonthlyAggregates({ start: prevStart, end: prevEnd });
    if (aggs.rake === 0 && aggs.bet === 0 && aggs.won === 0 && aggs.active_players === 0) return null;
    return aggs;
  } catch {
    return null;
  }
}

async function fetchRankings(range?: DateRange): Promise<Rankings> {
  // Player rankings
  let playerQ = supabase
    .from("daily_player_stats")
    .select(`
      player_id,
      players!inner(username, pvr_id),
      date, rake, bet
    `);
  if (range?.start) playerQ = playerQ.gte("date", range.start);
  if (range?.end) playerQ = playerQ.lte("date", range.end);
  const { data: playerStats, error: playerErr } = await playerQ;
  if (playerErr) throw playerErr;

  const playerAgg = new Map<
    string,
    { username: string; rake: number; bet: number; days: Set<string>; pvr_id: string | null }
  >();
  for (const row of playerStats || []) {
    const pid = row.player_id as string;
    const username = row.players?.username || "";
    const pvrId = row.players?.pvr_id || null;
    const date = row.date as string;

    if (!playerAgg.has(pid)) {
      playerAgg.set(pid, { username, rake: 0, bet: 0, days: new Set(), pvr_id: pvrId });
    }
    const p = playerAgg.get(pid)!;
    p.rake += toNumber(row.rake);
    p.bet += toNumber(row.bet);
    if (date) p.days.add(date);
    // Keep latest known PVR if multiple
    if (pvrId) p.pvr_id = pvrId;
  }

  const makePlayerRanking = (entries: Array<[string, typeof playerAgg extends Map<string, infer V> ? V : never]>) =>
    entries
      .slice(0, 20)
      .map(([pid, p], i) => ({
        rank: i + 1,
        username: p.username || `player-${pid.slice(0, 8)}`,
        total_rake: p.rake,
        total_bet: p.bet,
        active_days: p.days.size,
        pvr_id: p.pvr_id,
      }));

  const byRake = makePlayerRanking(
    Array.from(playerAgg.entries()).sort((a, b) => b[1].rake - a[1].rake)
  );
  const byBet = makePlayerRanking(
    Array.from(playerAgg.entries()).sort((a, b) => b[1].bet - a[1].bet)
  );

  // PVR rankings
  let pvrQ = supabase
    .from("daily_pvr_stats")
    .select(`
      pvr_id,
      pvrs!inner(name),
      rake, bet
    `);
  if (range?.start) pvrQ = pvrQ.gte("date", range.start);
  if (range?.end) pvrQ = pvrQ.lte("date", range.end);
  const { data: pvrStats, error: pvrErr } = await pvrQ;
  if (pvrErr) throw pvrErr;

  const pvrAgg = new Map<string, { name: string; rake: number; bet: number }>();
  for (const row of pvrStats || []) {
    const pid = row.pvr_id as string;
    const name = row.pvrs?.name || "";
    if (!pvrAgg.has(pid)) pvrAgg.set(pid, { name, rake: 0, bet: 0 });
    const p = pvrAgg.get(pid)!;
    p.rake += toNumber(row.rake);
    p.bet += toNumber(row.bet);
  }

  // Active players per PVR (from player daily stats joined to players.pvr_id)
  let activePvrQ = supabase
    .from("daily_player_stats")
    .select(`
      player_id,
      date,
      players!inner(pvr_id)
    `);
  if (range?.start) activePvrQ = activePvrQ.gte("date", range.start);
  if (range?.end) activePvrQ = activePvrQ.lte("date", range.end);
  const { data: activePvrData, error: activePvrErr } = await activePvrQ;
  if (activePvrErr) throw activePvrErr;

  const pvrActiveMap = new Map<string, Set<string>>();
  for (const row of activePvrData || []) {
    const pvrId = row.players?.pvr_id;
    const playerId = row.player_id;
    if (!pvrId || !playerId) continue;
    if (!pvrActiveMap.has(pvrId)) pvrActiveMap.set(pvrId, new Set());
    pvrActiveMap.get(pvrId)!.add(playerId);
  }

  const topPvrs = Array.from(pvrAgg.entries())
    .sort((a, b) => b[1].rake - a[1].rake)
    .slice(0, 10)
    .map(([pid, p], i) => ({
      rank: i + 1,
      pvr_id: pid,
      pvr_name: p.name,
      total_rake: p.rake,
      total_bet: p.bet,
      active_players: pvrActiveMap.get(pid)?.size || 0,
      health_score: null as number | null,
    }));

  return {
    top_players_by_rake: byRake,
    top_players_by_bet: byBet,
    top_pvrs: topPvrs,
  };
}

async function fetchPvrTotals(range?: DateRange): Promise<PvrTotals> {
  let q = supabase.from("daily_pvr_stats").select("pvr_id, rake, bet");
  if (range?.start) q = q.gte("date", range.start);
  if (range?.end) q = q.lte("date", range.end);
  const { data, error } = await q;
  if (error) throw error;
  const totals: PvrTotals = {};
  for (const row of data || []) {
    const pid = row.pvr_id;
    if (!totals[pid]) totals[pid] = { rake: 0, bet: 0 };
    totals[pid].rake += toNumber(row.rake);
    totals[pid].bet += toNumber(row.bet);
  }
  return totals;
}

// ─── Alert conversion: DecisionSignal → Alert (pure function) ───

/** Converts preprocessing DecisionSignals into UI Alert objects. Does not mutate input. */
export function convertSignalsToAlerts(signals: ReadonlyArray<DecisionSignal>): Alert[] {
  const severityMap: Record<string, string> = { high: "critical", medium: "warning", low: "info" };
  return [...signals]
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return b.date.localeCompare(a.date);
    })
    .map((s) => ({
      id: s.id,
      type: s.rule_id,
      category: s.category,
      title: s.title,
      description: s.explanation,
      severity: severityMap[s.severity] || s.severity,
      date: s.date,
      metric: s.metric,
      value: s.current_value,
      status: "active",
      rule_id: s.rule_id,
      recommended_action: s.recommended_action,
      confidence: s.confidence,
      direct_fact: s.evidence.direct_fact,
      scope: s.scope,
      entity_id: s.entity_id,
      priority_score: s.priority_score,
    }));
}

// ─── Briefing construction from signals (pure function) ───

/** Builds Briefing from pre-generated signals, decision queue, and ranking data. */
export function buildBriefingFromSignals(
  signals: DecisionSignal[],
  queue: DecisionSignal[],
  rankings: Rankings | null,
): Briefing {
  const today = new Date().toISOString().split("T")[0];
  const criticals: BriefingItem[] = [];
  const opportunities: BriefingItem[] = [];
  const suggestions: BriefingItem[] = [];

  // Criticals: high-severity signals, sorted by priority
  const highSignals = signals.filter((s) => s.severity === "high").sort((a, b) => b.priority_score - a.priority_score);
  let critId = 1;
  for (const s of highSignals) {
    criticals.push({
      id: critId++,
      title: s.title,
      description: s.explanation,
      severity: s.severity,
      metric: s.metric,
      value: s.current_value,
    });
  }

  // Suggestions: recommended_action from decision queue, deduplicated
  const seenActions = new Set<string>();
  let suggId = 1;
  for (const s of queue) {
    if (!seenActions.has(s.recommended_action)) {
      seenActions.add(s.recommended_action);
      suggestions.push({
        id: suggId++,
        title: s.title,
        description: s.recommended_action,
        action: s.recommended_action,
      });
    }
  }

  // Opportunities: use ranking data passed as parameter
  if (rankings) {
    const topPlayer = rankings.top_players_by_rake?.[0];
    if (topPlayer && topPlayer.total_rake > 0) {
      opportunities.push({
        id: 1,
        title: "Top player identificato",
        description: `${topPlayer.username} \u00e8 il miglior giocatore per rake`,
        severity: "info",
      });
    }
  }

  // Count negative rake days from signals
  const negCount = signals.filter((s) => s.rule_id === "NETWORK_RAKE_NEGATIVE").length;
  if (negCount > 0) {
    suggestions.push({
      id: suggId++,
      title: `${negCount} giorni con rake negativo`,
      description: `Analizza i pattern per identificare le cause`,
    });
  }

  return {
    date: today,
    generated_at: new Date().toISOString(),
    criticals,
    opportunities,
    suggestions,
  };
}


// ─── Compatibility helpers ───

let cachedData: DaznBetData | null = null;

export function getCachedData(): DaznBetData | null {
  return cachedData;
}

export function getData(): DaznBetData {
  if (!cachedData) throw new Error("Data not loaded yet. Call loadData() first.");
  return cachedData;
}

export function getTotalRake(): number {
  return getData().monthly_aggregates.rake;
}

export function getTotalBet(): number {
  return getData().monthly_aggregates.bet;
}

export function getTotalWon(): number {
  return getData().monthly_aggregates.won;
}

export function getAvgActivePlayersPerDay(): number {
  const d = getData();
  return d.daily_kpis.length > 0
    ? d.daily_kpis.reduce((sum, dk) => sum + dk.active_players, 0) / d.daily_kpis.length
    : 0;
}

export function getAvgPayout(): number {
  const d = getData();
  return d.daily_kpis.length > 0
    ? d.daily_kpis.reduce((sum, dk) => sum + dk.avg_payout, 0) / d.daily_kpis.length
    : 0;
}

export function getDailyKpis(): DailyKPI[] {
  return getData().daily_kpis;
}

export function getRankings(): Rankings {
  return getData().rankings;
}

export function getAlerts(): Alert[] {
  return getData().alerts;
}

export function getBriefing(): Briefing {
  return getData().briefing;
}

export function getPvrs(): PVR[] {
  return getData().pvrs;
}

export function getMetadata(): Metadata {
  return getData().metadata;
}

// ─── Formatting utilities ───

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value) + "%";
}

export function getPvrName(pvrId: string | null): string {
  if (!pvrId) return "N/A";
  const pvr = getData().pvrs.find((p) => p.id === pvrId);
  return pvr ? pvr.name : `PVR ${pvrId}`;
}

/** @deprecated Use playerStatus(activeDays) instead. Health score formula not yet approved. */
export function getPlayerStatus(_healthScore: number | null): { label: string; color: string } {
  return { label: "N/D", color: "positive" };
}

// ─── Singleton exports for compatibility ───

const emptyMetadata: Metadata = {
  export_date: "", period_start: "", period_end: "",
  total_players: 0, total_records: 0, total_days: 0,
  total_pvrs: 0, total_agents: 0, total_area_managers: 0, total_regions: 0,
  pareto_10_percent: 0, pareto_20_percent: 0,
};

export const dataStore = {
  get metadata() { return cachedData?.metadata ?? emptyMetadata; },
  get regions() { return cachedData?.regions ?? []; },
  get area_managers() { return cachedData?.area_managers ?? []; },
  get pvrs() { return cachedData?.pvrs ?? []; },
  get agents() { return cachedData?.agents ?? []; },
  get players() { return cachedData?.players ?? []; },
  get daily_kpis() { return cachedData?.daily_kpis ?? []; },
  get daily_stats() { return cachedData?.daily_stats ?? []; },
  get monthly_aggregates() {
    return cachedData?.monthly_aggregates ?? { rake: 0, bet: 0, won: 0, active_players: 0 };
  },
  get rankings() {
    return cachedData?.rankings ?? { top_players_by_rake: [], top_players_by_bet: [], top_pvrs: [] };
  },
  get pvr_totals() { return cachedData?.pvr_totals ?? {}; },
  get alerts() { return cachedData?.alerts ?? []; },
  get briefing() {
    return cachedData?.briefing ?? { date: "", generated_at: "", criticals: [], opportunities: [], suggestions: [] };
  },
  get decision_signals() { return cachedData?.decision_signals ?? []; },
  get decision_queue() { return cachedData?.decision_queue ?? []; },
  get preprocessing_issues() { return cachedData?.preprocessing_issues ?? []; },
};
