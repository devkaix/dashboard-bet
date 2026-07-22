import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Save, Lightbulb, CheckCircle2, AlertCircle, MapPinned, Eye, Users } from 'lucide-react'

interface Pvr {
  id: string
  exalogic_id: string
  name: string
}

interface Mapping {
  pvr_ref_code: string
  pvr_id: string | null
  verified: boolean
  mapping_source: string | null
  notes: string | null
}

interface PreviewResult {
  reference_code: string
  new_pvr_id: string
  old_pvr_id: string | null
  was_verified: boolean
  total_players: number
  players_with_null_pvr: number
  players_with_same_pvr: number
  players_with_different_pvr: number
}

interface CoverageStats {
  codici_mw_distinti: number
  mapping_verificati: number
  mapping_proposti: number
  mapping_non_risolti: number
  giocatori_totali: number
  giocatori_con_refcode: number
  giocatori_con_pvrid: number
  giocatori_senza_pvrid: number
  giocatori_incoerenti: number
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function longestCommonSubstring(a: string, b: string): number {
  const s1 = normalize(a), s2 = normalize(b)
  let best = 0
  for (let i = 0; i < s1.length; i++)
    for (let j = i + 1; j <= s1.length && j - i > best; j++)
      if (s2.includes(s1.slice(i, j))) best = j - i
  return best
}

function proposePvr(code: string, pvrs: Pvr[]): Pvr | null {
  const suffix = code.replace(/^mw/i, '')
  if (!suffix) return null
  let best: Pvr | null = null, bestScore = 0
  for (const pvr of pvrs) {
    let score = 0
    if (normalize(pvr.name).includes(normalize(suffix))) score = 100 + suffix.length
    else score = longestCommonSubstring(suffix, pvr.name)
    if (score > bestScore) { bestScore = score; best = pvr }
  }
  return bestScore >= 3 ? best : null
}

export default function PvrMappingPage() {
  const [pvrs, setPvrs] = useState<Pvr[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [codes, setCodes] = useState<string[]>([])
  const [draft, setDraft] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState<Record<string, PreviewResult | null>>({})
  const [coverage, setCoverage] = useState<CoverageStats | null>(null)
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [previewTimestamps, setPreviewTimestamps] = useState<Record<string, number>>({})
  const [previewPvrIds, setPreviewPvrIds] = useState<Record<string, string | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      const [{ data: pvrsData }, { data: mapData }, { data: ticketsData }, { data: playersData }] = await Promise.all([
        supabase.from('pvrs').select('id, exalogic_id, name').order('name', { ascending: true }),
        supabase.from('pvr_reference_map').select('*'),
        supabase.from('tickets').select('pvr_code'),
        supabase.from('players').select('pvr_ref_code, pvr_id'),
      ])

      const pvrList = (pvrsData || []) as Pvr[]
      const mapList = (mapData || []) as Mapping[]

      const codeSet = new Set<string>()
      for (const row of ticketsData || []) { const c = row.pvr_code; if (c) codeSet.add(String(c).trim().toUpperCase()) }
      for (const row of playersData || []) { const c = row.pvr_ref_code; if (c) codeSet.add(String(c).trim().toUpperCase()) }
      for (const m of mapList) { if (m.pvr_ref_code?.toLowerCase().startsWith('mw')) codeSet.add(m.pvr_ref_code.toUpperCase()) }

      const allCodes = [...codeSet].filter(c => c.toLowerCase().startsWith('mw')).sort()
      const initialDraft: Record<string, string | null> = {}
      for (const code of allCodes) {
        const existing = mapList.find((m) => m.pvr_ref_code === code)
        initialDraft[code] = existing?.pvr_id ?? null
      }

      // Compute coverage stats
      const players = playersData || []
      const verifiedCodes = new Set(mapList.filter(m => m.verified).map(m => m.pvr_ref_code))
      const mwCodes = allCodes.filter(c => c.startsWith('MW') || c.startsWith('mw'))
      const unresolved = mwCodes.filter(c => !verifiedCodes.has(c))

      const coverageStats: CoverageStats = {
        codici_mw_distinti: mwCodes.length,
        mapping_verificati: mapList.filter(m => m.verified && m.pvr_ref_code?.toLowerCase().startsWith('mw')).length,
        mapping_proposti: mapList.filter(m => !m.verified && m.pvr_ref_code?.toLowerCase().startsWith('mw')).length,
        mapping_non_risolti: unresolved.length,
        giocatori_totali: players.length,
        giocatori_con_refcode: players.filter((p: any) => p.pvr_ref_code).length,
        giocatori_con_pvrid: players.filter((p: any) => p.pvr_id).length,
        giocatori_senza_pvrid: players.filter((p: any) => !p.pvr_id).length,
        giocatori_incoerenti: players.filter((p: any) => {
          if (!p.pvr_ref_code || !p.pvr_id) return false
          const code = p.pvr_ref_code.toUpperCase()
          const m = mapList.find(mm => mm.pvr_ref_code === code)
          return m && m.verified && m.pvr_id !== p.pvr_id
        }).length,
      }

      setPvrs(pvrList)
      setMappings(mapList)
      setCodes(allCodes)
      setDraft(initialDraft)
      setCoverage(coverageStats)
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Errore caricamento dati' })
    } finally { setLoading(false) }
  }

