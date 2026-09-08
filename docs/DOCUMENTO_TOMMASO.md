# Documento Tommaso — Guida per il nuovo sviluppatore

Ciao Tommaso. Questo documento ti accompagna dentro il progetto **DAZN Bet AI Decision
Platform**. È pensato per essere letto dall'inizio alla fine, in ordine, e ti dà tutto
quello che ti serve per muoverti nel codice senza perderti.

---

## 1. Cos'è questo progetto (in una frase)

Una web app che analizza i dati di una **rete di agenzie di scommesse fisiche (PVR)**:
importa i dati da file Excel, li mette in un database, e li mostra con dashboard,
grafici, una chat con l'AI e suggerimenti commerciali.

Termini che troverai sempre:

| Termine | Significato |
|---|---|
| **PVR** | Punto Vendita Raccolta (una singola agenzia di scommesse). Ha un **codice MW** tipo `MWSTELLA`. |
| **Rake** | Il guadagno della casa (margine). Positivo = guadagna, negativo = i giocatori vincono più di quanto giocano. |
| **Bet / Won** | Totale scommesso / totale vinto. |
| **Payout** | Won/Bet × 100, cioè quanto viene "restituito" ai giocatori. |
| **Giocatore** | Un cliente, identificato da uno **username** (es. `Abdou123`). |

---

## 2. Prima di tutto: come lo avvii

### Prerequisiti
- Node.js (recente) + npm.

### Comandi (sempre dentro la cartella `app/`)

```bash
cd app
npm install          # installa le dipendenze
npm run dev          # avvia il server di sviluppo (Vite)
npm run build        # compila per la produzione (tsc + vite build)
npm run typecheck    # solo controllo TypeScript, senza build
npm run test         # esegue i test (Vitest)
```

> **Importante**: la cartella di lavoro per i comandi è `app/`, ma il repository git
> ha radice in `gestionale bet service/`. I commit vanno fatti da lì, con percorsi
> tipo `app/src/...`.

---

## 3. Mappa mentale del progetto

```
app/
  api/                       ← Vercel Functions (codice che gira su Vercel, lato server)
    chat.ts                  ←   la chat analitica parla con OpenAI qui
    commercial-advice.ts     ←   i suggerimenti commerciali parlano con OpenAI qui
  src/
    main.tsx                 ← punto d'ingresso
    App.tsx                  ← elenco delle "pagine" (route)
    index.css                ← colori/tema (chiaro e scuro)
    pages/                   ← le schermate vere e proprie
    components/              ← pezzi riutilizzabili (card, sidebar, tooltip...)
    lib/                     ← la "logica" (dati, analisi, import)
```

### Le pagine (in `src/pages/`)

| File | Cosa fa |
|---|---|
| `Dashboard.tsx` | Home: KPI, grafici, top 10, distribuzione, briefing |
| `Network.tsx` | Albero gerarchico: azienda → agenti → PVR → giocatori |
| `Players.tsx` | Tabella dei giocatori + scheda dettaglio |
| `Copilot.tsx` | Chat analitica (fai domande sui dati) |
| `CommercialAdvice.tsx` | Suggerimenti commerciali (AI) |
| `MonthComparison.tsx` | Confronto tra due mesi |
| `Analytics.tsx` | Trend e analisi |
| `ExecutiveBriefing.tsx` | Riepilogo per il commerciale |
| `Upload.tsx` | Caricamento file Excel |
| `Settings.tsx` | Impostazioni |
| `PvrDetail.tsx` | Dettaglio di un singolo PVR |
| `PvrMapping.tsx` | Riconciliazione codici MW (non collegato alla navigazione) |
| `DataProvenance.tsx` | Documentazione provenienza dati (non collegato) |

---

## 4. Da dove vengono i dati?

I dati arrivano da **file Excel di Exalogic** che l'utente carica nella pagina
**"Importa Dati"** (`Upload.tsx`). L'app:

1. Legge il file Excel nel browser (libreria `xlsx`).
2. Riconosce il tipo di file (es. "giocato per giocatore", "giocato per PVR", "anagrafica").
3. Lo valida e lo salva in **Supabase** (PostgreSQL).

Le tabelle principali nel database:

| Tabella | Contiene |
|---|---|
| `pvrs` | Anagrafica dei punti vendita (nome, codice Exalogic, fido, saldo) |
| `players` | Anagrafica giocatori (username, PVR di riferimento) |
| `daily_network_stats` | Totali di rete, un rigo per giorno |
| `daily_player_stats` | Giocate per giocatore, un rigo per giocatore/giorno |
| `daily_pvr_stats` | Giocate per PVR, un rigo per PVR/giorno |
| `daily_player_game_stats` | Giocate per giocatore/gioco/giorno |
| `category_stats` | Rake per categoria (sport, casino, virtuali...) |
| `pvr_reference_map` | Mappa codice MW (`MWSTELLA`) → id PVR |

> **Concetto chiave**: ci sono dati "di rete", "di PVR" e "di giocatore" che devono
> essere **coerenti tra loro**. Non sempre lo sono (vedi §9).

---

## 5. Come si leggono i dati: il "data layer"

Tutta la lettura dei dati passa da **`src/lib/data.ts`**. È il cuore dell'app.

La funzione principale è `loadData(range)`: carica tutto e riempie un oggetto globale
chiamato **`dataStore`**.

```ts
import { loadData, dataStore } from '@/lib/data'

await loadData()          // carica i dati
dataStore.players          // array di giocatori
dataStore.pvrs             // array di PVR
dataStore.daily_kpis       // KPI giornalieri
dataStore.monthly_aggregates // totali del mese
```

