import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { analysisMonthToRange, formatAnalysisMonth } from '@/lib/analysisMonth'
import { formatCurrency } from '@/lib/data'
import { cn } from '@/lib/utils'
import MonthSelector from '@/components/upload/MonthSelector'

// ─── Types ───

type RetentionData = {
  fidelizzati: { count: number; rake: number }
  nuovi: { count: number; rake: number }
  persi: { count: number; rake: number }
  mai: { count: number }
}

type CategoryRow = {
  category: string
  rakeA: number
  rakeB: number
  betA: number
  betB: number
}

type ConcentrationData = {
  top10PctA: number
  top10PctB: number
  top3ShareA: number
  top3ShareB: number
  giniA: number
  giniB: number
}

type PvrRankMove = {
  pvrId: string
  pvrName: string
  rankA: number
  rankB: number
  rakeA: number
  rakeB: number
}

type QualityData = {
  daysA: number
  daysB: number
  uploadsA: number
  uploadsB: number
  pvrMissingA: number
  pvrMissingB: number
  playersInactiveA: number
  playersInactiveB: number
  networkRakeA: number
  networkRakeB: number
  playerRakeSumA: number
  playerRakeSumB: number
}

type ChurnPlayer = { username: string; rakeLost: number }
type PvrEfficiency = { pvrId: string; pvrName: string; players: number; rake: number; efficiency: number }
type BonusROI = { month: string; bonusErogato: number; buyInBonus: number; rake: number; roi: number | null }

// ─── Pure helpers ───

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function deltaPct(a: number, b: number): number | null {
  if (b === 0) return null
  return ((a - b) / Math.abs(b)) * 100
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

// ─── Data fetchers ───

async function fetchRetention(monthA: string, monthB: string): Promise<RetentionData> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('daily_player_stats').select('player_id, rake').gte('date', rangeA.start).lte('date', rangeA.end),
    supabase.from('daily_player_stats').select('player_id, rake').gte('date', rangeB.start).lte('date', rangeB.end),
  ])

  const aggA = new Map<string, number>()
  for (const r of a || []) aggA.set(r.player_id, (aggA.get(r.player_id) || 0) + toNum(r.rake))
  const aggB = new Map<string, number>()
  for (const r of b || []) aggB.set(r.player_id, (aggB.get(r.player_id) || 0) + toNum(r.rake))

  const idsA = new Set(aggA.keys())
  const idsB = new Set(aggB.keys())

  let fidelizzati = { count: 0, rake: 0 }
  let nuovi = { count: 0, rake: 0 }
  let persi = { count: 0, rake: 0 }

  for (const id of idsA) {
    if (idsB.has(id)) {
      fidelizzati.count++
      fidelizzati.rake += aggB.get(id) || 0
    } else {
      persi.count++
      persi.rake += aggA.get(id) || 0
    }
  }
  for (const id of idsB) {
    if (!idsA.has(id)) {
      nuovi.count++
      nuovi.rake += aggB.get(id) || 0
    }
  }

  // Mai attivi: count from players table (total - active in either month)
  const { count: total } = await supabase.from('players').select('*', { count: 'exact', head: true })
  const totalPlayers = total || 0
  const activeEither = new Set([...idsA, ...idsB]).size
  const mai = { count: Math.max(0, totalPlayers - activeEither) }

  return { fidelizzati, nuovi, persi, mai }
}

