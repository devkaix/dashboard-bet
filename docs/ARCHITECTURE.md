# ARCHITETTURA — DAZN Bet AI Decision Platform

Documentazione tecnica dell'applicazione. Copre stack, architettura, data layer, motori
analitici, sistema chat, pipeline di import e tutti i moduli principali.

---

## 1. Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript (strict) + Vite 7 |
| Styling | Tailwind CSS 3 (design system a token + variabili CSS per dark/light) |
| Animazioni | framer-motion |
| Grafici | recharts |
| Tabelle | @tanstack/react-table |
| Routing | react-router (HashRouter) |
| Backend/dati | Supabase (PostgreSQL 17) via `@supabase/supabase-js` |
| Serverless | Vercel Functions (`app/api/*`) |
| AI | OpenAI (`gpt-4o-mini`) via Vercel Functions |
| Test | Vitest |

**Hosting**: Vercel (build root = `app/`, `buildCommand = npm run build`, `outputDirectory = dist`).
Il routing è una SPA con `rewrites` a `/index.html` (escluso `/api/*`).

---

## 2. Architettura e flusso dati

```
Browser (SPA)
   │
   ├─ lettura dati ──────────────► Supabase PostgREST (client anon, RLS attivo)
   │                                tabelle: pvrs, players, daily_network_stats,
   │                                daily_player_stats, daily_pvr_stats,
   │                                daily_player_game_stats, category_stats,
   │                                tickets, pvr_reference_map, excel_uploads, ...
   │
   ├─ import Excel ──────────────► parsing client (xlsx) → upsert → Supabase
   │
   └─ chat / suggerimenti ───────► Vercel Function `/api/*` → OpenAI
                                     └─ (il frontend raccoglie i "fatti" e li invia)
```

**Chiavi**: `VITE_SUPABASE_ANON_KEY` (frontend, pubblica) e `OPENAI_API_KEY`
(solo su Vercel, **mai** nel frontend).

**Tema**: `darkMode: ["class"]`. I colori sono token CSS (`--app-*`) con valori
chiari in `:root` e scuri in `.dark`. Il toggle salva in `localStorage` la chiave
`theme` e aggancia/rimuove la classe `dark` su `<html>`.

---

## 3. Struttura directory

```
app/
  api/                     # Vercel Serverless Functions
    chat.ts                #   chat analitica conversazionale (OpenAI)
    commercial-advice.ts   #   suggerimenti commerciali (OpenAI)
  src/
    main.tsx               # entry: HashRouter + ErrorBoundary
    App.tsx                # definizione route
    index.css              # token tema (chiaro/scuro) + Tailwind
    components/
      Layout.tsx           # shell (Sidebar + TopBar + Outlet)
      Sidebar.tsx          # navigazione laterale
      TopBar.tsx           # header (titolo + ricerca + tema)
      KpiCard.tsx          # card KPI con sparkline/tooltip
      GlassCard.tsx        # card "vetro" (glassmorphism)
      InfoTooltip.tsx      # tooltip "?" con spiegazione (portal)
      HealthScoreRing.tsx  # anello health score
      AlertItem.tsx        # item alert
      ErrorBoundary.tsx    # boundary errori
      upload/              # componenti pagina Upload
        MonthSelector.tsx
        DatasetCard.tsx
        ImportPreview.tsx
        MonthCompleteness.tsx
      ui/                   # primitivi shadcn (accordion, dialog, select, ...)
    hooks/
      use-mobile.ts
    lib/
      supabase.ts           # client Supabase
      data.ts               # DATA LAYER (fetch + dataStore)
      analysisMonth.ts      # utilità date/mese
      quickAnalysis.ts      # motore analitico chat
      executiveBriefing.ts  # motore Executive Briefing
      executiveBriefingConfig.ts
      executiveBriefingData.ts
      preprocessing.ts      # segnali di decisione (coda decisionale)
      importPipeline.ts     # contratti/parser file import
      uploadHelpers.ts      # helper upload
      monthlyDatasetStatus.ts
      utils.ts              # cn()
      database.types.ts / supabase.types.ts
    pages/
      Dashboard.tsx
      ExecutiveBriefing.tsx
      Network.tsx
      PvrDetail.tsx
      Players.tsx
      Analytics.tsx
      Copilot.tsx
      CommercialAdvice.tsx
      MonthComparison.tsx
      Upload.tsx
      Settings.tsx
      PvrMapping.tsx
      DataProvenance.tsx
```

---

## 4. Data layer — `lib/data.ts`

Espone il client dati, il catalogo dei tipi e lo store in-memory condiviso
(`dataStore`) popolato da `loadData()`.

### Tipi principali
- `PVR` — anagrafica punto vendita (`id`, `code` = codice MW, `name`, `fido`, `fido_used`, `saldo`, ...).
- `Player` — giocatore aggregato (`username`, `pvr_id`, `total_rake`, `total_bet`, `avg_payout`, `active_days`, ...).
- `DailyKPI` — KPI giornaliero di rete.
- `MonthlyAggregates` — totali mese (`rake`, `bet`, `won`, `active_players`, `bonus_erogati`, `bonus_utilizzati`).
- `Rankings`, `Metadata`, `Briefing`, `DaznBetData`.

### Funzioni principali
- `loadData(range?)` — carica tutto in parallelo e popola `dataStore` (metadati, gerarchia, KPI, ranking, aggregati, players, alert, briefing).
- `fetchNetworkHierarchy()` — costruisce PVR/regioni/AM/agenti + codici MW da `pvr_reference_map`.
- `fetchPlayers()` — aggrega `daily_player_stats` per giocatore.
- `fetchDailyKpis()` — serie giornaliera di rete.
- `fetchDailyStats()` — statistiche giornaliere per giocatore.
- `fetchMonthlyAggregates()` — totali mensili (rake/bet/won + bonus).
- `fetchPreviousMonthAggregates()` — aggregati mese precedente.
- `fetchRankings()` — top giocatori/PVR.
- `fetchPvrTotals()` — rake/bet per PVR.
- `fetchAvailableMonths()` — mesi disponibili.
- `fetchCategoryStats()` — rake per categoria (`category_stats`).
- `fetchLookbackObservations()` — osservazioni storiche.
- `getPvrName(pvrId)` / `getPvrCode(pvrId)` — risoluzione nome/codice PVR.
- `getData()` — accesso al cache.
- `playerStatus(activeDays)` — stato (attivo/warning/inattivo).

`dataStore` è un oggetto getter che espone `metadata`, `pvrs`, `agents`, `players`,
`daily_kpis`, `daily_stats`, `monthly_aggregates`, `rankings`, `pvr_totals`,
`alerts`, `briefing` con fallback vuoti.

---

## 5. Motori analitici

### 5.1 `lib/quickAnalysis.ts` — chat analitica
- `answerQuestion(text, month)` — rileva l'intento (regex) e smista verso le analisi.
- Funzioni di analisi: `rakeAnalysis`, `trendAnalysis`, `topPlayers`, `topPvrs`,
  `retentionAnalysis`, `categoryAnalysis`, `negativeDaysAnalysis`.
- Ogni risposta è un `QuickAnswer { content, component?, reasoning?, references? }`.
- `QuickComponent` = `kpi` | `table` | `trend` | `alert`.
- `gatherCommercialFacts(month)` — raccoglie i "fatti" del mese (testo compatto) da
  passare all'LLM (rake, top giocatori/PVR, ritenzione, mix categorie, PVR in perdita).
- `Reference { table, columns, formula, period }` — provenienza dati.

### 5.2 `lib/executiveBriefing.ts` — Executive Briefing
Genera insight e priorità da dati reali (no AI).
- `buildExecutiveBriefing(input)` — orchestrazione completa.
- `aggregateNetworkPeriod`, `aggregatePvrPeriods` — aggregazione.
- `computePvrContributions` — contributo PVR alla variazione rake.
- `computeDataAvailability` — copertura/qualità dati.
- `generateNetworkInsights`, `generatePvrInsights` — insight con severità/priorità.
- `generatePriorities`, `generateExecutiveSummary`, `rankInsights`, `deduplicateInsights`.

### 5.3 `lib/preprocessing.ts` — segnali di decisione
Rileva anomalie con baseline statistiche.
- `preprocessNetwork(observations, config)` — arricchisce i giorni con delta/z-score.
- `generateNetworkSignals(preprocessed)` — segnali (rake drop, payout, attivi).
- `buildDecisionQueue(signals)` — coda decisionale ordinata per priorità.
- `validateNetworkObservations` — validazione input.

### 5.4 `lib/analysisMonth.ts`
- `analysisMonthToRange(month)` → `{ start, end }` del mese.
- `normalizeAnalysisMonth`, `formatAnalysisMonth`, `analysisMonthToDatabaseDate`.

---

## 6. Sistema Chat (dettaglio)

Ci sono **due** esperienze di chat:

### 6.1 Chat analitica — `pages/Copilot.tsx` + `/api/chat`
1. L'utente scrive una domanda.
2. `handleSendMessage` raccoglie `facts = gatherCommercialFacts(month)` + cronologia
   (ultimi 10 turni) e chiama `POST /api/chat`.
3. `/api/chat` (Vercel) chiama OpenAI `gpt-4o-mini` con `response_format: json_object`
   e un prompt con: ruolo, dati reali, "data dictionary", regole anti-allucinazione.
4. Risposta JSON: `{ content, reasoning[], references[], followUps[] }`.
5. Il frontend renderizza `content` (markdown), il bottone CTA "Perché e riferimenti"
   (modal con ragionamento + fonti **in linguaggio non tecnico**), e i chip di follow-up.
6. **Fallback**: se `/api/chat` fallisce (es. chiave assente), usa `answerQuestion`
   (motore locale deterministico) con `component` (tabelle/grafici) + reasoning/references.

### 6.2 Suggerimenti commerciali — `pages/CommercialAdvice.tsx` + `/api/commercial-advice`
1. Domanda aperta + chip suggerite.
2. Raccoglie `gatherCommercialFacts(month)` e chiama `POST /api/commercial-advice`.
3. `/api/commercial-advice` chiama OpenAI e restituisce suggerimenti in formato
   `### TITOLO / Problema / Azione consigliata / Priorità`.
4. Il frontend parsa i blocchi e li mostra come card colorate per priorità.

**Nota**: le linee guida commerciali sono hardcoded nel codice (Vercel Function),
non modificabili dall'utente.

---

## 7. Pipeline di import — `lib/importPipeline.ts` + `uploadHelpers.ts`

- `ImportFileType` — tipi file riconosciuti (`pvr_hierarchy`, `players_master`,
  `daily_player`, `daily_network`, `daily_pvr`, `daily_player_game`, `tickets`,
  `player_summary`, `pvr_summary`, `category_summary`).
- `getContractByType(type)` — contratto di parsing (colonne, required, parser) per tipo.
- `parseImportRows(...)` — valida/parsa le righe Excel, produce `ParsedImportRow[]`
  e `ImportValidationIssue[]`.
- Parser: `parseRequiredNumber`, `parseOptionalNumber`, `parseRequiredDate`,
  `parseRequiredString`.
- `uploadHelpers.ts` — hash file, dedup, upsert.

---

## 8. Pagine

| Pagina | Route | Scopo |
|---|---|---|
| `Dashboard` | `/` | KPI, andamento, top 10, distribuzione, briefing, approfondimenti (mix categorie, provider, contributo rake) |
| `ExecutiveBriefing` | `/executive-briefing` | Insight/priorità per il commerciale (motore `executiveBriefing.ts`) |
| `Network` | `/network` | Albero gerarchico (azienda → agenti → PVR → giocatori), dettaglio PVR/giocatore, barra fido |
| `PvrDetail` | `/pvr/:pvrId` | Dettaglio singolo PVR |
| `Players` | `/players` | Tabella giocatori filtrabile + scheda giocatore (KPI, ripartizione categoria, trend) |
| `Analytics` | `/analytics` | Trend e analisi per periodo |
| `Copilot` | `/copilot` | Chat analitica conversazionale |
| `CommercialAdvice` | `/commercial-advice` | Suggerimenti commerciali (OpenAI) |
| `MonthComparison` | `/compare` | Confronto tra due mesi (ritenzione, categorie, concentrazione, ranking PVR, efficienza, ROI bonus, qualità dati) |
| `Upload` | `/upload` | Caricamento Excel e stato dataset |
| `Settings` | `/settings` | Soglie alert e riepilogo |
| `PvrMapping` | (non in route) | Riconciliazione codici MW → PVR (file presente ma non collegato) |
| `DataProvenance` | (non in route) | Documentazione provenienza dati (file presente ma non collegato) |

---

## 9. Componenti condivisi

- `KpiCard` — card KPI con icona, valore, delta, sparkline e tooltip (`helpText`).
- `GlassCard` — card con effetto vetro.
- `InfoTooltip` — tooltip informativo (rendered in portal per evitare overflow).
- `HealthScoreRing` — anello SVG per health score.
- `Layout` / `Sidebar` / `TopBar` — shell applicativa; `TopBar` contiene il toggle tema.
- `ui/*` — primitivi shadcn/radix (non di dominio, usati sporadicamente).

---

## 10. Convenzioni e note

- **Identificativo PVR**: si mostra il **codice MW** (`pvr_ref_code`), con fallback al
  nome / codice Exalogic. Mai UUID troncati (pattern `id.slice(0,8)` vietato come
  fallback "nome").
- **Colonne non nei tipi generati**: usare cast `as any` (es. `tipo`, `provider`).
- **Chiamate Supabase**: `PromiseLike` senza `.catch` → usare `async/await` o IIFE.
- **Tooltip**: sempre via `InfoTooltip` (portal), non inline in container con overflow.
- **I colori** semantici (positive/negative/warning/info/accent-*) sono fissi; i
  colori di sfondo/testo/bordo sono token CSS che cambiano con dark/light.

---

## 11. Environment variables

| Variabile | Dove | Note |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | frontend (Vercel) | chiave pubblica Supabase |
| `OPENAI_API_KEY` | Vercel (serverless) | usata da `/api/chat` e `/api/commercial-advice` |
