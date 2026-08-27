// ── Suggerimenti Commerciali — Vercel Serverless Function ───────────────────
// Riceve i fatti reali del mese (calcolati dal frontend) e le linee guida
// commerciali, e usa OpenAI per generare suggerimenti operativi in italiano.
//
// Chiave: impostare OPENAI_API_KEY nelle Environment Variables di Vercel
// (Project Settings → Environment Variables), NON nel frontend.

import type { IncomingMessage, ServerResponse } from 'node:http'

const DEFAULT_POINTERS = `
Linee guida commerciali DAZN Bet:
1. Un PVR con rake negativo ha spesso pochi giocatori che vincono sistematicamente: suggerisci verifica dei conti e, se serve, limitazione delle puntate.
2. I giocatori persi (churn) vanno recuperati con contatto diretto e bonus di rientro.
3. I PVR inattivi che hanno giocatori assegnati vanno riattivati con promozioni e supporto.
4. Payout molto alti (oltre ~105%) indicano possibili abusi o strategie vincenti: analizzare prima di agire.
5. I bonus si giustificano solo se il ROI è positivo (rake generato > bonus erogato).
6. Per acquisire nuovi giocatori: referral, bonus di benvenuto, eventi promozionali nei PVR.
7. I PVR più efficienti vanno studiati e usati come modello per quelli sotto la media.
8. Proteggere i top giocatori: bonus fedeltà e contatto diretto prima che vadano altrove.
`

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
    res.end(
      JSON.stringify({
        error: 'OPENAI_API_KEY non configurata nelle Environment Variables di Vercel.',
      })
    )
    return
  }

  let body: { facts?: string; pointers?: string; month?: string; question?: string } = {}
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Body JSON non valido' }))
    return
  }

  const facts = body.facts || 'Nessun dato fornito.'
  const pointers = body.pointers || DEFAULT_POINTERS
  const month = body.month || 'periodo corrente'
  const question = body.question?.trim()

  const systemPrompt = `Sei un consulente commerciale senior per DAZN Bet, una rete di agenzie di scommesse fisiche (PVR). Il direttore commerciale vuole suggerimenti operativi da eseguire subito, NON analisi generiche.

Ecco le linee guida commerciali dell'azienda:
${pointers}

Ecco i dati REALI del mese (${month}):
${facts}

FORMATO DI RISPOSTA OBBLIGATORIO. Rispondi esclusivamente con uno o più suggerimenti, ciascuno in questo formato esatto:
### [TITOLO]
- **Problema:** [cosa mostrano i dati, citando numeri e nomi concreti]
- **Azione consigliata:** [azione precisa da eseguire: chi contattare, quale bonus inviare, quale limite impostare, con tempi e valori]
- **Priorità:** Alta | Media | Bassa

REGOLE FERREE:
- Cita SEMPRE i nomi di PVR e giocatori presenti nei dati, con le cifre.
- Ogni suggerimento deve avere un'AZIONE eseguibile. Mai risposte vaghe come "guarda i dati", "controlla gli alert" o "verifica": quelle non sono suggerimenti.
- Se un PVR è in perdita, proponi verifica dei conti o limitazione delle puntate; se un giocatore sta uscendo, proponi contatto diretto e bonus di rientro.
- Se un dato manca, non inventarlo: dillo e proponi comunque l'azione più utile con i dati disponibili.
- Massimo 5 suggerimenti, ordinati per priorità (prima quelli con Priorità Alta).`

  const userMessage = question
    ? question
    : `Genera i suggerimenti commerciali per questo mese.`

  try {
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6,
      }),
    })

    if (!openaiResp.ok) {
      const errText = await openaiResp.text()
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `OpenAI error: ${openaiResp.status} ${errText}` }))
      return
    }

    const data = (await openaiResp.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text: string = data.choices?.[0]?.message?.content || ''

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ suggestions: text }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Errore OpenAI' }))
  }
}
