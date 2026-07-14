# DATA LINEAGE — DAZN Bet AI Decision Platform

> Grafo completo dei flussi dati: Excel → Parser → Supabase → Data Layer → Frontend
> Commit: `e5f6a14` — 14/07/2026

---

## FILE 1: players_export (1).xlsx — Anagrafica Giocatori

```
players_export (1).xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "players_master"
      │   match: user + PVR rif. + saldo/stato
      └── importPlayersMaster()
          ├── col(row, ["user","Username","username","User"]) → username
          ├── normalizeUsername() → username_normalized
          ├── col(row, ["PVR rif.","PVR","pvr_ref_code"]) → pvr_ref_code
          ├── loadPvrMap() ─── pvr_reference_map ─── pvr_ref_code → pvr_id
          ├── col(row, ["stato","Kyc Status","kyc_status"]) → kyc_status
          ├── num(col(row, ["saldo","Balance","balance"])) → balance
          ├── num(col(row, ["saldo prel","Withdrawable"]) → withdrawable_balance
          ├── pDt/pDate(col(row, ["creato","Registration Date"])) → registration_date
          ├── resolvePlayerIds(usernames) ─── players(username_normalized) ─── id lookup
          │   └── Se non trovato: INSERT new player
          └── batchUpsert("players", upserts, "id")
              └── players
                  ├── Players.tsx
                  │   ├── Tabella giocatori
                  │   ├── Filtro per nome/PVR/status
                  │   ├── MiniSparkline
                  │   └── PlayerSheet (dettaglio)
                  ├── Network.tsx
                  │   └── buildTree()
                  │       ├── pvr_id → assegnazione PVR
                  │       └── players senza pvr_id → "Giocatori non assegnati"
                  ├── PvrMapping.tsx
                  │   └── load() → players.pvr_ref_code → estrazione codici MW
                  ├── Analytics.tsx
                  │   └── Pareto: players.total_rake
                  └── Copilot.tsx
                      └── getAnalyticalResponse() → ranking giocatori
```

---

## FILE 5: export_grid_stat_all (6)...xlsx — Totale Rete × Giorno

```
export_grid_stat_all (6)...xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "daily_network"
      │   match: header[0]="data" + no "username"
      ├── pDate(col(row, ["Data","data","Date","date"])) → date
      ├── getStats(row) → { buy_in, buy_in_bonus, stack, bet, won, rake, payout, bet_bonus, jackpot, jackpot_won, overlay, refund }
      │   └── num() converte da formato europeo
      └── batchUpsert("daily_network_stats", rows, "date")
          └── daily_network_stats
              ├── inferLatestMonthRange()
              │   └── SELECT date ORDER BY date DESC LIMIT 1 → ultimo mese
              ├── fetchMetadata()
              │   ├── player count → players
              │   ├── pvr count → pvrs
              │   ├── stats count → daily_player_stats
              │   └── days count → daily_network_stats
              ├── fetchDailyKpis()
              │   ├── daily_network_stats.* (bet, won, rake, buy_in)
              │   ├── daily_player_stats (player_id, date) → active_players per giorno
              │   └── tickets (emission_date, Europe/Rome) → total_bets_count
              │   └── Dashboard
              │       ├── KPI Cards (5): Rake, Bet, Won, Payout, Active Players
              │       │   └── KpiCard.tsx (con sparkline AreaChart)
              │       ├── Grafico Andamento Giornaliero (BarChart)
              │       │   └── chartData: rake, bet, won, active_players × giorno
              │       ├── AI Briefing Panel
              │       │   ├── Criticità: giorni rake < 0
              │       │   ├── Opportunità: top player
              │       │   └── Suggerimenti: hardcoded
              │       └── Feed Allerte (AlertItem.tsx)
              │           └── fetchAlerts(): WHERE rake < 0
              ├── fetchMonthlyAggregates()
              │   ├── SUM(bet), SUM(rake), SUM(won) per periodo
              │   └── AVG(active_players) per periodo
              │   └── dataStore.monthly_aggregates
              │       ├── Dashboard → totalRake, totalBet, totalWon
              │       ├── Analytics → periodA, periodB
              │       └── Copilot → risposte analitiche
              ├── fetchAlerts()
              │   └── SELECT date, rake WHERE rake < 0
              │   └── Dashboard → Feed Allerte
              └── fetchBriefing()
                  ├── Worst negative rake day
                  ├── Top player by aggregated rake
                  └── Suggerimento hardcoded
                  └── Dashboard → AI Briefing Panel
```