Regole d'oro:
- **Non** fare query Supabase "a mano" sparse nelle pagine se il dato è già in `dataStore`.
- Se serve un calcolo nuovo, aggiungilo come funzione in `data.ts` (o nei file di analisi).
- Usa `formatCurrency()` e `formatPercent()` di `data.ts` per formattare.

---

## 6. Il sistema Chat (due chat, non confonderle)

### 6.1 Chat analitica (`Copilot.tsx`)
- L'utente fa una domanda ("chi sono i top giocatori?").
- Il frontend raccoglie un riassunto dei dati (`gatherCommercialFacts(month)`) e chiama
  `POST /api/chat`.
- `api/chat.ts` (su Vercel) chiama **OpenAI** e risponde in JSON:
  `{ content, reasoning, references, followUps }`.
- La risposta viene mostrata con markdown + un bottone "Perché e riferimenti"
  (apre un modal con spiegazione e fonti in linguaggio non tecnico).
- **Se OpenAI non risponde** (chiave mancante), c'è un fallback locale in
  `src/lib/quickAnalysis.ts` (`answerQuestion`).

### 6.2 Suggerimenti commerciali (`CommercialAdvice.tsx`)
- Stessa idea, ma chiama `POST /api/commercial-advice` e restituisce suggerimenti
  strutturati (Titolo / Problema / Azione / Priorità).

### Dove sta la "testa" dell'AI
- `src/lib/quickAnalysis.ts` = motore analitico **locale** (calcoli deterministici).
- `api/chat.ts` e `api/commercial-advice.ts` = il "cervello" OpenAI (lato Vercel).

> **Chiave OpenAI**: sta su **Vercel** (Environment Variables), **mai** nel frontend.

---

## 7. Il tema chiaro/scuro

- I colori sono **token CSS** (`--app-bg-base`, `--app-text-primary`, ...) definiti in
  `src/index.css`, con valori chiari in `:root` e scuri in `.dark`.
- Il toggle è nella `TopBar` e salva `theme` in `localStorage`.
- Quando aggiungi componenti, usa **sempre i token** (`bg-bg-surface`,
  `text-text-primary`, ecc.), **mai** colori hardcoded tipo `text-white` su sfondi
  chiari (sparirebbero nel tema chiaro).

---

## 8. Convenzioni e regole del progetto

1. **Identificativo PVR**: mostrare il **codice MW** (es. `MWSTELLA`), con fallback al
   nome. **Mai** mostrare UUID troncati (`id.slice(0, 8)`).
2. **Colonne non nei tipi generati**: per query con colonne come `tipo` o `provider`,
   usare `as any`.
3. **Chiamate Supabase**: usare `async/await` (il `.catch()` diretto può rompere i tipi).
4. **Tooltip**: usare il componente `InfoTooltip` (va in portal, non viene tagliato).
5. **Tutto deve essere "reale"**: niente dati finti o hardcodati. Se un dato non c'è,
   mostrare "non disponibile", non un numero inventato.
6. **Linguaggio per il cliente**: nelle UI rivolte al commerciale (suggerimenti, modal
   riferimenti) niente nomi di tabelle/colonne: solo italiano comprensibile.

---

## 9. Errori comuni e insidie (leggi prima di programmare)

- **`daily_pvr_stats` è incompleto**: copre solo ~23-32 PVR su 70. Se un'analisi PVR
  "non prende tutto", spesso è un dato mancante, non un bug. La pagina "Confronto
  Mensile" ha una sezione "Qualità Dati" che lo evidenzia.
- **I file Excel arrivano in vari formati**: i parser stanno in `importPipeline.ts`,
  non reinventarli.
- **`dataStore` va popolato prima di leggerlo**: se una pagina legge `dataStore` senza
  `loadData()`, troverà array vuoti.
- **Git**: i file `nul` e `player_import.json` nella radice sono spazzatura, non vanno
  committati (usare `git add <percorsi specifici>`).
- **Build Vercel**: fa `tsc -b && vite build`. Se TypeScript non compila, la deploy
  fallisce. Esegui sempre `npm run typecheck` prima di committare.

---

## 10. Esempio pratico: "aggiungi un nuovo KPI alla Dashboard"

Questo è il flusso tipico di una modifica:

1. **Trova il dato**: esiste già in `dataStore`? Se no, aggiungi una query/funzione in
   `data.ts`.
2. **Calcola** il valore (in `data.ts` o in un file di analisi).
3. **Mostralo** in `Dashboard.tsx` (usa `KpiCard`).
4. **Aggiungi un tooltip** con `InfoTooltip` che spiega cosa significa e da dove arriva.
5. **Verifica**: `npm run typecheck` e `npm run build`.
6. **Commit**: da `gestionale bet service/`, con messaggio chiaro (imperativo, es.
   "Add rake per player to dashboard").

---

## 11. Dove trovare altre informazioni

- `docs/ARCHITECTURE.md` — documentazione tecnica completa (stack, funzioni, moduli).
- `docs/DATA_PROVENANCE.md` — provenienza di ogni dato (tabella, colonna, formula).
- `docs/DATA_LINEAGE.md` — flusso di trasformazione dei dati.
- `GUIDA_DASHBOARD.md` — guida utente della dashboard.

---

## 12. Riepilogo in 30 secondi

- **Frontend**: React + TS + Tailwind, in `app/src/`.
- **Dati**: Supabase, letti tramite `lib/data.ts` (e `dataStore`).
- **AI**: Vercel Functions in `app/api/` (OpenAI).
- **Analisi**: `lib/quickAnalysis.ts` (chat), `lib/executiveBriefing.ts` (briefing),
  `lib/preprocessing.ts` (segnali).
- **Regola base**: dati reali, codice tipato, tooltip ovunque, identificativo MW.

Buon lavoro! 👍
