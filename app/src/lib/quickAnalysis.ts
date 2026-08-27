// ── Analisi Veloce e Consigli Strategici — motore analitico ─────────────────
// Risponde a domande in linguaggio naturale usando gli stessi calcoli
// validati del Confronto Mensile. Ogni risposta chiude con un consiglio
// strategico basato sui dati.

import { supabase } from './supabase'
import { analysisMonthToRange, formatAnalysisMonth } from './analysisMonth'
import { formatCurrency } from './data'

// ─── Tipi ───

export type QuickComponent =
  | { type: 'kpi'; value: number; delta: number; label: string; vsLabel: string }
  | { type: 'table'; headers: string[]; rows: (string | number)[][] }
  | { type: 'trend'; data: { label: string; value: number }[] }
  | { type: 'alert'; severity: 'critical' | 'warning' | 'info'; count: number; message: string }

export interface QuickAnswer {
  content: string
  component?: QuickComponent
}

// ─── Helpers ───

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

async function playerRakeByMonth(month: string): Promise<Map<string, { rake: number; bet: number }>> {
  const range = analysisMonthToRange(month)
  const { data } = await supabase
    .from('daily_player_stats')
    .select('player_id, rake, bet')
    .gte('date', range.start)
    .lte('date', range.end)
  const map = new Map<string, { rake: number; bet: number }>()
  for (const r of data || []) {
    const pid = String((r as Record<string, unknown>).player_id)
    const e = map.get(pid) || { rake: 0, bet: 0 }
    e.rake += toNum((r as Record<string, unknown>).rake)
    e.bet += toNum((r as Record<string, unknown>).bet)
    map.set(pid, e)
  }
  return map
}

async function networkRake(month: string): Promise<{ rake: number; bet: number; won: number }> {
  const range = analysisMonthToRange(month)
  const { data } = await supabase
    .from('daily_network_stats')
    .select('rake, bet, won')
    .gte('date', range.start)
    .lte('date', range.end)
  let rake = 0, bet = 0, won = 0
  for (const r of data || []) {
    rake += toNum((r as Record<string, unknown>).rake)
    bet += toNum((r as Record<string, unknown>).bet)
    won += toNum((r as Record<string, unknown>).won)
  }
  return { rake, bet, won }
}

async function usernamesFor(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('players').select('id, username').in('id', ids)
  for (const n of data || []) map.set(String((n as Record<string, unknown>).id), String((n as Record<string, unknown>).username))
  return map
}

// ─── Analisi ───

async function rakeAnalysis(month: string): Promise<QuickAnswer> {
  const pm = prevMonth(month)
  const [cur, prev] = await Promise.all([networkRake(month), networkRake(pm).catch(() => ({ rake: 0, bet: 0, won: 0 }))])
  const label = formatAnalysisMonth(month)
  const prevLabel = formatAnalysisMonth(pm)
  const hasPrev = prev.rake !== 0
  const deltaPct = hasPrev && prev.rake !== 0 ? ((cur.rake - prev.rake) / Math.abs(prev.rake)) * 100 : null

  let content = `Nel ${label} il rake totale è ${formatCurrency(cur.rake)} su ${formatCurrency(cur.bet)} giocati e ${formatCurrency(cur.won)} vinti.`
  if (hasPrev && deltaPct !== null) {
    content += ` Rispetto a ${prevLabel} (${formatCurrency(prev.rake)}) è ${deltaPct >= 0 ? 'cresciuto' : 'calato'} del ${Math.abs(deltaPct).toFixed(1)}%.`
  } else {
    content += ` Non ci sono dati del mese precedente (${prevLabel}) per il confronto.`
  }
  content += hasPrev && deltaPct !== null && deltaPct < 0
    ? ' Consiglio: analizza quali PVR o giocatori hanno causato il calo per intervenire con precisione.'
    : ' Consiglio: proteggi i top giocatori con campagne mirate per mantenere il trend.'

  return {
    content,
    component: { type: 'kpi', value: cur.rake, delta: deltaPct ?? 0, label: 'Rake', vsLabel: `vs ${prevLabel}` },
  }
}

