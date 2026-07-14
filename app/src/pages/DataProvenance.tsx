import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/data'
import { cn } from '@/lib/utils'
import {
  Shield,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Hash,
} from 'lucide-react'

// ─── Dataset configuration ───

interface DatasetMeta {
  label: string
  table: string
  description: string
  totalsQuery: ((periodStart: string, periodEnd: string) => Promise<{ count: number; sums: Record<string, number>; error?: string }>) | null
  totalsFields: string[]
}

// ─── Types ───

interface UploadRecord {
  id: string
  filename: string
  file_type: string | null
  period_start: string | null
  period_end: string | null
  rows_processed: number | null
  validation_status: string | null
  status: string | null
  uploaded_at: string | null
  error_message: string | null
}

interface DatasetRow {
  file_type: string
  label: string
  table: string
  description: string
  upload: UploadRecord | null
  rowCount: number | null
  totals: Array<{ key: string; value: number }> | null
  anomalies: string[]
  queryError: string | null
}

// ─── Helpers ───

function statusBadge(status: string | null | undefined) {
  switch (status) {
    case 'validated':
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Validato' }
    case 'completed':
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completato' }
    case 'mismatch':
      return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Mismatch' }
    case 'pending':
      return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'In attesa' }
    case 'error':
    case 'failed':
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Errore' }
    default:
      return { icon: AlertTriangle, color: 'text-text-muted', bg: 'bg-bg-surface', label: status || 'Sconosciuto' }
  }
}

function totalsLabel(field: string): string {
  switch (field) {
    case 'bet': return 'Bet'
    case 'rake': return 'Rake'
    case 'won': return 'Won'
    case 'amount': return 'Importo'
    case 'win_amount': return 'Vincite'
    default: return field
  }
}

// ─── SQL aggregation helpers (SUM in DB, not browser) ───

async function sumTable(table: string, fields: string[], start: string, end: string): Promise<{ count: number; sums: Record<string, number>; error?: string }> {
  // Build: SELECT SUM(f1), SUM(f2), COUNT(*) FROM table WHERE date BETWEEN start AND end
  const selectParts = fields.map(f => `sum(${f})`).join(', ')
  const query = `${selectParts}, count(*)`
  
  let q = (supabase as any).from(table).select(query)
  if (start) q = q.gte('date', start)
  if (end) q = q.lte('date', end)
  
  const { data, error, count } = await q
  
  if (error) return { count: 0, sums: {}, error: error.message }
  
  const row = (data?.[0] || {}) as unknown as Record<string, unknown>
  const sums: Record<string, number> = {}
  for (const f of fields) {
    sums[f] = Number(row[`sum(${f})`] ?? row[f] ?? 0) || 0
  }
  return { count: Number(row.count) || count || 0, sums }
}

async function sumTickets(start: string, end: string): Promise<{ count: number; sums: Record<string, number>; error?: string }> {
  // tickets uses emission_date (timestamptz) not date
  let q = supabase.from('tickets').select('sum(amount), sum(win_amount), count(*)')
  if (start) q = q.gte('emission_date', `${start}T00:00:00`)
  if (end) q = q.lte('emission_date', `${end}T23:59:59`)
  
  const result = await q
  
  if (result.error) return { count: 0, sums: {}, error: result.error.message }
  const data = result.data
  const count = result.count
  
  const row = (data?.[0] || {}) as unknown as Record<string, unknown>
  return {
    count: Number(row.count) || count || 0,
    sums: {
      amount: Number(row.sum) || 0,
      win_amount: Number(row['sum(win_amount)'] ?? 0) || 0,
    },
  }
}

async function countPlayers(): Promise<{ count: number; sums: Record<string, number>; error?: string }> {
  const { count, error } = await supabase.from('players').select('*', { count: 'exact', head: true })
  if (error) return { count: 0, sums: {}, error: error.message }
  return { count: count || 0, sums: {} }
}

// ─── DATASETS ───