async function fetchCategories(monthA: string, monthB: string): Promise<CategoryRow[]> {
  const dbMonthA = `${monthA}-01`
  const dbMonthB = `${monthB}-01`

  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('category_stats').select('category, bet, rake').eq('analysis_month', dbMonthA).order('rake', { ascending: false }),
    supabase.from('category_stats').select('category, bet, rake').eq('analysis_month', dbMonthB).order('rake', { ascending: false }),
  ])

  const mapA = new Map<string, { bet: number; rake: number }>()
  for (const r of a || []) mapA.set(r.category as string, { bet: toNum(r.bet), rake: toNum(r.rake) })
  const mapB = new Map<string, { bet: number; rake: number }>()
  for (const r of b || []) mapB.set(r.category as string, { bet: toNum(r.bet), rake: toNum(r.rake) })

  // Union of both months' categories
  const allCategories = new Set([...mapA.keys(), ...mapB.keys()])
  return Array.from(allCategories).map((cat) => {
    const ra = mapA.get(cat) || { bet: 0, rake: 0 }
    const rb = mapB.get(cat) || { bet: 0, rake: 0 }
    return { category: cat, rakeA: ra.rake, rakeB: rb.rake, betA: ra.bet, betB: rb.bet }
  }).sort((a, b) => b.rakeA - a.rakeA)
}

async function fetchConcentration(monthA: string, monthB: string): Promise<ConcentrationData> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  async function compute(range: { start: string; end: string }): Promise<{ top3: number; top10: number; gini: number; totalRake: number }> {
    const { data } = await supabase.from('daily_player_stats').select('player_id, rake').gte('date', range.start).lte('date', range.end)
    const playerRake = new Map<string, number>()
    for (const r of data || []) playerRake.set(r.player_id, (playerRake.get(r.player_id) || 0) + toNum(r.rake))
    const values = Array.from(playerRake.values())
    const sortedDesc = values.sort((a, b) => b - a)
    const sortedAsc = [...sortedDesc].reverse()
    const totalRake = sortedDesc.reduce((s, v) => s + v, 0)
    if (totalRake === 0) return { top3: 0, top10: 0, gini: 0, totalRake: 0 }
    const top3 = sortedDesc.slice(0, 3).reduce((s, v) => s + v, 0) / totalRake
    const top10Count = Math.max(1, Math.ceil(sortedDesc.length * 0.1))
    const top10 = sortedDesc.slice(0, top10Count).reduce((s, v) => s + v, 0) / totalRake
    // Gini requires ascending order
    const n = sortedAsc.length
    let gini = 0
    for (let i = 0; i < n; i++) gini += (2 * (i + 1) - n - 1) * sortedAsc[i]
    gini = n > 1 ? gini / (n * totalRake) : 0
    return { top3, top10, gini, totalRake }
  }

  const [resA, resB] = await Promise.all([compute(rangeA), compute(rangeB)])
  return {
    top10PctA: resA.top10, top10PctB: resB.top10,
    top3ShareA: resA.top3, top3ShareB: resB.top3,
    giniA: resA.gini, giniB: resB.gini,
  }
}

async function fetchPvrRanking(monthA: string, monthB: string): Promise<{ salite: PvrRankMove[]; discese: PvrRankMove[] }> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  async function rank(range: { start: string; end: string }): Promise<Map<string, { name: string; rake: number; rank: number }>> {
    const { data } = await supabase.from('daily_pvr_stats').select('pvr_id, rake').gte('date', range.start).lte('date', range.end)
    const agg = new Map<string, number>()
    for (const r of data || []) agg.set(r.pvr_id, (agg.get(r.pvr_id) || 0) + toNum(r.rake))
    const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
    const map = new Map<string, { name: string; rake: number; rank: number }>()
    sorted.forEach(([id, rake], i) => map.set(id, { name: id.slice(0, 8), rake, rank: i + 1 }))
    return map
  }

  // Get names separately
  const { data: pvrsData } = await (supabase.from('pvrs').select('id, name') as any).neq('tipo', 'agent')
  const pvrNames = new Map<string, string>()
  for (const p of (pvrsData || []) as any[]) pvrNames.set(p.id, p.name as string)

  const [rankA, rankB] = await Promise.all([rank(rangeA), rank(rangeB)])
  const moves: PvrRankMove[] = []
  for (const [id, rb] of rankB) {
    const ra = rankA.get(id)
    if (ra) {
      moves.push({
        pvrId: id, pvrName: pvrNames.get(id) || id.slice(0, 8),
        rankA: ra.rank, rankB: rb.rank, rakeA: ra.rake, rakeB: rb.rake,
      })
    }
  }
  moves.sort((a, b) => (b.rankA - b.rankB) - (a.rankA - a.rankB))
  const salite = moves.filter(m => m.rankA - m.rankB > 0).sort((a, b) => (b.rankA - b.rankB) - (a.rankA - a.rankB)).slice(0, 5)
  const discese = moves.filter(m => m.rankA - m.rankB < 0).sort((a, b) => (a.rankA - a.rankB) - (b.rankA - b.rankB)).slice(0, 5)
  return { salite, discese }
}