async function trendAnalysis(month: string): Promise<QuickAnswer> {
  const range = analysisMonthToRange(month)
  const { data } = await supabase
    .from('daily_network_stats')
    .select('date, rake')
    .gte('date', range.start)
    .lte('date', range.end)
    .order('date', { ascending: true })
  const points = (data || []).map((r) => ({
    label: String((r as Record<string, unknown>).date).slice(8, 10),
    value: Math.round(toNum((r as Record<string, unknown>).rake)),
  }))
  const negative = points.filter((p) => p.value < 0).length
  const best = points.reduce((a, b) => (b.value > a.value ? b : a), points[0] || { label: '', value: 0 })
  return {
    content: `Nel ${formatAnalysisMonth(month)} ci sono ${negative} giorni con rake negativo su ${points.length} totali. Il giorno migliore è stato il ${best.label} con ${formatCurrency(best.value)}. Consiglio: concentra promozioni nei giorni storicamente deboli.`,
    component: { type: 'trend', data: points },
  }
}

async function topPlayers(month: string, worst = false): Promise<QuickAnswer> {
  const map = await playerRakeByMonth(month)
  const sorted = Array.from(map.entries()).sort((a, b) => (worst ? a[1].rake - b[1].rake : b[1].rake - a[1].rake)).slice(0, 5)
  const names = await usernamesFor(sorted.map(([id]) => id))
  const rows = sorted.map(([id, e], i) => [
    worst ? `-${i + 1}` : `#${i + 1}`,
    names.get(id) || id.slice(0, 8),
    formatCurrency(e.rake),
    formatCurrency(e.bet),
  ])
  const totalPositive = Array.from(map.values()).reduce((s, e) => s + Math.max(0, e.rake), 0)
  const sum = sorted.reduce((s, [, e]) => s + e.rake, 0)
  const share = totalPositive > 0 ? Math.abs((sum / totalPositive) * 100) : 0

  if (worst) {
    return {
      content: `I 5 giocatori che fanno perdere di più in ${formatAnalysisMonth(month)}: insieme pesano ${share.toFixed(1)}% del rake lordo positivo. Consiglio: verifica questi conti, potrebbero avere strategie di scommessa a rischio o bonus abusati.`,
      component: { type: 'table', headers: ['Rank', 'Giocatore', 'Rake', 'Bet'], rows },
    }
  }
  const top1 = sorted[0]
  return {
    content: `Il giocatore top in ${formatAnalysisMonth(month)} è ${top1 ? names.get(top1[0]) || '—' : '—'} con ${formatCurrency(top1 ? top1[1].rake : 0)} di rake. Il top 5 insieme genera il ${share.toFixed(1)}% del rake lordo. Consiglio: sono i clienti da proteggere a ogni costo (bonus fedeltà, contatto diretto).`,
    component: { type: 'table', headers: ['Rank', 'Giocatore', 'Rake', 'Bet'], rows },
  }
}

async function topPvrs(month: string): Promise<QuickAnswer> {
  const range = analysisMonthToRange(month)
  const { data } = await supabase
    .from('daily_pvr_stats')
    .select('pvr_id, rake, bet')
    .gte('date', range.start)
    .lte('date', range.end)
  const agg = new Map<string, { rake: number; bet: number }>()
  for (const r of data || []) {
    const pid = String((r as Record<string, unknown>).pvr_id)
    const e = agg.get(pid) || { rake: 0, bet: 0 }
    e.rake += toNum((r as Record<string, unknown>).rake)
    e.bet += toNum((r as Record<string, unknown>).bet)
    agg.set(pid, e)
  }
  const top = Array.from(agg.entries()).sort((a, b) => b[1].rake - a[1].rake).slice(0, 5)
  const allIds = top.map(([id]) => id)
  const { data: pvrsData } = await (supabase.from('pvrs').select('id, name') as any).in('id', allIds.length ? allIds : ['none'])
  const nameMap = new Map<string, string>()
  for (const p of (pvrsData || []) as any[]) nameMap.set(String(p.id), String(p.name || p.id))
  const rows = top.map(([id, e], i) => [`#${i + 1}`, nameMap.get(id) || id.slice(0, 8), formatCurrency(e.rake), formatCurrency(e.bet)])
  const top1 = top[0]
  return {
    content: `Il PVR più forte in ${formatAnalysisMonth(month)} è ${top1 ? nameMap.get(top1[0]) || '—' : '—'} con ${formatCurrency(top1 ? top1[1].rake : 0)} di rake. Consiglio: studia il modello di questo PVR e applicalo a quelli sotto la media.`,
    component: { type: 'table', headers: ['Rank', 'PVR', 'Rake', 'Bet'], rows },
  }
}