const DATASETS: Record<string, DatasetMeta> = {
  players_master: {
    label: 'Anagrafica Giocatori',
    table: 'players',
    description: 'Username, PVR, KYC, saldo',
    totalsQuery: null, // count only, handled separately
    totalsFields: [],
  },
  daily_player: {
    label: 'Statistiche Giocatore × Giorno',
    table: 'daily_player_stats',
    description: 'Buy-in, bet, won, rake per giocatore/giorno',
    totalsQuery: (s, e) => sumTable('daily_player_stats', ['bet', 'rake', 'won'], s, e),
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_network: {
    label: 'Statistiche Rete × Giorno',
    table: 'daily_network_stats',
    description: 'Totali giornalieri rete — KPI ufficiale',
    totalsQuery: (s, e) => sumTable('daily_network_stats', ['bet', 'rake', 'won'], s, e),
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_pvr: {
    label: 'Statistiche PVR × Giorno',
    table: 'daily_pvr_stats',
    description: 'Buy-in, bet, won, rake per PVR/giorno',
    totalsQuery: (s, e) => sumTable('daily_pvr_stats', ['bet', 'rake', 'won'], s, e),
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_player_game: {
    label: 'Giocatore × Gioco × Giorno',
    table: 'daily_player_game_stats',
    description: 'Provider × gioco × giocatore × giorno',
    totalsQuery: (s, e) => sumTable('daily_player_game_stats', ['bet', 'rake', 'won'], s, e),
    totalsFields: ['bet', 'rake', 'won'],
  },
  tickets: {
    label: 'Ticket Scommesse',
    table: 'tickets',
    description: 'Ticket code, importo, vincita, stato',
    totalsQuery: (s, e) => sumTickets(s, e),
    totalsFields: ['amount', 'win_amount'],
  },
  player_summary: {
    label: 'Riepilogo Mensile (Validazione)',
    table: '\u2014',
    description: 'Validato contro monthly_player_stats_v, mai scritto in daily_player_stats',
    totalsQuery: null,
    totalsFields: [],
  },
}

// ─── Page ───

export default function DataProvenancePage() {
  const [rows, setRows] = useState<DatasetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch all uploads ordered by most recent first
      const { data: allUploads, error: uploadErr } = await supabase
        .from('excel_uploads')
        .select('*')
        .order('uploaded_at', { ascending: false })

      if (uploadErr) throw uploadErr

      // Deduplicate: keep the latest completed/validated upload per file_type
      const seen = new Set<string>()
      const latestUploads = ((allUploads || []) as UploadRecord[]).filter((u) => {
        const ft = u.file_type || 'unknown'
        if (seen.has(ft)) return false
        seen.add(ft)
        return true
      })

      // 2. Determine period from latest daily_network upload
      const networkUpload = latestUploads.find(u => u.file_type === 'daily_network')
      const periodStart = networkUpload?.period_start || null
      const periodEnd = networkUpload?.period_end || null

      // 3. Player count (global, not period-filtered)
      const playerResult = await countPlayers()

      // 4. Build dataset rows with period-filtered SQL aggregation
      const datasetRows: DatasetRow[] = await Promise.all(
        Object.entries(DATASETS).map(async ([fileType, meta]) => {
          const upload = latestUploads.find((u) => u.file_type === fileType) || null
          const anomalies: string[] = []
          let rowCount: number | null = null
          let totals: Array<{ key: string; value: number }> | null = null
          let queryError: string | null = null

          // Get totals via SQL aggregation (filtered by period where applicable)
          if (fileType === 'players_master') {
            rowCount = playerResult.count
            if (playerResult.error) {
              anomalies.push(`Errore query players: ${playerResult.error}`)
              queryError = playerResult.error
            }
          } else if (meta.totalsQuery && periodStart && periodEnd) {
            try {
              const result = await meta.totalsQuery(periodStart, periodEnd)
              if (result.error) {
                anomalies.push(`Errore query ${meta.table}: ${result.error}`)
                queryError = result.error
              } else {
                rowCount = result.count
                totals = meta.totalsFields.map((f) => ({
                  key: f,
                  value: result.sums[f] || 0,
                }))
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e)
              anomalies.push(`Errore query ${meta.table}: ${msg}`)
              queryError = msg
            }
          } else if (fileType === 'player_summary') {
            // Validation-only dataset, no query needed
            rowCount = null
          } else if (!periodStart || !periodEnd) {
            anomalies.push('Nessun periodo di riferimento (importa daily_network)')
          }

          // Upload status anomalies
          if (upload?.status === 'error' || upload?.status === 'failed') {
            anomalies.push(upload.error_message || 'Errore durante l\'elaborazione')
          }
          if (upload && (upload.validation_status === 'failed' || upload.validation_status === 'mismatch')) {
            anomalies.push(`Validazione: ${upload.validation_status}`)
          }

          // Row count mismatch vs upload (compare against same-period rows)
          if (upload && upload.rows_processed != null && rowCount != null && rowCount > 0) {
            const diff = Math.abs(upload.rows_processed - rowCount)
            if (diff > upload.rows_processed * 0.1) {
              anomalies.push(
                `Differenza righe: importate ${upload.rows_processed.toLocaleString('it-IT')}, presenti nel periodo ${rowCount.toLocaleString('it-IT')}`,
              )
            }
          }

          // Missing upload
          if (!upload) {
            anomalies.push('Nessun upload registrato')
          }

          return {
            file_type: fileType,
            label: meta.label,
            table: meta.table,
            description: meta.description,
            upload,
            rowCount,
            totals,
            anomalies,
            queryError,
          }
        }),
      )

      setRows(datasetRows)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore caricamento dati'
      console.error('DataProvenance load error:', e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived stats ───

  const totalUploads = rows.length
  const validatedCount = rows.filter(
    (r) => r.upload?.validation_status === 'validated',
  ).length
  const completedCount = rows.filter(
    (r) =>
      r.upload?.status === 'completed' ||
      r.upload?.validation_status === 'validated',
  ).length
  const withAnomalies = rows.filter((r) => r.anomalies.length > 0).length
  const withErrors = rows.filter((r) => r.queryError !== null).length
  const totalRowsProcessed = rows.reduce(
    (sum, r) => sum + (r.rowCount || 0),
    0,
  )

  // ─── Render ───

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Shield className="w-6 h-6 text-accent-purple" />
          Diagnostica Dati
        </h1>
        <p className="text-text-secondary mt-1">
          {rows.length > 0
            ? `Stato dataset — ${rows.filter(r => r.upload).length} file importati`
            : 'Caricamento in corso...'}
        </p>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-accent-purple animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-negative/10 border border-negative/30 rounded-xl p-6 text-center">
          <XCircle size={32} className="text-negative mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-negative mb-2">Errore</h3>
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-6 gap-4"
          >
            <SummaryCard icon={Database} label="Dataset" value={totalUploads} color="text-accent-blue" />
            <SummaryCard icon={CheckCircle2} label="Validati" value={validatedCount} color="text-emerald-400" />
            <SummaryCard icon={FileSpreadsheet} label="Completati" value={completedCount} color="text-accent-purple" />
            <SummaryCard icon={Hash} label="Righe Totali" value={totalRowsProcessed} color="text-accent-cyan" />
            <SummaryCard icon={AlertTriangle} label="Anomalie" value={withAnomalies} color="text-amber-400" />
            <SummaryCard icon={XCircle} label="Errori" value={withErrors} color="text-red-400" />
          </motion.div>

          {/* Dataset Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bg-surface-elevated">
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Dataset</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Ultimo File</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Periodo</th>
                    <th className="text-right text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Righe</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Tabella</th>
                    <th className="text-center text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Stato</th>
                    <th className="text-right text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Totali</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-text-muted px-4 py-2.5">Anomalie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const badge = statusBadge(row.upload?.validation_status || row.upload?.status)
                    const Icon = badge.icon
                    return (
                      <motion.tr
                        key={row.file_type}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.25 + i * 0.03 }}
                        className={cn(
                          'border-t border-border-subtle hover:bg-bg-surface-elevated transition-colors',
                          row.anomalies.length > 0 && 'bg-amber-500/5',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Database size={14} className="text-text-muted flex-shrink-0" />
                            <div>
                              <p className="text-[14px] font-medium text-text-primary">{row.label}</p>
                              <p className="text-[11px] text-text-muted">{row.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-text-secondary max-w-[180px] truncate">
                          {row.upload?.filename || '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-text-secondary whitespace-nowrap">
                          {row.upload?.period_start && row.upload?.period_end
                            ? `${row.upload.period_start} \u2192 ${row.upload.period_end}`
                            : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-text-primary">
                          {row.rowCount != null ? row.rowCount.toLocaleString('it-IT') : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-mono text-text-secondary">
                          {row.table}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', badge.bg, badge.color)}>
                            <Icon size={12} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.totals && row.totals.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.totals.map((t) => (
                                <p key={t.key} className="text-[12px] font-mono text-text-primary">
                                  <span className="text-text-muted">{totalsLabel(t.key)}:</span>{' '}
                                  {t.key === 'amount' || t.key === 'win_amount' || t.key === 'bet' || t.key === 'rake' || t.key === 'won'
                                    ? formatCurrency(t.value)
                                    : t.value.toLocaleString('it-IT')}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-text-muted">\u2014</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.anomalies.length > 0 ? (
                            <div className="space-y-1">
                              {row.anomalies.map((a, ai) => (
                                <p key={ai} className="text-[12px] text-amber-400 flex items-start gap-1">
                                  <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                                  {a}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={11} />
                              Nessuna anomalia
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-subtle p-4 flex items-center gap-3">
      <Icon size={20} className={cn(color, 'flex-shrink-0')} />
      <div>
        <p className="text-[11px] text-text-muted uppercase tracking-wide">{label}</p>
        <p className={cn('text-[20px] font-bold font-mono', color)}>{value.toLocaleString('it-IT')}</p>
      </div>
    </div>
  )
}
