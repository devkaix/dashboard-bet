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
  totalsTable: string | null // table to query for bet/rake/won totals
  totalsFields: string[] // ['bet','rake','won'] or ['amount','win_amount']
}

const DATASETS: Record<string, DatasetMeta> = {
  players_master: {
    label: 'Anagrafica Giocatori',
    table: 'players',
    description: 'Username, PVR, KYC, saldo',
    totalsTable: null,
    totalsFields: [],
  },
  daily_player: {
    label: 'Statistiche Giocatore × Giorno',
    table: 'daily_player_stats',
    description: 'Buy-in, bet, won, rake, payout per giocatore/giorno',
    totalsTable: 'daily_player_stats',
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_network: {
    label: 'Statistiche Rete × Giorno',
    table: 'daily_network_stats',
    description: 'Totali giornalieri rete — KPI ufficiale',
    totalsTable: 'daily_network_stats',
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_pvr: {
    label: 'Statistiche PVR × Giorno',
    table: 'daily_pvr_stats',
    description: 'Buy-in, bet, won, rake per PVR/giorno',
    totalsTable: 'daily_pvr_stats',
    totalsFields: ['bet', 'rake', 'won'],
  },
  daily_player_game: {
    label: 'Giocatore × Gioco × Giorno',
    table: 'daily_player_game_stats',
    description: 'Provider × gioco × giocatore × giorno',
    totalsTable: 'daily_player_game_stats',
    totalsFields: ['bet', 'rake', 'won'],
  },
  tickets: {
    label: 'Ticket Scommesse',
    table: 'tickets',
    description: 'Ticket code, importo, vincita, stato',
    totalsTable: 'tickets',
    totalsFields: ['amount', 'win_amount'],
  },
  player_summary: {
    label: 'Riepilogo Mensile (Validazione)',
    table: '—',
    description: 'Validato contro monthly_player_stats_v, mai scritto in daily_player_stats',
    totalsTable: null,
    totalsFields: [],
  },
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
}

// ─── Helpers ───

function statusBadge(status: string | null | undefined) {
  switch (status) {
    case 'validated':
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Validato' }
    case 'completed':
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completato' }
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

const toNumber = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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

      // Deduplicate: keep the latest upload per file_type
      const seen = new Set<string>()
      const latestUploads = ((allUploads || []) as UploadRecord[]).filter((u) => {
        const ft = u.file_type || 'unknown'
        if (seen.has(ft)) return false
        seen.add(ft)
        return true
      })

      // 2. Query each table: row count + aggregate sums
      // Must use explicit table names for TypeScript type safety

      const [playersRes, dpsRes, dnsRes, dpvrRes, dpgsRes, ticketsRes] =
        await Promise.all([
          supabase
            .from('players')
            .select('*', { count: 'exact', head: true }),
          supabase.from('daily_player_stats').select('bet, rake, won'),
          supabase.from('daily_network_stats').select('bet, rake, won'),
          supabase.from('daily_pvr_stats').select('bet, rake, won'),
          supabase
            .from('daily_player_game_stats')
            .select('bet, rake, won'),
          supabase.from('tickets').select('amount, win_amount'),
        ])

      const sumField = <T extends Record<string, unknown>>(
        rows: T[],
        field: string,
      ): number => rows.reduce((s, r) => s + toNumber(r[field]), 0)

      const dpsData = dpsRes.data || []
      const dnsData = dnsRes.data || []
      const dpvrData = dpvrRes.data || []
      const dpgsData = dpgsRes.data || []
      const ticketsData = ticketsRes.data || []

      const tableData: Record<
        string,
        { count: number; sums: Record<string, number> }
      > = {
        players: { count: playersRes.count || 0, sums: {} },
        daily_player_stats: {
          count: dpsData.length,
          sums: {
            bet: sumField(dpsData, 'bet'),
            rake: sumField(dpsData, 'rake'),
            won: sumField(dpsData, 'won'),
          },
        },
        daily_network_stats: {
          count: dnsData.length,
          sums: {
            bet: sumField(dnsData, 'bet'),
            rake: sumField(dnsData, 'rake'),
            won: sumField(dnsData, 'won'),
          },
        },
        daily_pvr_stats: {
          count: dpvrData.length,
          sums: {
            bet: sumField(dpvrData, 'bet'),
            rake: sumField(dpvrData, 'rake'),
            won: sumField(dpvrData, 'won'),
          },
        },
        daily_player_game_stats: {
          count: dpgsData.length,
          sums: {
            bet: sumField(dpgsData, 'bet'),
            rake: sumField(dpgsData, 'rake'),
            won: sumField(dpgsData, 'won'),
          },
        },
        tickets: {
          count: ticketsData.length,
          sums: {
            amount: sumField(ticketsData, 'amount'),
            win_amount: sumField(ticketsData, 'win_amount'),
          },
        },
      }

      // 4. Build dataset rows
      const datasetRows: DatasetRow[] = Object.entries(DATASETS).map(
        ([fileType, meta]) => {
          const upload =
            latestUploads.find((u) => u.file_type === fileType) || null

          const td = meta.table !== '—' ? tableData[meta.table] : null
          const tdTotals = meta.totalsTable
            ? tableData[meta.totalsTable]
            : null

          const anomalies: string[] = []

          if (upload?.status === 'error' || upload?.status === 'failed') {
            anomalies.push(
              upload.error_message || 'Errore durante l\'elaborazione',
            )
          }
          if (upload && upload.validation_status === 'failed') {
            anomalies.push('Validazione fallita')
          }

          // Check row count mismatch (>10% difference)
          if (
            upload &&
            upload.rows_processed != null &&
            td &&
            td.count > 0
          ) {
            const diff = Math.abs(upload.rows_processed - td.count)
            if (diff > upload.rows_processed * 0.1) {
              anomalies.push(
                `Differenza righe: importate ${upload.rows_processed.toLocaleString('it-IT')}, presenti ${td.count.toLocaleString('it-IT')}`,
              )
            }
          }

          // Missing upload
          if (!upload) {
            anomalies.push('Nessun upload registrato')
          }

          // Build totals array
          const totals =
            tdTotals && meta.totalsFields.length > 0
              ? meta.totalsFields.map((f) => ({
                  key: f,
                  value: tdTotals.sums[f] || 0,
                }))
              : null

          return {
            file_type: fileType,
            label: meta.label,
            table: meta.table,
            description: meta.description,
            upload,
            rowCount: td?.count ?? null,
            totals,
            anomalies,
          }
        },
      )

      setRows(datasetRows)
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Errore caricamento dati'
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
          Provenienza e stato dei dataset importati — tracciamento file →
          tabella
        </p>
      </motion.div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              label: 'Dataset',
              value: totalUploads,
              icon: Database,
              color: 'text-accent-blue',
              bg: 'bg-accent-blue/10',
            },
            {
              label: 'Validati',
              value: validatedCount,
              icon: CheckCircle2,
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10',
            },
            {
              label: 'Completati',
              value: completedCount,
              icon: FileSpreadsheet,
              color: 'text-accent-purple',
              bg: 'bg-accent-purple/10',
            },
            {
              label: 'Righe Totali',
              value: totalRowsProcessed.toLocaleString('it-IT'),
              icon: Hash,
              color: 'text-accent-cyan',
              bg: 'bg-accent-cyan/10',
              isString: true,
            },
            {
              label: 'Anomalie',
              value: withAnomalies,
              icon: AlertTriangle,
              color:
                withAnomalies > 0 ? 'text-amber-400' : 'text-text-muted',
              bg:
                withAnomalies > 0 ? 'bg-amber-500/10' : 'bg-bg-surface',
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
              className={cn(
                'rounded-xl border border-border-subtle p-4',
                card.bg,
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon size={14} className={card.color} />
                <span className="text-[12px] text-text-secondary">
                  {card.label}
                </span>
              </div>
              <div className={cn('text-xl font-bold', card.color)}>
                {'isString' in card && card.isString
                  ? String(card.value)
                  : String(card.value)}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-bg-surface rounded-xl border border-border-subtle p-4 animate-pulse"
            >
              <div className="h-4 w-40 bg-bg-surface-elevated rounded mb-2" />
              <div className="h-3 w-64 bg-bg-surface-elevated rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      {!loading && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary">
                  <th className="text-left py-3 px-4 font-medium">
                    Dataset
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    Ultimo file importato
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    Periodo
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    Righe
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    Tabella compilata
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    Stato
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    Totali principali
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    Anomalie
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const sb = statusBadge(
                    row.upload?.validation_status || row.upload?.status,
                  )
                  const StatusIcon = sb.icon

                  return (
                    <motion.tr
                      key={row.file_type}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.25 + i * 0.04,
                        duration: 0.3,
                      }}
                      className={cn(
                        'border-b border-border-subtle/50 hover:bg-bg-surface-elevated/30 transition-colors',
                        row.anomalies.length > 0 &&
                          'bg-amber-500/[0.03]',
                      )}
                    >
                      {/* Dataset */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary text-[13px]">
                            {row.label}
                          </span>
                          <span className="text-[11px] text-text-muted leading-tight mt-0.5">
                            {row.description}
                          </span>
                        </div>
                      </td>

                      {/* Ultimo file */}
                      <td className="py-3 px-4">
                        {row.upload ? (
                          <div className="flex flex-col">
                            <span
                              className="text-text-primary text-[13px] truncate max-w-[220px]"
                              title={row.upload.filename}
                            >
                              {row.upload.filename}
                            </span>
                            <span className="text-[11px] text-text-muted mt-0.5">
                              {row.upload.uploaded_at
                                ? new Date(
                                    row.upload.uploaded_at,
                                  ).toLocaleDateString('it-IT', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[13px]">
                            —
                          </span>
                        )}
                      </td>

                      {/* Periodo */}
                      <td className="py-3 px-4">
                        {row.upload?.period_start &&
                        row.upload?.period_end ? (
                          <span className="text-text-primary text-[13px] whitespace-nowrap">
                            {new Date(
                              row.upload.period_start,
                            ).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                            })}
                            {' → '}
                            {new Date(
                              row.upload.period_end,
                            ).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        ) : (
                          <span className="text-text-muted text-[13px]">
                            —
                          </span>
                        )}
                      </td>

                      {/* Righe */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-[13px] text-text-primary">
                          {row.upload?.rows_processed != null
                            ? row.upload.rows_processed.toLocaleString(
                                'it-IT',
                              )
                            : '—'}
                        </span>
                      </td>

                      {/* Tabella compilata */}
                      <td className="py-3 px-4">
                        <code className="text-[12px] bg-bg-surface-elevated px-1.5 py-0.5 rounded text-accent-cyan font-mono whitespace-nowrap">
                          {row.table}
                        </code>
                        {row.rowCount != null && (
                          <span className="text-[11px] text-text-muted ml-1.5 whitespace-nowrap">
                            ({row.rowCount.toLocaleString('it-IT')}{' '}
                            righe)
                          </span>
                        )}
                      </td>

                      {/* Stato */}
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium whitespace-nowrap',
                            sb.bg,
                            sb.color,
                          )}
                        >
                          <StatusIcon size={12} />
                          {sb.label}
                        </span>
                      </td>

                      {/* Totali principali */}
                      <td className="py-3 px-4 text-right">
                        {row.totals && row.totals.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {row.totals.map((t) => (
                              <span
                                key={t.key}
                                className="text-[12px] text-text-primary font-mono"
                              >
                                <span className="text-text-muted font-sans">
                                  {totalsLabel(t.key)}{' '}
                                </span>
                                {t.key === 'amount' ||
                                t.key === 'win_amount'
                                  ? formatCurrency(t.value)
                                  : formatCurrency(t.value)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[12px] text-text-muted">
                            —
                          </span>
                        )}
                      </td>

                      {/* Anomalie */}
                      <td className="py-3 px-4">
                        {row.anomalies.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {row.anomalies.map((a, ai) => (
                              <span
                                key={ai}
                                className="inline-flex items-center gap-1 text-[12px] text-amber-400"
                              >
                                <AlertTriangle
                                  size={11}
                                  className="flex-shrink-0"
                                />
                                {a}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[12px] text-text-muted">
                            —
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
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center py-16"
        >
          <Database className="w-12 h-12 mx-auto mb-3 text-text-muted" />
          <p className="text-text-secondary">
            Nessun dato disponibile. Importa dei file Excel dalla pagina
            Importa Dati.
          </p>
        </motion.div>
      )}

      {/* Refresh button */}
      {!loading && (
        <div className="flex justify-end">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-elevated transition-colors border border-border-subtle"
          >
            <RefreshCw size={14} />
            Aggiorna dati
          </button>
        </div>
      )}
    </div>
  )
}