---

## FILE 6: export_grid_stat_all (7)...xlsx — Giocatore × Giorno

```
export_grid_stat_all (7).xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "daily_player" (default)
      │   match: header[0]="data" + contiene "username"
      ├── pDate() → date
      ├── normalizeUsername() → username_normalized
      ├── getStats(row) → stats
      ├── resolvePlayerIds(usernames) → player_id
      └── batchUpsert("daily_player_stats", rows, "player_id,date")
          └── daily_player_stats
              ├── fetchPlayers()
              │   ├── JOIN players (username, pvr_id, pvr_ref_code, email, registration_date)
              │   ├── Aggregazione: SUM(buy_in), SUM(bet), SUM(won), SUM(rake)
              │   ├── COUNT(DISTINCT date) → active_days
              │   ├── avgPayout = (total_won / total_bet) * 100
              │   └── playerStatus(activeDays) → active/warning/inactive
              │   └── Players.tsx
              │       ├── Tabella giocatori (sort, filter, pagination)
              │       ├── Filtri: search, PVR, status, activity
              │       ├── Export CSV
              │       └── PlayerSheet (dettaglio + grafico)
              ├── fetchDailyStats()
              │   └── Players.tsx → MiniSparkline, PlayerSheet
              ├── fetchRankings()
              │   ├── top_players_by_rake (agg player_id, sort by rake DESC, top 20)
              │   ├── top_players_by_bet (agg player_id, sort by bet DESC, top 20)
              │   └── Dashboard → Top 10 Giocatori
              │   └── Copilot → ranking risposte
              ├── fetchBriefing()
              │   └── Top player identificato → opportunities
              ├── monthly_player_stats_v (VISTA)
              │   └── SUM(bet, won, rake) GROUP BY player_id, month
              │   └── Upload.tsx → validazione player_summary
              │       └── Confronto export mensile vs giornaliero
              └── Analytics.tsx
                  └── Pareto data: sorted players, cumulative rake %
```

---

## FILE 7: export_grid_stat_all (9)...xlsx — PVR × Giorno

```
export_grid_stat_all (9).xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "daily_pvr"
      │   match: header contiene "liv 1"
      ├── col(row, ["ID Liv 1","id_liv_1"]) → exalogic_id (eid)
      ├── col(row, ["Liv 1","liv_1"]) → pvr_name
      ├── pDate() → date
      ├── getStats(row) → stats
      ├── Risoluzione PVR:
      │   ├── supabase.from("pvrs").select("id,exalogic_id").in("exalogic_id", uniqueEids)
      │   │   └── pvrMap: exalogic_id → pvr.id (UUID)
      │   ├── Se missing: INSERT nuovi pvrs (exalogic_id, name)
      │   │   └── pvrs
      │   └── Auto-create pvr_reference_map (verified=false)
      │       └── pvr_reference_map
      └── batchUpsert("daily_pvr_stats", rows, "pvr_id,date")
          └── daily_pvr_stats
              ├── fetchRankings()
              │   ├── Aggregazione rake, bet per pvr_id
              │   ├── JOIN pvrs.name
              │   └── top_pvrs (sort by rake DESC, top 10)
              │   └── Copilot → ranking PVR
              ├── fetchPvrTotals()
              │   ├── SUM(rake), SUM(bet) per pvr_id
              │   └── pvrTotals[pvrId]
              │   └── Network.tsx
              │       ├── getPvrTotalRake() → visualizzazione albero
              │       ├── PvrStatusBadge (trend)
              │       └── NetworkSummary (totali)
              └── (NON usato da Analytics.tsx per distribuzione PVR!)
                  ⚠️ Analytics usa players.total_rake raggruppato per pvr_id
```