async function retentionAnalysis(month: string): Promise<QuickAnswer> {
  const pm = prevMonth(month)
  const [cur, prev] = await Promise.all([playerRakeByMonth(month), playerRakeByMonth(pm)])
  const idsCur = new Set(cur.keys())
  const idsPrev = new Set(prev.keys())
  let fidelizzati = 0, fidelRake = 0, nuovi = 0, nuoviRake = 0, persi = 0, persiRake = 0
  for (const id of idsPrev) {
    if (idsCur.has(id)) { fidelizzati++; fidelRake += cur.get(id)!.rake }
    else { persi++; persiRake += prev.get(id)!.rake }
  }
  for (const id of idsCur) if (!idsPrev.has(id)) { nuovi++; nuoviRake += cur.get(id)!.rake }

  const persiNames = await usernamesFor(
    Array.from(prev.entries()).filter(([id]) => !idsCur.has(id)).sort((a, b) => b[1].rake - a[1].rake).slice(0, 3).map(([id]) => id),
  )
  const topPersi = Array.from(prev.entries())
    .filter(([id]) => !idsCur.has(id))
    .sort((a, b) => b[1].rake - a[1].rake)
    .slice(0, 3)
    .map(([id]) => persiNames.get(id) || id.slice(0, 8))

  return {
    content: `Tra ${formatAnalysisMonth(pm)} e ${formatAnalysisMonth(month)}: ${fidelizzati} giocatori fidelizzati, ${nuovi} nuovi (rake ${formatCurrency(nuoviRake)}), ${persi} persi (rake perso ${formatCurrency(persiRake)}). ${topPersi.length ? `I più pesanti persi: ${topPersi.join(', ')}.` : ''} Consiglio: recupera i persi più rilevanti con un contatto diretto e un bonus di rientro.`,
    component: {
      type: 'table',
      headers: ['Segmento', 'Giocatori', 'Rake'],
      rows: [
        ['Fidelizzati', fidelizzati, formatCurrency(fidelRake)],
        ['Nuovi', nuovi, formatCurrency(nuoviRake)],
        ['Persi', persi, formatCurrency(persiRake)],
      ],
    },
  }
}

async function categoryAnalysis(month: string): Promise<QuickAnswer> {
  const dbMonth = `${month}-01`
  const { data } = await supabase.from('category_stats').select('category, rake').eq('analysis_month', dbMonth).order('rake', { ascending: false })
  const rows = (data || []).map((r) => [String((r as Record<string, unknown>).category), formatCurrency(toNum((r as Record<string, unknown>).rake))])
  const topCat = data?.[0]
  const total = (data || []).reduce((s, r) => s + toNum((r as Record<string, unknown>).rake), 0)
  const share = topCat && total > 0 ? (toNum(topCat.rake) / total) * 100 : 0
  return {
    content: `In ${formatAnalysisMonth(month)} la categoria che genera più rake è ${String((topCat as any)?.category || '—')} con ${formatCurrency(toNum((topCat as any)?.rake || 0))} (${share.toFixed(1)}% del totale). Consiglio: se SCOMMESSE cresce, investi lì; se CASINO domina, diversifica con offerte sportive.`,
    component: { type: 'table', headers: ['Categoria', 'Rake'], rows },
  }
}

