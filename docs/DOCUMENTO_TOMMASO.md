# Documento Tommaso — Passaggio di consegne

Questo documento serve a passare il progetto a un nuovo sviluppatore. Spiega **a che
punto è il lavoro, cosa è stato fatto, cosa manca, cosa non funziona bene, quali
decisioni sono state prese e come si lavora**. Non è una guida al codice (quella è in
`docs/ARCHITECTURE.md`): è il "verbale" dello stato del progetto.

---

## 1. Contesto (cosa stai ereditando)

Progetto **DAZN Bet AI Decision Platform**: una web app per analizzare la rete di
agenzie di scommesse fisiche (PVR) di DAZN Bet.

- I dati arrivano da **file Excel di Exalogic** che vengono caricati dentro l'app.
- L'app li salva in **Supabase** e li mostra con dashboard, grafici e due chat con l'AI.
- L'**utente finale** è il direttore commerciale: la priorità è che la demo faccia
  "effetto wow" e che i dati siano **credibili e reali** (mai numeri finti).

---

## 2. Stato attuale (cosa è già funzionante)

### Funzionalità completate
- **Dashboard** (home): 5 card KPI, andamento giornaliero rake/bet, Top 10 giocatori
  (switch migliori/peggiori), grafici Pareto e Torta PVR, Briefing, e la sezione
  "Approfondimenti" (Mix Categorie, Rake per Provider, Contributo al Rake).