---

## FILE 8: Export_ticket_ ticket scommesse giugno.xlsx — Ticket

```
Export_ticket_ ticket scommesse giugno.xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "tickets"
      │   match: contiene "ticket" + "stato"
      ├── col(row, ["Ticket","ticket"]) → ticket_code
      ├── col(row, ["Codice Padre","pvr_code"]) → pvr_code
      ├── pDt(col(row, ["Data Emissione","emission_date"])) → emission_date
      │   └── Europe/Rome timezone → UTC
      ├── col(row, ["Stato","status"]) → status
      ├── pDate(col(row, ["Data Competenza"])) → competition_date
      ├── num(col(row, ["Importo","amount"])) → amount
      ├── num(col(row, ["Importo vincita","win_amount"])) → win_amount
      ├── parseInt(col(row, ["Eventi","events_count"])) → events_count
      ├── pDt(col(row, ["Data Pagamento","payment_date"])) → payment_date
      ├── normalizeUsername() → username_normalized
      ├── resolvePlayerIds() → player_id
      └── batchUpsert("tickets", rows, "ticket_code")
          └── tickets
              ├── fetchDailyKpis()
              │   └── COUNT per giorno (Europe/Rome) → total_bets_count
              │   └── Dashboard → DailyKPI.total_bets_count
              └── PvrMapping.tsx
                  └── load(): tickets.pvr_code → estrazione codici PVR per riconciliazione
```

---

## FILE 2: export_grid_stat_all (10)...xlsx — Provider × Gioco × Giorno

```
export_grid_stat_all (10)...xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "daily_player_game"
      │   match: contiene "gioco"
      ├── Header fix: hdr[1]="Provider", hdr[2]="GameName"
      ├── normalizeUsername() → username_normalized
      ├── col(row, ["Provider","provider"]) → provider
      ├── col(row, ["GameName","game_name","Gioco"]) → game_name
      ├── pDate() → date
      ├── getStats(row) → stats
      └── Due upsert:
          ├── batchUpsert("game_types", unique games, "provider,game_name")
          │   └── game_types
          └── batchUpsert("daily_player_game_stats", rows, "player_id,provider,game_name,date")
              └── daily_player_game_stats
                  └── (NON ANCORA UTILIZZATO DAL FRONTEND)
                      ⚠️ Nessuna pagina legge questa tabella
```

---

## FILE 4: export_grid_stat_all (5)...xlsx — Riepilogo Mensile (VALIDAZIONE)

```
export_grid_stat_all (5)...xlsx
  └── Upload.tsx: processFile()
      ├── XLSX.read() → fixSheetRange()
      ├── det(raw): "player_summary"
      │   match: header[0]="username" + no "data"
      ├── pDate(col(row, ["mese","month","periodo","period"])) → month
      ├── getStats(row) → stats
      ├── lookupPlayerIds(usernames) → player_id
      └── VALIDAZIONE (NO SCRITTURA):
          ├── supabase.from("monthly_player_stats_v")
          │   .select("*")
          │   .in("player_id", playerIds)
          │   .eq("month", targetMonth)
          ├── Confronto: db.rake vs summary.rake, db.bet vs summary.bet, db.won vs summary.won
          │   └── Tolleranza: €0.01
          ├── Se mismatch → validation_status = "mismatch"
          ├── Se OK → validation_status = "validated"
          └── insertUploadRecord(file, hash, "player_summary", rows, "completed", validationStatus, report)
              └── excel_uploads (solo metadati, MAI daily_player_stats)
```

---

## FILE 3: export_grid_stat_all (4).xlsx — DUPLICATO

