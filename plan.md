# DAZN Bet AI Decision Platform — Piano di Esecuzione

## Obiettivo
Costruire un MVP funzionante della piattaforma AI Decision Intelligence per DAZN Bet che:
- Usa i **dati reali** dagli export Excel Exalogic caricati via `/upload` (133 giocatori, ~690 record, 30 giorni)
- Persiste i dati su **Supabase** (PostgreSQL)
- Mostra una **Executive Dashboard** completa con KPI reali, trend, ranking
- Include **AI Briefing Panel** con criticita, opportunita, suggerimenti generati dai dati
- Ha **Player Grid** virtuale con ricerca/filtri
- Include **Assistente Analitico** per interrogazione linguaggio naturale (motore analitico locale, non LLM generativo)

## Architettura MVP (implementata)
```
React 19 + Vite + TypeScript frontend
Supabase (PostgreSQL) backend
├── app/
│   ├── src/
│   │   ├── pages/         # Dashboard, Network, Players, Analytics, Copilot, Settings, Upload
│   │   ├── components/    # Componenti UI
│   │   └── lib/           # Supabase client, data layer, utilità, test
│   └── public/            # Asset statici
├── automation/            # Script Playwright per download export Exalogic
└── supabase/              # Migrazioni SQL e schema
```

## Dati Reali (da Excel)
- **Periodo**: Giugno 2026 (30 giorni)
- **Giocatori**: 133 username unici
- **Record**: 689 righe giornaliere
- **Colonne**: Data, Username, Buy In, Buy In Bonus, Stack, Bet, Won, Rake, Payout, Bet Bonus, Jackpot, Jackpot Won, Overlay, Refund
- **Formato**: Europeo (virgole decimali)
- **Distribuzione**: Pareto confermata (top 10% = 82% rake)

## Stage di Esecuzione

### Stage 1: Data Preparation
- Estrazione e pulizia dati dall'Excel reale
- Conversione formato europeo → numerico
- Caricamento in Supabase tramite `/upload`
- Calcolo aggregazioni (KPI, trend, ranking) dal database

### Stage 2: Enterprise Realignment (completato)
- Rimozione di tutti i dati sintetici da `data.ts`
- Aggiunta tabelle `pvr_reference_map` e `player_username_aliases`
- Aggiunta colonne reali su `players` (`pvr_id`, `pvr_ref_code`, `kyc_status`, `balance`, `withdrawable_balance`, `registration_date`, `username_normalized`)
- Deduplicazione upload tramite hash SHA-256
- Validazione `player_summary` contro `monthly_player_stats_v` (mai scritto in `daily_player_stats`)
- Supporto import `players_master`
- `won` letto sempre dalla colonna reale, mai calcolato come `bet - rake`
- Health score disabilitato in attesa di formula approvata

### Stage 3: AI Engine & Analytics Layer
- Implementazione KPI engine (rake, bet, won, active players, delta) su dati reali
- Anomaly detection (regole business + statistiche)
- AI Briefing generator (criticità, opportunità, suggerimenti)
- Assistente Analitico (intent classification + query builder locali)

### Stage 4: Frontend Dashboard
- Executive Dashboard (KPI cards, trend chart, briefing panel, alerts)
- Network View (gerarchia Regioni → Area Manager → PVR → Giocatori; Agenti quando disponibili)
- Player Grid (tabella virtuale con ricerca, filtri, export)
- Analytics Page (confronto periodi reali, trend, what-if)
- Assistente Analitico (interfaccia chat)
- Settings Page

### Stage 5: Quality & Deploy
- Vitest + test su helper puri
- Typecheck e build passanti
- Build e deploy su hosting statico

## Skill da Usare
- React 19 + Vite + TypeScript + Tailwind CSS
- Supabase PostgreSQL + RLS