- **Rete**: albero gerarchico azienda → agenti → PVR → giocatori, con dettaglio e
  **barra del fido** (verde/ambra/rosso in base all'utilizzo).
- **Giocatori**: tabella filtrabile + scheda giocatore con KPI e "Ripartizione per
  Categoria" (sport/casino/virtuali).
- **Chat analitica** (`/copilot`): domande in linguaggio naturale, risposta dell'AI
  (OpenAI) con "Perché e riferimenti" e domande di follow-up. Fallback locale se
  manca la chiave OpenAI.
- **Suggerimenti Commerciali** (`/commercial-advice`): pagina dedicata, consigli
  operativi generati da OpenAI sui dati del mese.
- **Confronto Mensile** (`/compare`): ritenzione, categorie, concentrazione, ranking
  PVR, efficienza, ROI bonus, qualità dati.
- **Importa Dati** (`/upload`): caricamento Excel, riconoscimento tipo file, stato
  dataset.
- **Tema chiaro/scuro** con toggle e persistenza.
- **Tooltip** esplicativi su card, grafici e barre.
- **Identificativo PVR**: si usa il codice MW (es. `MWSTELLA`), non l'UUID.

### Ultimi commit rilevanti (agosto 2026)
- Spostamento suggerimenti commerciali in pagina dedicata.
- Tooltip esplicativi su grafici/barre.
- Riferimenti chat in linguaggio non tecnico.
- Fix risoluzione nomi PVR (niente più UUID troncati).

---

## 3. Cosa resta da fare / in sospeso

- **Qualità dati PVR**: `daily_pvr_stats` copre solo ~23-32 PVR su 70 (vedi §5).
  Sarebbe utile un **fallback** che usa la somma del rake dei giocatori quando manca
  il dato PVR (come fa già la pagina Rete).
- **Classificazione "dove gioca"**: la mappatura provider→categoria è euristica e
  può sbagliare (es. giocatore segnato "casino" che in realtà gioca a "sport"). Si era
  ipotizzato di incrociare i `tickets` per distinguere meglio lo sport.
- **`PvrMapping.tsx` e `DataProvenance.tsx`**: file presenti ma **non collegati** alla
  navigazione (da decidere se finirli o rimuoverli).
- **Chat**: eventuale miglioramento con "tool calling" per risposte ancora più precise
  (oggi è facts-grounded, non fa chiamate a funzioni).

---

## 4. Problemi noti (da non dimenticare)

1. **Dati PVR incompleti**: metà dei PVR non ha `daily_pvr_stats`. Le analisi a
   livello PVR (ranking, efficienza) non coprono tutto. La pagina Confronto Mensile ha
   una sezione "Qualità Dati" che lo evidenzia.
2. **`category_stats` solo per giugno**: il grafico "Mix Categorie" è vuoto per maggio
   (manca il file "riepilogo per tipologia" di maggio).
3. **Maggio incompleto in alcune sezioni**: alcuni dati di maggio non sono stati
   caricati in tutte le tabelle.
4. **Colonne nei tipi generati**: alcune colonne (`tipo` su `pvrs`, `provider`) non
   sono nei tipi TypeScript generati → servono cast `as any`.
5. **File spazzatura in git**: `nul` e `player_import.json` nella radice NON vanno
   committati (usare `git add <percorso>` mirato).

---

## 5. Decisioni già prese (e perché)

- **Identificativo PVR = codice MW** (es. `MWSTELLA`), perché è come l'utente è abituato
  a vedere i punti vendita. Fallback: nome, poi codice Exalogic.
- **AI via Vercel, non Supabase Edge Functions**: l'utente ha chiesto esplicitamente
  di non usare Supabase per OpenAI.
- **Chat ibrida**: numeri calcolati **localmente** (deterministici) + OpenAI solo per
  il linguaggio e il dialogo. I numeri non devono mai essere inventati dall'AI.
- **Linguaggio non tecnico per il cliente**: nei modal "riferimenti" niente nomi di
  tabelle/colonne, solo italiano comprensibile.
- **Tema scuro come default** (era già così prima), con possibilità di passare a chiaro.

---

## 6. Ambienti e accessi

| Risorsa | Dove | Note |
|---|---|---|
| Codice | GitHub `devkaix/dashboard-bet`, branch `main` | commit imperativi e concisi |
| Database | Supabase — progetto "dashboard bet service" (ref `sktclykuktqaufaaoqui`) | Postgres 17 |
| Hosting | Vercel | build automatica da `main` |
| AI | OpenAI `gpt-4o-mini` | chiave su Vercel |

### Environment variables
- **`VITE_SUPABASE_ANON_KEY`** → frontend (Vercel), chiave pubblica Supabase.
- **`OPENAI_API_KEY`** → **solo su Vercel** (serverless), usata da `/api/chat` e
  `/api/commercial-advice`. **Mai** nel frontend.

> Chiedere all'utente le credenziali/accessi esatti (GitHub, Supabase, Vercel, OpenAI)
> se non le hai già.

---

## 7. Deploy

- Push sul branch `main` → Vercel fa il deploy automatico.
- Build = `npm run build` (`tsc -b && vite build`). Se TypeScript non compila, il
  deploy fallisce.
- Il backend "API" (`app/api/*`) viene riconosciuto automaticamente da Vercel come
  Serverless Functions.

---

## 8. Flusso di lavoro quotidiano

1. `cd app` → `npm run dev` (sviluppo).
2. Modificare codice (le logiche in `lib/`, la UI in `pages/`/`components/`).
3. `npm run typecheck` e `npm run build` prima di committare.
4. `git add <percorsi specifici>` (MAI `git add -A` per colpa dei file spazzatura).
5. Commit da `gestionale bet service/` (non da `app/`).
6. Push su `main` → verifica deploy Vercel.

---

## 9. Priorità consigliate per chi subentra

1. **Leggere** `docs/ARCHITECTURE.md` (tecnico) e questo documento.
2. **Avviare** l'app e fare un giro su tutte le pagine.
3. **Verificare la qualità dati** (sezione "Qualità Dati" di Confronto Mensile) per
   capire cosa manca.
4. **Affrontare il fallback PVR** (per coprire i PVR senza `daily_pvr_stats`).
5. **Decidere con l'utente** su `PvrMapping.tsx` / `DataProvenance.tsx`.

---

## 10. Contatti

- **Titolare/committente**: l'utente che ti ha passato il progetto (chiedere a lui per
  priorità e domande di business).
- **Direttore commerciale (DAZN)**: il destinatario finale della demo; tutte le scelte
  di UI/linguaggio devono essere "per il commerciale".

---

## 11. Riferimenti ai documenti

- `docs/ARCHITECTURE.md` — documentazione tecnica (stack, data layer, motori, chat, import).
- `docs/DATA_PROVENANCE.md` — provenienza di ogni dato (tabella, colonna, formula).
- `docs/DATA_LINEAGE.md` — flusso di trasformazione dei dati.
- `GUIDA_DASHBOARD.md` — guida utente.