```
export_grid_stat_all (4).xlsx
  ⚠️ DUPLICATO del file 7 (export_grid_stat_all (7).xlsx)
  ⚠️ Stesse colonne, stesso contenuto
  ⚠️ NON DEVE ESSERE IMPORTATO
  └── Se importato come "daily_player":
      ├── Il check hash SHA-256 in excel_uploads potrebbe bloccarlo (se hash coincide)
      └── Se l'hash differisce (metadati Excel diversi):
          └── batchUpsert("daily_player_stats") → DUPLICAZIONE DATI
              ⚠️ upsert con stessa chiave (player_id, date) sovrascrive con stessi valori
              ⚠️ Nessun danno ai dati ma genera un record excel_uploads duplicato
```

---

## GRAFO RIEPILOGATIVO COMPLETO

```
┌──────────────────────────────────────────────────────────────────────┐
│                        EXCEL FILES                                    │
├────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│  File 1    │   File 5     │   File 6     │   File 7     │  File 8    │
│ players    │ daily_network│ daily_player │ daily_pvr    │  tickets   │
│ _export    │ _stats       │ _stats       │ _stats       │            │
└─────┬──────┴──────┬───────┴──────┬───────┴──────┬───────┴─────┬──────┘
      │             │              │              │             │
      ▼             ▼              ▼              ▼             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Upload.tsx (Browser)                               │
│  XLSX.read() → fixSheetRange() → det() → getStats()/num()/pDate()   │
│  resolvePlayerIds() → player lookup/create                            │
│  loadPvrMap() → pvr_reference_map lookup                              │
│  batchUpsert() → Supabase insert/update                               │
└──────────────────────────────────────────────────────────────────────┘
      │             │              │              │             │
      ▼             ▼              ▼              ▼             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SUPABASE (PostgreSQL)                           │
├──────────┬───────────┬──────────┬──────────┬───────────┬─────────────┤
│ players  │daily_net..│daily_pla │daily_pvr │ tickets   │ pvr_ref_map │
│          │stats      │yer_stats │_stats    │           │             │
└────┬─────┴─────┬─────┴────┬─────┴────┬─────┴─────┬─────┴──────┬──────┘
     │           │          │          │           │            │
     ▼           ▼          ▼          ▼           ▼            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   data.ts (Data Layer)                                │
│  loadData() → fetchMetadata, fetchNetworkHierarchy, fetchPlayers,    │
│  fetchDailyKpis, fetchDailyStats, fetchMonthlyAggregates,            │
│  fetchRankings, fetchPvrTotals, fetchAlerts, fetchBriefing           │
│                                                                      │
│  dataStore (singleton cache)                                          │
└──────────────────────────────────────────────────────────────────────┘
     │           │          │          │           │            │
     ▼           ▼          ▼          ▼           ▼            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND PAGES                                │
├──────────┬───────────┬──────────┬──────────┬───────────┬─────────────┤
│Dashboard │ Network   │ Players  │ Analytics│ Copilot   │ PvrMapping  │
│          │           │          │          │           │ Upload      │
│KPI Cards │Tree View  │Grid+Sort │Period vs │NL Queries │ MW→PVR map  │
│Chart     │PVR Detail │Player    │Trend     │Rankings   │             │
│Briefing  │Summary    │Detail    │Anomalies │Briefing   │             │
│Alerts    │           │Export    │What-If   │Alerts     │             │
│Top 10    │           │          │Pareto    │           │             │
└──────────┴───────────┴──────────┴──────────┴───────────┴─────────────┘
```

---

## TABELLE NON ANCORA UTILIZZATE DAL FRONTEND

| Tabella | File origine | Stato |
|---------|-------------|-------|
| `daily_player_game_stats` | File 2 | Importata ma nessuna pagina la legge |
| `game_types` | File 2 | Importata ma nessuna pagina la legge |
| `player_username_aliases` | (Nessun file) | `loadPlayerAliases()` definita in Upload.tsx ma scrittura potenzialmente bloccata da RLS |

---

*Documento generato da audit enterprise — 14/07/2026*