async function negativeDaysAnalysis(month: string): Promise<QuickAnswer> {
  const range = analysisMonthToRange(month)
  const { data } = await supabase
    .from('daily_network_stats')
    .select('date, rake')
    .gte('date', range.start)
    .lte('date', range.end)
    .order('date', { ascending: true })
  const neg = (data || []).filter((r) => toNum((r as Record<string, unknown>).rake) < 0)
  const worst = neg.length ? neg.reduce((a, b) => (toNum(a.rake) < toNum(b.rake) ? a : b)) : null
  return {
    content: `In ${formatAnalysisMonth(month)} ci sono ${neg.length} giorni con rake negativo${worst ? `; il peggiore è il ${String((worst as Record<string, unknown>).date).slice(8, 10)} con ${formatCurrency(toNum((worst as Record<string, unknown>).rake))}` : ''}. Consiglio: verifica payout e jackpot in quei giorni per capire se è un caso isolato o un pattern.`,
    component: {
      type: 'alert',
      severity: neg.length > 3 ? 'critical' : 'warning',
      count: neg.length,
      message: `${neg.length} giorni con rake negativo`,
    },
  }
}

// ─── Intent detection ───

export async function answerQuestion(rawText: string, month: string): Promise<QuickAnswer> {
  const text = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents

  if (/(peggior|perdita|perdono|negativo|perdi)/.test(text) && /(giocator|chi|conto)/.test(text)) return topPlayers(month, true)
  if (/(nuovi|persi|fidelizz|abbandono|ritenzion|recupera)/.test(text)) return retentionAnalysis(month)
  if (/(categoria|mix|casino|scommess|dove si guadagna)/.test(text)) return categoryAnalysis(month)
  if (/(efficien|per giocatore)/.test(text)) return topPvrs(month) // fallback: top PVR
  if (/(pvr|punti vendita)/.test(text)) return topPvrs(month)
  if (/(top|miglior|chi e|migliore)/.test(text) && /(giocator|player)/.test(text)) return topPlayers(month)
  if (/(giocator|player|chi)/.test(text)) return topPlayers(month)
  if (/(anomalie|giorni negativi|rake negativ|anomal)/.test(text)) return negativeDaysAnalysis(month)
  if (/(trend|andamento|giornaliero|grafico)/.test(text)) return trendAnalysis(month)
  if (/(rake|quanto|mese|periodo|confronta|peggio del precedente|vs)/.test(text)) return rakeAnalysis(month)

  // Default: panoramica del mese
  return rakeAnalysis(month)
}

// ─── Fatti per Suggerimenti Commerciali (inviati all'LLM) ───

