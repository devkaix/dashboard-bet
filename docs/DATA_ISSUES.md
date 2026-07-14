# DATA ISSUES — DAZN Bet AI Decision Platform

> Audit enterprise — Commit `e5f6a14` + fix — 14/07/2026
> Classificazione: P0 = Bloccante, P1 = Importante, P2 = Miglioramento

---

## P0 — BLOCCANTI

### ✅ P0-1: Delta KPI hardcodati nella Dashboard — CORRETTO
- **File**: `app/src/pages/Dashboard.tsx`, `app/src/lib/data.ts`
- **Fix**: Aggiunta `fetchPreviousMonthAggregates()` in `data.ts` che interroga `daily_network_stats` per il mese precedente. Dashboard ora calcola delta reali (`((curr-prev)/abs(prev))*100`) e mostra "N/D" se nessun dato precedente. `bottomNote` ora mostra dinamicamente "vs {mese} {anno}" o "nessun periodo precedente".
- **Commit**: Locale, non committato.

### P0-2: File 4 è un duplicato del File 7
- **File**: `export_grid_stat_all (4).xlsx` vs `export_grid_stat_all (7).xlsx`
- **Problema**: Il file 4 ha stesso contenuto del file 7. Se importato come `daily_player`, l'upsert con chiave `(player_id, date)` sovrascrive con gli stessi valori, ma genera un record `excel_uploads` duplicato e consuma risorse.
- **Azione**: Verificare hash SHA-256; se identico, il controllo duplicati in `Upload.tsx` lo blocca. Se l'hash differisce (metadati Excel), il file viene importato due volte. Aggiungere un warning esplicito o confrontare il contenuto normalizzato.

---

## P1 — IMPORTANTI

### P1-1: Analytics calcola distribuzione PVR dalla fonte sbagliata
- **File**: `app/src/pages/Analytics.tsx` (linee 534-548 `pvrDist`)
- **Problema**: La distribuzione PVR è calcolata come `players.total_rake` raggruppato per `players.pvr_id` invece che da `daily_pvr_stats`. Questo esclude i giocatori senza PVR (che vengono aggregati sotto `PVR ""`) e può differire dai totali ufficiali PVR.
- **Fonte corretta**: `daily_pvr_stats` (file 7)
- **Azione**: Sostituire `pvrDist` con una query a `daily_pvr_stats`, coerentemente con `fetchPvrTotals()` e `fetchRankings()`.

### P1-2: Suggerimento Briefing hardcodato
- **File**: `app/src/lib/data.ts` (linee 899-903)
- **Problema**: Il suggerimento "Monitora i giorni con rake negativo" è hardcodato in `fetchBriefing()`.
- **Azione**: Rendere il suggerimento generato dinamicamente dai dati, oppure etichettarlo chiaramente come "Suggerimento predefinito".

### P1-3: Periodo hardcodato nella TopBar
- **File**: `app/src/components/TopBar.tsx` (linea 59)
- **Problema**: `"Giugno 2026"` è hardcodato nell'HTML. Non riflette il periodo reale caricato.
- **Azione**: Leggere il periodo da `dataStore.metadata.period_start/period_end` e mostrarlo dinamicamente.

### P1-4: RLS su `player_username_aliases` blocca la scrittura
- **File**: `supabase/migrations/20260713150100_tighten_rls.sql`
- **Problema**: Dopo `tighten_rls`, la tabella ha solo policy `SELECT`. `Upload.tsx` chiama `loadPlayerAliases()` (sola lettura), quindi attualmente non è un problema bloccante. Ma se in futuro si tentasse di scrivere, fallirebbe.
- **Azione**: Verificare se la scrittura è necessaria. Se sì, aggiungere una policy `INSERT`.

### P1-5: Health Score assente (UNAVAILABLE)
- **Impatto**: Multipli componenti
- **Problema**: `health_score` è sempre `null` su `players` e `pvrs`. La UI gestisce il caso mostrando "Non disponibile", ma:
  - `HealthScoreRing` mostra 0 animato (fuorviante)
  - `PvrStatusBadge` in Network deriva il trend da `health_score` (sempre `null` → "stable")
- **Azione**: Definire e approvare la formula Health Score, oppure nascondere completamente i componenti health finché non disponibile.

### P1-6: Network usa `saldo`, `fido`, `fido_used` = null
- **File**: `app/src/lib/data.ts` (linee 409-411 `fetchNetworkHierarchy`)
- **Problema**: `fido: null`, `fido_used: null`, `saldo: null` hardcodati nella costruzione dell'oggetto PVR.
- **Azione**: Se i dati non sono disponibili nelle fonti attuali, rimuovere `FidoBar` e i riferimenti al saldo dalla UI di Network.

