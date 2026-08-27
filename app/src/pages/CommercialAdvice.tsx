import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Lightbulb, Sparkles } from 'lucide-react'
import MonthSelector from '@/components/upload/MonthSelector'
import { normalizeAnalysisMonth } from '@/lib/analysisMonth'

// ─── Parsing suggerimenti (markdown → blocchi) ───
function parseAdviceBlocks(text: string): { title: string; problema: string; azione: string; priorita: string }[] {
  const blocks = text.split(/^###\s*/m).filter(Boolean)
  return blocks.map((b) => {
    const lines = b.split('\n')
    const title = (lines[0] || 'Suggerimento').trim()
    const problema = (b.match(/\*\*Problema:\*\*\s*(.+)/)?.[1]?.trim()) || ''
    const azione = (b.match(/\*\*Azione consigliata:\*\*\s*(.+)/)?.[1]?.trim()) || ''
    const prioritaRaw = (b.match(/\*\*Priorità:\*\*\s*(.+)/)?.[1]?.trim()) || 'Media'
    const priorita = prioritaRaw.toLowerCase().includes('alta') ? 'Alta' : prioritaRaw.toLowerCase().includes('bassa') ? 'Bassa' : 'Media'
    return { title, problema, azione, priorita }
  })
}

const PRIORITY_STYLE: Record<string, string> = {
  Alta: 'bg-negative/15 text-negative border-negative/30',
  Media: 'bg-warning/15 text-warning border-warning/30',
  Bassa: 'bg-info/15 text-info border-info/30',
}

const ADVICE_CHIPS = [
  'Quali PVR vanno contattati questo mese e perché?',
  'Come recuperare i giocatori che stiamo perdendo?',
  'Quali giocatori sono più a rischio e come trattenerli?',
  'Dove conviene investire in bonus questo mese?',
  'Quali PVR sono un modello da replicare?',
]

interface AdviceMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: number
}

function AdviceBubble({ message }: { message: AdviceMessage }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-accent-purple text-white px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }
  const blocks = parseAdviceBlocks(message.content)
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-border-subtle bg-bg-surface-elevated px-4 py-3">
        {blocks.length > 0 ? (
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-bg-surface p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] font-semibold text-text-primary">{b.title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${PRIORITY_STYLE[b.priorita] || PRIORITY_STYLE.Media}`}>
                    {b.priorita}
                  </span>
                </div>
                {b.problema && (
                  <p className="text-[12px] text-text-secondary"><span className="text-text-muted font-medium">Problema:</span> {b.problema}</p>
                )}
                {b.azione && (
                  <p className="text-[12px] text-text-primary mt-1"><span className="text-accent-blue font-medium">Azione consigliata:</span> {b.azione}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{message.content}</p>
        )}
      </div>
    </div>
  )
}

export default function CommercialAdvicePage() {
  const [month, setMonth] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMonth = params.get('month')
    if (urlMonth) {
      try { return normalizeAnalysisMonth(urlMonth) } catch { /* ignore */ }
    }
    const stored = localStorage.getItem('analysisMonth')
    if (stored) {
      try { return normalizeAnalysisMonth(stored) } catch { /* ignore */ }
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [messages, setMessages] = useState<AdviceMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleMonthChange = useCallback((m: string) => {
    setMonth(m)
    localStorage.setItem('analysisMonth', m)
    setMessages([])
  }, [])

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || loading) return
      const userMsg: AdviceMessage = {
        id: `adv-u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)
      setError(null)
      try {
        const { gatherCommercialFacts } = await import('@/lib/quickAnalysis')
        const facts = await gatherCommercialFacts(month)
        const resp = await fetch('/api/commercial-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facts, question: trimmed, month }),
        })
        const data = (await resp.json()) as { suggestions?: string; error?: string }
        if (!resp.ok || data.error) throw new Error(data.error || `Errore ${resp.status}`)
        const aiMsg: AdviceMessage = {
          id: `adv-a-${Date.now()}`,
          role: 'ai',
          content: data.suggestions || 'Nessuna risposta.',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, aiMsg])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Errore nella generazione della risposta')
      } finally {
        setLoading(false)
      }
    },
    [month, loading],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ask(input)
    }
  }

  return (
    <div className="h-[calc(100dvh-64px)] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.01em]">
            <span className="text-text-primary">Suggerimenti </span>
            <span className="text-accent-purple">Commerciali</span>
          </h2>
          <span className="text-[15px] text-text-secondary hidden sm:inline">Consigli operativi per la rete</span>
        </div>
        <MonthSelector selectedMonth={month} onMonthChange={handleMonthChange} />
      </div>

      {/* Chat */}
      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="w-full max-w-3xl flex flex-col min-h-0 px-6 py-4">
          {/* Domande suggerite */}
          <div className="flex gap-2 overflow-x-auto pb-3 flex-shrink-0">
            {ADVICE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => ask(chip)}
                disabled={loading}
                className="px-3 py-1.5 rounded-full bg-bg-surface-elevated text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-highlight transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Conversazione */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
            {messages.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-full bg-accent-purple/15 flex items-center justify-center mx-auto mb-4">
                  <Lightbulb size={22} className="text-accent-purple" />
                </div>
                <p className="text-[15px] text-text-primary font-medium">Chiedimi cosa fare questo mese</p>
                <p className="text-[13px] text-text-secondary mt-1">
                  Ti do consigli concreti sui dati del mese, oppure usa una delle domande qui sopra.
                </p>
              </div>
            ) : (
              messages.map((m) => <AdviceBubble key={m.id} message={m} />)
            )}
            {loading && (
              <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                <div className="w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
                Sto analizzando i dati del mese...
              </div>
            )}
          </div>

          {error && <p className="text-[13px] text-negative mt-2">⚠ {error}</p>}

          {/* Input */}
          <div className="flex items-center gap-2 pt-3 flex-shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Chiedi un consiglio sul mese..."
              disabled={loading}
              className="flex-1 bg-bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus disabled:opacity-50"
            />
            <button
              onClick={() => ask(input)}
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-purple text-white text-[13px] font-medium hover:brightness-110 transition-all disabled:opacity-50"
            >
              <Sparkles size={14} />
              Chiedi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