  async function previewMapping(code: string, pvrId: string | null) {
    if (!pvrId) { setPreview(p => ({ ...p, [code]: null })); return }
    try {
      const { data, error } = await (supabase as any).rpc('preview_pvr_mapping', {
        p_reference_code: code,
        p_pvr_id: pvrId,
      })
      if (error) throw error
      setPreview(p => ({ ...p, [code]: data as unknown as PreviewResult }))
      setPreviewTimestamps(p => ({ ...p, [code]: Date.now() }))
      setPreviewPvrIds(p => ({ ...p, [code]: pvrId }))
    } catch {
      setPreview(p => ({ ...p, [code]: null }))
    }
  }

  async function saveMapping(code: string, pvrId: string | null) {
    if (!pvrId) return
    setSaving((s) => ({ ...s, [code]: true }))
    setMessage(null)
    try {
      const { data, error } = await (supabase as any).rpc('verify_pvr_mapping', {
        p_reference_code: code,
        p_pvr_id: pvrId,
      })
      if (error) throw error

      const result = data as unknown as { success: boolean; affected_players: number; action: string }
      setPreview(p => ({ ...p, [code]: null }))
      setPreviewTimestamps(prev => { const n = { ...prev }; delete n[code]; return n })
      setPreviewPvrIds(prev => { const n = { ...prev }; delete n[code]; return n })
      setMessage({ type: 'success', text: `Mapping ${code} verificato. ${result.affected_players} giocatori aggiornati.` })
      await load()
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || `Errore salvataggio ${code}` })
    } finally { setSaving((s) => ({ ...s, [code]: false })) }
  }

  function applyProposals() {
    const next: Record<string, string | null> = { ...draft }
    for (const code of codes) {
      if (next[code]) continue
      const proposal = proposePvr(code, pvrs)
      if (proposal) next[code] = proposal.id
    }
    setDraft(next)
    setMessage({ type: 'success', text: 'Proposte applicate ai campi vuoti. Usa Anteprima per verificare prima di salvare.' })
  }

  const rows = useMemo(
    () => codes.map((code) => {
      const existing = mappings.find((m) => m.pvr_ref_code === code)
      const selectedId = draft[code] ?? existing?.pvr_id ?? null
      const selectedPvr = pvrs.find((p) => p.id === selectedId)
      const proposal = proposePvr(code, pvrs)
      return { code, existing, selectedId, selectedPvr, proposal }
    }),
    [codes, mappings, draft, pvrs],
  )

  const unmappedCount = rows.filter((r) => !r.existing?.verified).length
  const proposedCount = rows.filter((r) => !r.existing?.verified && r.proposal).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <MapPinned className="w-6 h-6 text-accent-blue" />
            Riconciliazione PVR
          </h1>
          <p className="text-text-secondary mt-1">
            Associa i codici commerciali (MW…) ai PVR numerici.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={applyProposals} disabled={loading}>
            <Lightbulb className="w-4 h-4 mr-2" /> Proponi tutti
          </Button>
        </div>
      </div>

      {/* Coverage Report */}
      {coverage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CoverageCard icon={MapPinned} label="Codici MW" value={coverage.codici_mw_distinti} color="text-accent-blue" />
          <CoverageCard icon={CheckCircle2} label="Verificati" value={coverage.mapping_verificati} color="text-emerald-400" />
          <CoverageCard icon={AlertCircle} label="Non risolti" value={coverage.mapping_non_risolti} color="text-amber-400" />
          <CoverageCard icon={Users} label="Giocatori senza PVR" value={coverage.giocatori_senza_pvrid} color="text-red-400" />
        </div>
      )}

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Codici PVR da riconciliare{' '}
            <Badge variant="secondary" className="ml-2">{unmappedCount} non verificati</Badge>
          </CardTitle>
          <CardDescription>
            Seleziona il PVR numerico e salva. Usa Anteprima se vuoi verificare l'impatto prima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-text-secondary py-8">Caricamento…</div>
          ) : rows.length === 0 ? (
            <div className="text-text-secondary py-8">Nessun codice PVR trovato.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-text-secondary">
                    <th className="text-left py-3 px-3 font-medium">Codice</th>
                    <th className="text-left py-3 px-3 font-medium">PVR</th>
                    <th className="text-left py-3 px-3 font-medium">Stato</th>
                    <th className="text-left py-3 px-3 font-medium">Seleziona</th>
                    <th className="text-left py-3 px-3 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ code, existing, selectedId, selectedPvr, proposal }) => {
                    const isVerified = !!(existing?.verified && existing?.pvr_id)
                    const previewData = preview[code]
                    return (
                      <>
                        <tr key={code} className="border-b border-border-subtle/50 hover:bg-bg-surface-elevated/30">
                          <td className="py-3 px-3 font-medium text-text-primary">{code}</td>
                          <td className="py-3 px-3 text-text-secondary">
                            {selectedPvr ? `${selectedPvr.exalogic_id} — ${selectedPvr.name}` : <span className="text-text-muted">—</span>}
                          </td>
                          <td className="py-3 px-3">
                            {isVerified ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="w-3 h-3 mr-1" />Verificato</Badge>
                            ) : selectedId ? (
                              <Badge variant="outline" className="text-amber-400 border-amber-400/30"><AlertCircle className="w-3 h-3 mr-1" />Da verificare</Badge>
                            ) : (
                              <Badge variant="secondary">Non mappato</Badge>
                            )}
                          </td>
                          <td className="py-3 px-3 min-w-[260px]">
                            <Select
                              value={selectedId || '__none__'}
                              onValueChange={(val) => {
                                const pvrId = val === '__none__' ? null : val
                                setDraft((d) => ({ ...d, [code]: pvrId }))
                                setPreview(p => ({ ...p, [code]: null }))
                                setPreviewTimestamps(prev => { const n = { ...prev }; delete n[code]; return n })
                                setPreviewPvrIds(prev => { const n = { ...prev }; delete n[code]; return n })
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Seleziona PVR…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— nessuno —</SelectItem>
                                {pvrs.map((pvr) => (
                                  <SelectItem key={pvr.id} value={pvr.id}>{pvr.exalogic_id} — {pvr.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {proposal && !isVerified && draft[code] !== proposal.id && (
                              <div className="text-xs text-text-muted mt-1">Proposta: {proposal.exalogic_id} — {proposal.name}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              {(() => {
                                const hasPreview = previewTimestamps[code] != null && previewPvrIds[code] === draft[code]
                                const canSave = !!draft[code] && !saving[code]
                                return (
                                  <>
                                    <Button size="sm" variant="outline"
                                      onClick={() => previewMapping(code, draft[code] || null)}
                                      disabled={!draft[code]}
                                    >
                                      <Eye className="w-3 h-3 mr-1" /> Anteprima
                                    </Button>
                                    <Button size="sm"
                                      onClick={() => saveMapping(code, draft[code] || null)}
                                      disabled={!canSave}
                                    >
                                      <Save className="w-3 h-3 mr-1" />
                                      {saving[code] ? '…' : 'Salva'}
                                    </Button>
                                  </>
                                )
                              })()}
                            </div>
                          </td>
                        </tr>
                        {/* Preview row */}
                        {previewData && (
                          <tr key={`${code}-preview`} className="bg-amber-500/5 border-b border-border-subtle/50">
                            <td colSpan={5} className="py-3 px-6">
                              <div className="text-xs space-y-1 text-text-secondary">
                                <p className="font-medium text-text-primary mb-1">Anteprima impatto per {code}:</p>
                                <p>Giocatori totali con questo codice: <strong>{previewData.total_players}</strong></p>
                                <p className="text-red-400">Senza PVR: <strong>{previewData.players_with_null_pvr}</strong></p>
                                <p className="text-emerald-400">Già associati correttamente: <strong>{previewData.players_with_same_pvr}</strong></p>
                                {previewData.players_with_different_pvr > 0 && (
                                  <p className="text-amber-400">⚠️ Associati a PVR diverso: <strong>{previewData.players_with_different_pvr}</strong> — saranno corretti</p>
                                )}
                                {previewData.was_verified && <p className="text-amber-400">⚠️ Mapping già verificato — sarà aggiornato con audit</p>}

                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CoverageCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 flex items-center gap-3">
      <Icon size={18} className={`${color} flex-shrink-0`} />
      <div>
        <p className="text-[11px] text-text-muted uppercase">{label}</p>
        <p className={`text-lg font-bold font-mono ${color}`}>{value.toLocaleString('it-IT')}</p>
      </div>
    </div>
  )
}