async function fetchQuality(monthA: string, monthB: string): Promise<QualityData> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  const [
    { data: netA }, { data: netB },
    { count: upA }, { count: upB },
    { data: pvrA }, { data: pvrB },
    { data: playerA }, { data: playerB },
  ] = await Promise.all([
    supabase.from('daily_network_stats').select('rake').gte('date', rangeA.start).lte('date', rangeA.end),
    supabase.from('daily_network_stats').select('rake').gte('date', rangeB.start).lte('date', rangeB.end),
    supabase.from('excel_uploads').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('uploaded_at', `${rangeA.start}T00:00:00Z`).lt('uploaded_at', `${rangeA.end}T23:59:59Z`),
    supabase.from('excel_uploads').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('uploaded_at', `${rangeB.start}T00:00:00Z`).lt('uploaded_at', `${rangeB.end}T23:59:59Z`),
    supabase.from('daily_pvr_stats').select('pvr_id').gte('date', rangeA.start).lte('date', rangeA.end),
    supabase.from('daily_pvr_stats').select('pvr_id').gte('date', rangeB.start).lte('date', rangeB.end),
    supabase.from('daily_player_stats').select('player_id').gte('date', rangeA.start).lte('date', rangeA.end),
    supabase.from('daily_player_stats').select('player_id').gte('date', rangeB.start).lte('date', rangeB.end),
  ])

  const pvrIdsA = new Set(((pvrA || []) as any[]).map((r: any) => r.pvr_id))
  const pvrIdsB = new Set(((pvrB || []) as any[]).map((r: any) => r.pvr_id))
  const playerIdsA = new Set(((playerA || []) as any[]).map((r: any) => r.player_id))
  const playerIdsB = new Set(((playerB || []) as any[]).map((r: any) => r.player_id))

  const { count: totalPvr } = await (supabase.from('pvrs').select('*', { count: 'exact', head: true }) as any).neq('tipo', 'agent')
  const { count: totalPlayers } = await supabase.from('players').select('*', { count: 'exact', head: true })

  return {
    daysA: (netA || []).length, daysB: (netB || []).length,
    uploadsA: upA || 0, uploadsB: upB || 0,
    pvrMissingA: Math.max(0, (totalPvr || 0) - pvrIdsA.size),
    pvrMissingB: Math.max(0, (totalPvr || 0) - pvrIdsB.size),
    playersInactiveA: Math.max(0, (totalPlayers || 0) - playerIdsA.size),
    playersInactiveB: Math.max(0, (totalPlayers || 0) - playerIdsB.size),
    networkRakeA: (netA || []).reduce((s, r) => s + toNum(r.rake), 0),
    networkRakeB: (netB || []).reduce((s, r) => s + toNum(r.rake), 0),
    playerRakeSumA: 0,
    playerRakeSumB: 0,
  }
}

