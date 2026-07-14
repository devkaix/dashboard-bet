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
import { Save, Lightbulb, CheckCircle2, AlertCircle, MapPinned } from 'lucide-react'

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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function longestCommonSubstring(a: string, b: string): number {
  const s1 = normalize(a)
  const s2 = normalize(b)
  let best = 0
  for (let i = 0; i < s1.length; i++) {
    for (let j = i + 1; j <= s1.length && j - i > best; j++) {
      if (s2.includes(s1.slice(i, j))) best = j - i
    }
  }
  return best
}

function proposePvr(code: string, pvrs: Pvr[]): Pvr | null {
  const suffix = code.replace(/^mw/i, '')
  if (!suffix) return null
  let best: Pvr | null = null
  let bestScore = 0
  for (const pvr of pvrs) {
    const name = pvr.name
    let score = 0
    if (normalize(name).includes(normalize(suffix))) {
      score = 100 + suffix.length
    } else {
      score = longestCommonSubstring(suffix, name)
    }
    if (score > bestScore) {
      bestScore = score
      best = pvr
    }
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

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      const [{ data: pvrsData }, { data: mapData }, { data: ticketsData }, { data: playersData }] = await Promise.all([
        supabase.from('pvrs').select('id, exalogic_id, name').order('name', { ascending: true }),
        supabase.from('pvr_reference_map').select('*'),
        supabase.from('tickets').select('pvr_code'),
        supabase.from('players').select('pvr_ref_code'),
      ])

      const pvrList = (pvrsData || []) as Pvr[]
      const mapList = (mapData || []) as Mapping[]

      const codeSet = new Set<string>()
      for (const row of ticketsData || []) {
        const c = row.pvr_code
        if (c) codeSet.add(String(c).trim())
      }
      for (const row of playersData || []) {
        const c = row.pvr_ref_code
        if (c) codeSet.add(String(c).trim())
      }
      for (const m of mapList) codeSet.add(m.pvr_ref_code)

      const allCodes = [...codeSet].sort()
      const initialDraft: Record<string, string | null> = {}
      for (const code of allCodes) {
        const existing = mapList.find((m) => m.pvr_ref_code === code)
        initialDraft[code] = existing?.pvr_id ?? null
      }

      setPvrs(pvrList)
      setMappings(mapList)
      setCodes(allCodes)
      setDraft(initialDraft)
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Errore caricamento dati' })
    } finally {
      setLoading(false)
    }
  }

  async function saveMapping(code: string, pvrId: string | null) {
    if (!pvrId) return
    setSaving((s) => ({ ...s, [code]: true }))
    setMessage(null)
    try {
      const pvr = pvrs.find((p) => p.id === pvrId)
      const payload = {
        pvr_ref_code: code,
        pvr_id: pvrId,
        verified: true,
        mapping_source: 'manual_reconciliation',
        notes: `Mapped to ${pvr?.exalogic_id || pvrId} via PVR mapping UI`,
      }
      const { error } = await supabase.from('pvr_reference_map').upsert(payload, { onConflict: 'pvr_ref_code' })
      if (error) throw error

      // Apply the verified mapping to existing players that reference this code.
      const { error: playerUpdateErr } = await supabase
        .from('players')
        .update({ pvr_id: pvrId })
        .eq('pvr_ref_code', code)
        .is('pvr_id', null)
      if (playerUpdateErr) throw playerUpdateErr

      setMappings((prev) => {
        const next = prev.filter((m) => m.pvr_ref_code !== code)
        next.push({ ...payload, mapping_source: payload.mapping_source as string | null, notes: payload.notes as string | null })
        return next
      })
      setDraft((d) => ({ ...d, [code]: pvrId }))
      setMessage({ type: 'success', text: `Mapping ${code} → ${pvr?.name || pvrId} salvato.` })
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || `Errore salvataggio ${code}` })
    } finally {
      setSaving((s) => ({ ...s, [code]: false }))
    }
  }

  function applyProposals() {
    const next: Record<string, string | null> = { ...draft }
    for (const code of codes) {
      if (next[code]) continue
      const proposal = proposePvr(code, pvrs)
      if (proposal) next[code] = proposal.id
    }
    setDraft(next)
    setMessage({ type: 'success', text: 'Proposte applicate ai campi vuoti. Verifica e salva.' })
  }

  async function saveAllProposals() {
    for (const code of codes) {
      const pvrId = draft[code]
      const existing = mappings.find((m) => m.pvr_ref_code === code)
      if (pvrId && !existing?.verified) {
        await saveMapping(code, pvrId)
      }
    }
  }

  const rows = useMemo(
    () =>
      codes.map((code) => {
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
            Associa i codici commerciali (MW…) ai PVR numerici. Solo i mapping <strong>verificati</strong> vengono usati dall’import giocatori.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={applyProposals} disabled={loading}>
            <Lightbulb className="w-4 h-4 mr-2" />
            Proponi tutti
          </Button>
          <Button onClick={saveAllProposals} disabled={loading || proposedCount === 0}>
            <Save className="w-4 h-4 mr-2" />
            Salva {proposedCount} proposte
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Codici PVR da riconciliare{' '}
            <Badge variant="secondary" className="ml-2">
              {unmappedCount} non verificati
            </Badge>
          </CardTitle>
          <CardDescription>
            Seleziona il PVR numerico corretto per ogni codice commerciale. I mapping salvati qui saranno marcanti come verificati.
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
                    <th className="text-left py-3 px-3 font-medium">Codice commerciale</th>
                    <th className="text-left py-3 px-3 font-medium">PVR numerico</th>
                    <th className="text-left py-3 px-3 font-medium">Stato</th>
                    <th className="text-left py-3 px-3 font-medium">Seleziona</th>
                    <th className="text-left py-3 px-3 font-medium">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ code, existing, selectedId, selectedPvr, proposal }) => {
                    const isVerified = !!(existing?.verified && existing?.pvr_id)
                    const isProposed = !isVerified && proposal?.id === selectedId && selectedId
                    return (
                      <tr key={code} className="border-b border-border-subtle/50 hover:bg-bg-surface-elevated/30">
                        <td className="py-3 px-3 font-medium text-text-primary">{code}</td>
                        <td className="py-3 px-3 text-text-secondary">
                          {selectedPvr ? (
                            <span>
                              {selectedPvr.exalogic_id} — {selectedPvr.name}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {isVerified ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Verificato
                            </Badge>
                          ) : selectedId ? (
                            <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Da verificare
                            </Badge>
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
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona PVR…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— nessuno —</SelectItem>
                              {pvrs.map((pvr) => (
                                <SelectItem key={pvr.id} value={pvr.id}>
                                  {pvr.exalogic_id} — {pvr.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {proposal && !isVerified && draft[code] !== proposal.id && (
                            <div className="text-xs text-text-muted mt-1">
                              Proposta: {proposal.exalogic_id} — {proposal.name}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <Button
                            size="sm"
                            onClick={() => saveMapping(code, draft[code] || null)}
                            disabled={!draft[code] || !!saving[code] || isVerified}
                          >
                            {saving[code] ? 'Salvataggio…' : 'Salva'}
                          </Button>
                        </td>
                      </tr>
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