### P1-7: Agenti non disponibili
- **File**: `app/src/lib/data.ts` (linea 419), `app/src/components/Layout.tsx` (linea 8)
- **Problema**: `agents: []` sempre vuoto. Il subtitle di Network dice "agenti" ma non ci sono dati.
- **Azione**: Aggiornare il subtitle a "PVR → Giocatori" finché non esiste una fonte reale agenti.

---

## P2 — MIGLIORAMENTI

### P2-1: Search bar non funzionale
- **File**: `app/src/components/TopBar.tsx`
- **Problema**: L'input di ricerca non è collegato a nessuna funzionalità. Puramente decorativo.
- **Azione**: Collegare a una ricerca globale o rimuovere finché non implementata.

### P2-2: Bottone "Esporta Report" non funzionale
- **File**: `app/src/pages/Dashboard.tsx`
- **Problema**: Il bottone non esegue alcuna azione.
- **Azione**: Implementare l'export o rimuovere il bottone.

### P2-3: Icona notifiche decorativa
- **File**: `app/src/components/TopBar.tsx` (linea 66)
- **Problema**: Campanello con pallino rosso fisso, nessuna funzionalità.
- **Azione**: Collegare a `fetchAlerts()` o rimuovere il badge.

### P2-4: `daily_player_game_stats` non utilizzata dal frontend
- **File**: Tabella Supabase
- **Problema**: I dati provider/gioco (file 2) vengono importati ma nessuna pagina li visualizza.
- **Azione**: Aggiungere una sezione in Analytics o una pagina dedicata per analisi provider/gioco.

### P2-5: Test solo su helper puri
- **File**: `app/src/lib/data.test.ts`, `uploadHelpers.test.ts`
- **Problema**: 20 test case totali. Il layer `data.ts` (~1040 righe, 10+ funzioni async) non ha test.
- **Azione**: Aggiungere test per le funzioni di aggregazione in `data.ts` (con mock Supabase).

### P2-6: File `.bak` residui
- **File**: `app/src/App.tsx.bak`, `app/src/main.tsx.bak`
- **Problema**: File di backup non necessari nel repository.
- **Azione**: Rimuovere.

### P2-7: `getPlayerStatus()` sempre restituisce "Attivo"
- **File**: `app/src/lib/data.ts` (linee 1008-1012)
- **Problema**: La funzione ignora l'input e restituisce sempre `{ label: "Attivo", color: "positive" }`.
- **Azione**: Questa funzione è etichettata come "compatibility" — verificare se è ancora usata e rimuoverla se non necessario.

---

## RIEPILOGO QUANTITATIVO

| Priorità | Conteggio | Descrizione |
|----------|-----------|-------------|
| **P0** | 1 (1 corretto) | ~~Delta hardcodati~~, file duplicato |
| **P1** | 7 | Fonte errata, hardcoding, RLS, dati mancanti |
| **P2** | 7 | UI non funzionale, test, cleanup |

---

## PROBLEMI CORRETTI IN QUESTO AUDIT

| ID | Descrizione | File modificati |
|----|-------------|----------------|
| P0-1 | Delta KPI hardcodati → calcolo reale con "N/D" fallback | `Dashboard.tsx`, `data.ts` (nuova funzione `fetchPreviousMonthAggregates`) |
| — | Pagina diagnostica `/data-provenance` creata | `DataProvenance.tsx` (nuovo), `App.tsx` (+route), `Sidebar.tsx` (+nav), `Layout.tsx` (+meta) |
| — | Matrice provenienza esatta 19 colonne | `DATA_PROVENANCE.md` riscritto con 80+ KPI tracciati |

---

## PROBLEMI ANCORA APERTI

- P0-2: File 4 duplicato del file 7
- P1-1: Analytics distribuzione PVR da fonte errata
- P1-2: Suggerimento briefing hardcodato
- P1-3: Periodo hardcodato nella TopBar
- P1-4: RLS su player_username_aliases potenzialmente bloccante
- P1-5: Health Score assente
- P1-6: Fido/Saldo PVR null
- P1-7: Agenti non disponibili
- P2-1..7: Search bar, export, notifiche, daily_player_game_stats, test, .bak, getPlayerStatus

---

*Documento generato da audit enterprise — 14/07/2026*