/** Raccoglie i fatti chiave del mese in un testo compatto per il prompt LLM. */
export async function gatherCommercialFacts(month: string): Promise<string> {
  const pm = prevMonth(month)
  const label = formatAnalysisMonth(month)
  const lines: string[] = [`MESE: ${label}`]

  try {
    const [cur, prev] = await Promise.all([networkRake(month), networkRake(pm).catch(() => ({ rake: 0, bet: 0, won: 0 }))])
    const delta = prev.rake !== 0 ? ((cur.rake - prev.rake) / Math.abs(prev.rake)) * 100 : null
    lines.push(`RAKE TOTALE: ${formatCurrency(cur.rake)}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${formatAnalysisMonth(pm)})` : ''}`)
    lines.push(`BET: ${formatCurrency(cur.bet)} | WON: ${formatCurrency(cur.won)}`)
  } catch { /* ignora */ }

  try {
    const range = analysisMonthToRange(month)
    const { data } = await supabase.from('daily_network_stats').select('date, rake').gte('date', range.start).lte('date', range.end).order('date', { ascending: true })
    const neg = (data || []).filter((r) => toNum((r as Record<string, unknown>).rake) < 0)
    const worst = neg.length ? neg.reduce((a, b) => (toNum(a.rake) < toNum(b.rake) ? a : b)) : null
    lines.push(`GIORNI NEGATIVI: ${neg.length}${worst ? ` (peggiore ${String((worst as Record<string, unknown>).date).slice(8, 10)}, ${formatCurrency(toNum((worst as Record<string, unknown>).rake))})` : ''}`)
  } catch { /* ignora */ }

  try {
    const map = await playerRakeByMonth(month)
    const sorted = Array.from(map.entries()).sort((a, b) => b[1].rake - a[1].rake)
    const names = await usernamesFor(sorted.slice(0, 5).map(([id]) => id))
    const top3 = sorted.slice(0, 3).map(([id, e]) => `${names.get(id) || id.slice(0, 8)} (${formatCurrency(e.rake)})`).join(', ')
    lines.push(`TOP GIOCATORI: ${top3}`)
    const worst3 = sorted.filter(([, e]) => e.rake < 0).slice(0, 3).map(([id, e]) => `${names.get(id) || id.slice(0, 8)} (${formatCurrency(e.rake)})`).join(', ')
    if (worst3) lines.push(`GIOCATORI IN PERDITA: ${worst3}`)
  } catch { /* ignora */ }

  try {
    const [curMap, prevMap] = await Promise.all([playerRakeByMonth(month), playerRakeByMonth(pm)])
    const idsCur = new Set(curMap.keys())
    const idsPrev = new Set(prevMap.keys())
    let nuovi = 0, nuoviRake = 0, persi = 0, persiRake = 0
    for (const id of idsPrev) if (!idsCur.has(id)) { persi++; persiRake += prevMap.get(id)!.rake }
    for (const id of idsCur) if (!idsPrev.has(id)) { nuovi++; nuoviRake += curMap.get(id)!.rake }
    lines.push(`RITENZIONE: ${persi} giocatori persi (${formatCurrency(persiRake)} rake), ${nuovi} nuovi (${formatCurrency(nuoviRake)} rake)`)
  } catch { /* ignora */ }

  try {
    const range = analysisMonthToRange(month)
    const { data } = await supabase.from('daily_pvr_stats').select('pvr_id, rake').gte('date', range.start).lte('date', range.end)
    const agg = new Map<string, number>()
    for (const r of data || []) agg.set(String((r as Record<string, unknown>).pvr_id), (agg.get(String((r as Record<string, unknown>).pvr_id)) || 0) + toNum((r as Record<string, unknown>).rake))
    const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
    const ids = sorted.slice(0, 2).concat(sorted.slice(-2)).map(([id]) => id)
    const { data: pvrsData } = await (supabase.from('pvrs').select('id, name') as any).in('id', ids.length ? ids : ['none'])
    const nameMap = new Map<string, string>()
    for (const p of (pvrsData || []) as any[]) nameMap.set(String(p.id), String(p.name || p.id))
    if (sorted.length) lines.push(`TOP PVR: ${sorted.slice(0, 3).map(([id, r]) => `${nameMap.get(id) || id.slice(0, 8)} (${formatCurrency(r)})`).join(', ')}`)
    const worst = sorted.slice(-2).reverse()
    if (worst.length && worst[0][1] < 0) lines.push(`PVR IN PERDITA: ${worst.map(([id, r]) => `${nameMap.get(id) || id.slice(0, 8)} (${formatCurrency(r)})`).join(', ')}`)
  } catch { /* ignora */ }

  try {
    const dbMonth = `${month}-01`
    const { data } = await supabase.from('category_stats').select('category, rake').eq('analysis_month', dbMonth).order('rake', { ascending: false })
    const mix = (data || []).slice(0, 4).map((r) => `${String((r as Record<string, unknown>).category)} ${formatCurrency(toNum((r as Record<string, unknown>).rake))}`).join(', ')
    if (mix) lines.push(`MIX CATEGORIE: ${mix}`)
  } catch { /* ignora */ }

  return lines.join('\n')
}