async function fetchChurn(monthA: string, monthB: string): Promise<ChurnPlayer[]> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('daily_player_stats').select('player_id, rake').gte('date', rangeA.start).lte('date', rangeA.end),
    supabase.from('daily_player_stats').select('player_id, rake').gte('date', rangeB.start).lte('date', rangeB.end),
  ])

  const aggA = new Map<string, number>()
  for (const r of a || []) aggA.set(r.player_id, (aggA.get(r.player_id) || 0) + toNum(r.rake))
  const idsB = new Set((b || []).map(r => r.player_id))

  const playerIds = Array.from(aggA.keys())
  const nameMap = new Map<string, string>()
  if (playerIds.length > 0) {
    const { data: names } = await supabase.from('players').select('id, username').in('id', playerIds)
    for (const n of names || []) nameMap.set(n.id, n.username as string)
  }

  return Array.from(aggA.entries())
    .filter(([id]) => !idsB.has(id))
    .map(([id, rake]) => ({ username: nameMap.get(id) || id.slice(0, 8), rakeLost: rake }))
    .sort((a, b) => b.rakeLost - a.rakeLost)
    .slice(0, 10)
}

async function fetchPvrEfficiency(month: string): Promise<PvrEfficiency[]> {
  const range = analysisMonthToRange(month)
  const [{ data: pvrStats }, { data: playerCounts }] = await Promise.all([
    supabase.from('daily_pvr_stats').select('pvr_id, rake').gte('date', range.start).lte('date', range.end),
    supabase.from('players').select('pvr_id').not('pvr_id', 'is', null),
  ])

  const pvrRake = new Map<string, number>()
  for (const r of pvrStats || []) pvrRake.set(r.pvr_id, (pvrRake.get(r.pvr_id) || 0) + toNum(r.rake))

  const pvrPlayers = new Map<string, number>()
  for (const r of playerCounts || []) pvrPlayers.set(r.pvr_id as string, (pvrPlayers.get(r.pvr_id as string) || 0) + 1)

  const allIds = Array.from(new Set([...pvrRake.keys(), ...pvrPlayers.keys()]))
  const { data: pvrsData } = await supabase.from('pvrs').select('id, name').in('id', allIds.length > 0 ? allIds : ['none'])
  const nameMap = new Map<string, string>()
  for (const p of pvrsData || []) nameMap.set(p.id, p.name as string)

  return Array.from(pvrRake.entries())
    .filter(([, rake]) => rake > 0)
    .map(([id, rake]) => {
      const players = pvrPlayers.get(id) || 1
      return { pvrId: id, pvrName: nameMap.get(id) || id.slice(0, 8), players, rake, efficiency: rake / players }
    })
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 10)
}

async function fetchBonusROI(monthA: string, monthB: string): Promise<{ a: BonusROI; b: BonusROI }> {
  const rangeA = analysisMonthToRange(monthA)
  const rangeB = analysisMonthToRange(monthB)

  async function compute(range: { start: string; end: string }, label: string): Promise<BonusROI> {
    const { data } = await supabase.from('daily_network_stats').select('buy_in_bonus, bet_bonus, rake').gte('date', range.start).lte('date', range.end)
    let buyInBonus = 0, betBonus = 0, rake = 0
    for (const r of data || []) {
      buyInBonus += toNum(r.buy_in_bonus)
      betBonus += toNum(r.bet_bonus)
      rake += toNum(r.rake)
    }
    const bonusErogato = buyInBonus + betBonus
    return { month: label, bonusErogato, buyInBonus, rake, roi: bonusErogato > 0 ? rake / bonusErogato : null }
  }

  const [a, b] = await Promise.all([compute(rangeA, monthA), compute(rangeB, monthB)])
  return { a, b }
}

// ─── Components ───

