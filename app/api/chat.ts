// ── Chat analitica conversazionale — Vercel Serverless Function ──────────────
// Riceve domanda + cronologia + fatti del mese e risponde in modo
// conversazionale e grounded, restituendo anche il "perché" (reasoning) e i
// riferimenti (provenienza dati) in formato JSON strutturato.
//
// Chiave: impostare OPENAI_API_KEY nelle Environment Variables di Vercel.

import type { IncomingMessage, ServerResponse } from 'node:http'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
      if (raw.length > 1_000_000) {
        reject(new Error('Body troppo grande'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

const DATA_DICTIONARY = `
DIZIONARIO DATI (fonti disponibili, usale SOLO queste per i "riferimenti"):
- daily_network_stats (date, rake, bet, won, buy_in_bonus, bet_bonus, payout, jackpot, refund) → totali di rete.
- daily_player_stats (player_id, date, rake, bet, won) → metriche per giocatore.
- daily_pvr_stats (pvr_id, date, rake, bet) → metriche per PVR.
- pvrs (id, name, exalogic_id, region, area_manager) → anagrafica PVR.
- players (id, username, pvr_id) → anagrafica giocatori.
- category_stats (analysis_month, category, rake) → rake per categoria (SCOMMESSE, CASINO, VIRTUALI).
`

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Metodo non consentito. Usa POST.' }))
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY non configurata nelle Environment Variables di Vercel.' }))
    return
  }

  let body: { question?: string; history?: ChatMessage[]; month?: string; facts?: string } = {}
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Body JSON non valido' }))
    return
  }

  const question = body.question?.trim() || 'Riassumi il mese.'
  const month = body.month || 'periodo corrente'
  const facts = body.facts || 'Nessun dato fornito.'
  const history = (body.history || []).slice(-10)

  const systemPrompt = `Sei l'assistente analitico di DAZN Bet, una rete di agenzie di scommesse fisiche (PVR). Rispondi in italiano in modo conversazionale, concreto e operativo. Mantieni il contesto dei turni precedenti della conversazione e rispondi correttamente ai follow-up (es. "e il mese scorso?", "e quel PVR?").

Ecco i DATI REALI del mese (${month}):
${facts}

${DATA_DICTIONARY}

REGOLE:
- Cita SOLO numeri, PVR e giocatori presenti nei DATI REALI, mai inventare.
- Se un dato non c'è, dillo chiaramente e proponi comunque un'azione utile.
- Ogni risposta deve essere auto-contenuta: non dire "guarda la dashboard" o "guarda gli alert".
- Il "reasoning" deve spiegare in 2-4 passi il ragionamento che porta alla risposta.
- I "references" devono citare SOLO tabelle/colonne/formule del DIZIONARIO DATI.
- Genera 2-3 "followUps" utili per approfondire.

Rispondi ESCLUSIVAMENTE con un JSON valido, nessun altro testo, con questo schema esatto:
{
  "content": "risposta conversazionale in markdown",
  "reasoning": ["passo logico 1", "passo logico 2"],
  "references": [
    { "table": "daily_network_stats", "columns": ["rake"], "formula": "SUM(rake)", "period": "${month}" }
  ],
  "followUps": ["approfondimento 1", "approfondimento 2"]
}`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ]

  try {
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResp.ok) {
      const errText = await openaiResp.text()
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `OpenAI error: ${openaiResp.status} ${errText}` }))
      return
    }

    const data = (await openaiResp.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content || '{}'

    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { content: raw }
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        content: typeof parsed.content === 'string' ? parsed.content : raw,
        reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [],
        references: Array.isArray(parsed.references) ? parsed.references : [],
        followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      })
    )
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Errore OpenAI' }))
  }
}
