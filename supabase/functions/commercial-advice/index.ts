// ── Suggerimenti Commerciali — Edge Function ────────────────────────────────
// Riceve i fatti reali del mese (calcolati dal frontend) e le linee guida
// commerciali, e usa OpenAI per generare suggerimenti operativi in italiano.
//
// Chiave: impostare OPENAI_API_KEY nei Secrets di Supabase.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

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

Deno.serve(async (req) => {
  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY non configurata nei Secrets di Supabase." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  let body: { facts?: string; pointers?: string; month?: string } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Body JSON non valido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const facts = body.facts || "Nessun dato fornito."
  const pointers = body.pointers || DEFAULT_POINTERS
  const month = body.month || "periodo corrente"

  const systemPrompt = `Sei un consulente commerciale senior per DAZN Bet, una rete di agenzie di scommesse fisiche (PVR). Sei molto operativo e concreto: il direttore commerciale deve poter eseguire i tuoi consigli subito.

Ecco le linee guida commerciali dell'azienda:
${pointers}

Ecco i dati REALI del mese (${month}):
${facts}

Genera al massimo 5 suggerimenti commerciali in italiano, ordinati per priorità. Per ciascuno usa ESATTAMENTE questo formato Markdown:
### [TITOLO]
- **Problema:** [cosa dicono i dati]
- **Azione consigliata:** [cosa fare, concreto]
- **Priorità:** Alta | Media | Bassa

Regole:
- Cita solo PVR e giocatori presenti nei dati forniti (mai inventare).
- Ogni azione deve essere eseguibile dal commerciale (bonus, contatto, limitazione, formazione, promozione).
- Se un dato non c'è, non inventarlo.
- Massimo 5 suggerimenti, qualità sopra quantità.`

  try {
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Genera i suggerimenti commerciali per questo mese." },
        ],
        temperature: 0.6,
      }),
    })

    if (!openaiResp.ok) {
      const errText = await openaiResp.text()
      return new Response(JSON.stringify({ error: `OpenAI error: ${openaiResp.status} ${errText}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await openaiResp.json()
    const text: string = data.choices?.[0]?.message?.content || ""

    return new Response(JSON.stringify({ suggestions: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Errore OpenAI" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