function DeltaBadge({ a, b, invert }: { a: number; b: number; invert?: boolean }) {
  const d = deltaPct(a, b)
  if (d === null) return <span className="text-[11px] text-text-muted">—</span>
  const positive = invert ? d < 0 : d > 0
  const neutral = Math.abs(d) < 1
  return (
    <span className={cn(
      'text-[11px] font-medium ml-1',
      neutral ? 'text-text-muted' : positive ? 'text-positive' : 'text-negative',
    )}>
      {neutral ? '≈' : d > 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
    </span>
  )
}

// ─── Main Page ───

export default function MonthComparisonPage() {
  const [monthA, setMonthA] = useState<string>(() => {
    const now = new Date()
    return previousMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  })
  const [monthB, setMonthB] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [retention, setRetention] = useState<RetentionData | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [concentration, setConcentration] = useState<ConcentrationData | null>(null)
  const [pvrMoves, setPvrMoves] = useState<{ salite: PvrRankMove[]; discese: PvrRankMove[] }>({ salite: [], discese: [] })
  const [quality, setQuality] = useState<QualityData | null>(null)
  const [churn, setChurn] = useState<ChurnPlayer[]>([])
  const [pvrEff, setPvrEff] = useState<PvrEfficiency[]>([])
  const [bonusROI, setBonusROI] = useState<{ a: BonusROI; b: BonusROI } | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [ret, cat, conc, pvr, qual, churnData, eff, bonus] = await Promise.all([
          fetchRetention(monthA, monthB),
          fetchCategories(monthA, monthB),
          fetchConcentration(monthA, monthB),
          fetchPvrRanking(monthA, monthB),
          fetchQuality(monthA, monthB),
          fetchChurn(monthA, monthB),
          fetchPvrEfficiency(monthB),
          fetchBonusROI(monthA, monthB),
        ])
        setRetention(ret)
        setCategories(cat)
        setConcentration(conc)
        setPvrMoves(pvr)
        setQuality(qual)
        setChurn(churnData)
        setPvrEff(eff)
        setBonusROI(bonus)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Errore caricamento dati')
      } finally {
        setLoading(false)
      }
    })()
  }, [monthA, monthB])

  // Collapsible state per section
  const [sections, setSections] = useState<Record<string, boolean>>({
    retention: true,
    churn: false,
    categories: true,
    concentration: true,
    ranking: false,
    pvrEfficiency: false,
    bonusROI: false,
    quality: false,
  })
  const toggle = (key: string) => setSections(prev => ({ ...prev, [key]: !prev[key] }))

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-bg-surface-elevated rounded" />
          <div className="h-64 bg-bg-surface-elevated rounded-xl" />
          <div className="h-48 bg-bg-surface-elevated rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-negative/10 border border-negative/30 rounded-xl p-6 text-center">
          <AlertTriangle size={32} className="text-negative mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-negative mb-2">Errore</h3>
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Confronto Mensile</h1>
          <p className="text-text-secondary mt-1">Analisi comparativa tra due periodi</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Mese A:</span>
            <MonthSelector selectedMonth={monthA} onMonthChange={setMonthA} />
          </div>
          <ArrowLeftRight size={16} className="text-text-muted" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Mese B:</span>
            <MonthSelector selectedMonth={monthB} onMonthChange={setMonthB} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* 1. Retention Matrix */}
        <CollapsibleSection
          title="Ritenzione Giocatori"
          icon={Users}
          open={sections.retention}
          onToggle={() => toggle('retention')}
        >
          {retention && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <RetentionCell label="Fidelizzati" sub={`in entrambi i mesi`} count={retention.fidelizzati.count} rake={retention.fidelizzati.rake} color="emerald" />
              <RetentionCell label="Nuovi" sub={`solo in ${formatAnalysisMonth(monthB)}`} count={retention.nuovi.count} rake={retention.nuovi.rake} color="blue" />
              <RetentionCell label="Persi" sub={`solo in ${formatAnalysisMonth(monthA)}`} count={retention.persi.count} rake={retention.persi.rake} color="red" />
              <RetentionCell label="Mai attivi" sub="in nessun mese" count={retention.mai.count} rake={0} color="slate" />
            </div>
          )}
        </CollapsibleSection>

        {/* Churn Radar */}
        <CollapsibleSection
          title="⚠️ Rischio Abbandono — Top 10 Giocatori Persi"
          icon={AlertTriangle}
          open={sections.churn}
          onToggle={() => toggle('churn')}
        >
          {churn.length > 0 ? (
            <div className="space-y-2">
              {churn.map((c, i) => (
                <div key={c.username} className="flex items-center justify-between bg-bg-surface-elevated rounded-lg p-3 border border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-muted w-5">#{i + 1}</span>
                    <span className="text-sm font-medium text-text-primary">{c.username}</span>
                  </div>
                  <span className="text-sm font-mono text-negative">−{formatCurrency(c.rakeLost)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Nessun giocatore perso tra i due mesi.</p>
          )}
        </CollapsibleSection>

        {/* 2. Category Mix */}
        <CollapsibleSection
          title="Evoluzione Mix Categorie"
          icon={BarChart3}
          open={sections.categories}
          onToggle={() => toggle('categories')}
        >
          {categories.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-text-muted font-medium border-b border-border-subtle">
                    <th className="text-left py-2 px-3">Categoria</th>
                    <th className="text-right py-2 px-3">{formatAnalysisMonth(monthA)}</th>
                    <th className="text-right py-2 px-3">{formatAnalysisMonth(monthB)}</th>
                    <th className="text-right py-2 px-3">Delta</th>
                    <th className="text-right py-2 px-3">Quota A</th>
                    <th className="text-right py-2 px-3">Quota B</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const totalA = categories.reduce((s, x) => s + x.rakeA, 0) || 1
                    const totalB = categories.reduce((s, x) => s + x.rakeB, 0) || 1
                    return (
                      <tr key={c.category} className="border-t border-border-subtle/50 hover:bg-bg-surface-highlight/30">
                        <td className="py-2 px-3 font-medium text-text-primary">{c.category}</td>
                        <td className="py-2 px-3 text-right font-mono text-text-secondary">{formatCurrency(c.rakeA)}</td>
                        <td className="py-2 px-3 text-right font-mono text-text-secondary">{formatCurrency(c.rakeB)}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          <span className={cn((c.rakeB - c.rakeA) >= 0 ? 'text-positive' : 'text-negative')}>
                            {(c.rakeB - c.rakeA) >= 0 ? '+' : ''}{formatCurrency(c.rakeB - c.rakeA)}
                          </span>
                          <DeltaBadge a={c.rakeB} b={c.rakeA} />
                        </td>
                        <td className="py-2 px-3 text-right text-text-muted">{((c.rakeA / totalA) * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right text-text-muted">{((c.rakeB / totalB) * 100).toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        {/* 3. Concentration */}
        <CollapsibleSection
          title="Concentrazione"
          icon={Activity}
          open={sections.concentration}
          onToggle={() => toggle('concentration')}
        >
          {concentration && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Top 10% share"
                valueA={`${(concentration.top10PctA * 100).toFixed(1)}%`}
                valueB={`${(concentration.top10PctB * 100).toFixed(1)}%`}
                a={concentration.top10PctB} b={concentration.top10PctA}
                invert
                hint="Più è alto, più il rake dipende da pochi"
              />
              <MetricCard
                label="Top 3 player share"
                valueA={`${(concentration.top3ShareA * 100).toFixed(1)}%`}
                valueB={`${(concentration.top3ShareB * 100).toFixed(1)}%`}
                a={concentration.top3ShareB} b={concentration.top3ShareA}
                invert
                hint="Rischio concentrazione sui top player"
              />
              <MetricCard
                label="Indice Gini"
                valueA={concentration.giniA.toFixed(3)}
                valueB={concentration.giniB.toFixed(3)}
                a={concentration.giniB} b={concentration.giniA}
                invert
                hint="0=perfetta uguaglianza, 1=monopolio"
              />
            </div>
          )}
        </CollapsibleSection>

        {/* Bonus ROI */}
        <CollapsibleSection
          title="💰 ROI Bonus"
          icon={BarChart3}
          open={sections.bonusROI}
          onToggle={() => toggle('bonusROI')}
        >
          {bonusROI && (
            <div className="grid grid-cols-2 gap-4">
              {[bonusROI.a, bonusROI.b].map((b) => (
                <div key={b.month} className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">{formatAnalysisMonth(b.month)}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Bonus erogato</span>
                      <span className="font-mono text-text-primary">{formatCurrency(b.bonusErogato)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">di cui Buy-in Bonus</span>
                      <span className="font-mono text-text-secondary">{formatCurrency(b.buyInBonus)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Rake generato</span>
                      <span className="font-mono text-text-primary">{formatCurrency(b.rake)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border-subtle pt-2">
                      <span className="text-text-muted font-medium">ROI</span>
                      <span className={cn('font-mono font-semibold', b.roi !== null && b.roi >= 1 ? 'text-positive' : 'text-warning')}>
                        {b.roi !== null ? `${b.roi.toFixed(2)}x` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* 4. PVR Ranking Moves */}
        <CollapsibleSection
          title="PVR — Maggiori Variazioni in Classifica"
          icon={TrendingUp}
          open={sections.ranking}
          onToggle={() => toggle('ranking')}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-positive mb-2 flex items-center gap-1"><TrendingUp size={14} /> In salita</h4>
              <div className="space-y-2">
                {pvrMoves.salite.map(m => (
                  <div key={m.pvrId} className="flex items-center justify-between bg-bg-surface-elevated rounded-lg p-3 border border-border-subtle">
                    <div>
                      <span className="text-sm font-medium text-text-primary">{m.pvrName}</span>
                      <span className="text-xs text-positive ml-2">+{m.rankA - m.rankB} pos.</span>
                    </div>
                    <span className="text-xs font-mono text-text-secondary">
                      {formatCurrency(m.rakeB)}
                    </span>
                  </div>
                ))}
                {pvrMoves.salite.length === 0 && <p className="text-xs text-text-muted">Nessuna variazione significativa</p>}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-negative mb-2 flex items-center gap-1"><TrendingDown size={14} /> In discesa</h4>
              <div className="space-y-2">
                {pvrMoves.discese.map(m => (
                  <div key={m.pvrId} className="flex items-center justify-between bg-bg-surface-elevated rounded-lg p-3 border border-border-subtle">
                    <div>
                      <span className="text-sm font-medium text-text-primary">{m.pvrName}</span>
                      <span className="text-xs text-negative ml-2">{m.rankA - m.rankB} pos.</span>
                    </div>
                    <span className="text-xs font-mono text-text-secondary">
                      {formatCurrency(m.rakeB)}
                    </span>
                  </div>
                ))}
                {pvrMoves.discese.length === 0 && <p className="text-xs text-text-muted">Nessuna variazione significativa</p>}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* PVR Efficiency */}
        <CollapsibleSection
          title="📊 Efficienza PVR — Rake per Giocatore"
          icon={Activity}
          open={sections.pvrEfficiency}
          onToggle={() => toggle('pvrEfficiency')}
        >
          {pvrEff.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-text-muted font-medium border-b border-border-subtle">
                    <th className="text-left py-2 px-3">PVR</th>
                    <th className="text-right py-2 px-3">Giocatori</th>
                    <th className="text-right py-2 px-3">Rake</th>
                    <th className="text-right py-2 px-3">Rake/Gioc.</th>
                  </tr>
                </thead>
                <tbody>
                  {pvrEff.map((e) => (
                    <tr key={e.pvrId} className="border-t border-border-subtle/50 hover:bg-bg-surface-highlight/30">
                      <td className="py-2 px-3 font-medium text-text-primary">{e.pvrName}</td>
                      <td className="py-2 px-3 text-right font-mono text-text-secondary">{e.players}</td>
                      <td className="py-2 px-3 text-right font-mono text-text-secondary">{formatCurrency(e.rake)}</td>
                      <td className="py-2 px-3 text-right font-mono text-positive font-semibold">{formatCurrency(e.efficiency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-muted">Nessun dato PVR disponibile per questo mese.</p>
          )}
        </CollapsibleSection>

        {/* 5. Data Quality */}
        <CollapsibleSection
          title="Qualità Dati"
          icon={AlertTriangle}
          open={sections.quality}
          onToggle={() => toggle('quality')}
        >
          {quality && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-text-muted font-medium border-b border-border-subtle">
                    <th className="text-left py-2 px-3">Metrica</th>
                    <th className="text-right py-2 px-3">{formatAnalysisMonth(monthA)}</th>
                    <th className="text-right py-2 px-3">{formatAnalysisMonth(monthB)}</th>
                  </tr>
                </thead>
                <tbody>
                  <QualityRow label="Giorni coperti" a={String(quality.daysA)} b={String(quality.daysB)} />
                  <QualityRow label="Upload completati" a={String(quality.uploadsA)} b={String(quality.uploadsB)} />
                  <QualityRow label="PVR senza dati" a={String(quality.pvrMissingA)} b={String(quality.pvrMissingB)} warnA={quality.pvrMissingA > 5} warnB={quality.pvrMissingB > 5} />
                  <QualityRow label="Giocatori inattivi" a={String(quality.playersInactiveA)} b={String(quality.playersInactiveB)} />
                  <QualityRow label="Rake rete" a={formatCurrency(quality.networkRakeA)} b={formatCurrency(quality.networkRakeB)} />
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

// ─── Sub-components ───

function CollapsibleSection({
  title, icon: Icon, open, onToggle, children,
}: {
  title: string; icon: React.ComponentType<{ size?: number; className?: string }>; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden"
    >
      <button onClick={onToggle} className="w-full p-4 flex items-center justify-between hover:bg-bg-surface-highlight/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-accent-blue" />
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        </div>
        {open ? <ChevronUp size={18} className="text-text-muted" /> : <ChevronDown size={18} className="text-text-muted" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </motion.div>
  )
}

function RetentionCell({ label, sub, count, rake, color }: { label: string; sub: string; count: number; rake: number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'border-l-emerald-400 bg-emerald-400/5',
    blue: 'border-l-blue-400 bg-blue-400/5',
    red: 'border-l-red-400 bg-red-400/5',
    slate: 'border-l-slate-500 bg-slate-500/5',
  }
  return (
    <div className={cn('rounded-lg p-4 border border-border-subtle border-l-4', colors[color] || colors.slate)}>
      <p className="text-sm font-semibold text-text-primary">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{count}</p>
      <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
      {rake > 0 && <p className="text-xs font-mono text-text-secondary mt-2">{formatCurrency(rake)}</p>}
    </div>
  )
}

function MetricCard({ label, valueA, valueB, a, b, invert, hint }: {
  label: string; valueA: string; valueB: string; a: number; b: number; invert?: boolean; hint: string;
}) {
  const d = deltaPct(a, b)
  const positive = invert ? (d !== null && d < 0) : (d !== null && d > 0)
  return (
    <div className="bg-bg-surface-elevated rounded-lg p-4 border border-border-subtle">
      <p className="text-[11px] text-text-muted mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-text-primary">{valueB}</span>
        {d !== null && (
          <span className={cn('text-xs font-medium', Math.abs(d) < 1 ? 'text-text-muted' : positive ? 'text-positive' : 'text-negative')}>
            {d > 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted mt-1">era {valueA}</p>
      <p className="text-[10px] text-text-muted mt-2 leading-tight">{hint}</p>
    </div>
  )
}

function QualityRow({ label, a, b, warnA, warnB }: { label: string; a: string; b: string; warnA?: boolean; warnB?: boolean }) {
  return (
    <tr className="border-t border-border-subtle/50">
      <td className="py-2 px-3 text-text-secondary">{label}</td>
      <td className={cn('py-2 px-3 text-right font-mono', warnA ? 'text-warning' : 'text-text-primary')}>{a}</td>
      <td className={cn('py-2 px-3 text-right font-mono', warnB ? 'text-warning' : 'text-text-primary')}>{b}</td>
    </tr>
  )
}
