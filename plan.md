# DAZN Bet AI Decision Platform — Piano di Esecuzione

## Obiettivo
Costruire un MVP funzionante della piattaforma AI Decision Intelligence per DAZN Bet che:
- Usa i **dati reali** dagli export Excel Exalogic caricati via `/upload` (133 giocatori, ~690 record, 30 giorni)
- Persiste i dati su **Supabase** (PostgreSQL)
- Mostra una **Executive Dashboard** completa con KPI reali, trend, ranking
- Include **AI Briefing Panel** con criticita, opportunita, suggerimenti generati dai dati
- Ha **Player Grid** virtuale con ricerca/filtri
- Mostra **Health Score** per PVR e giocatori
- Include **AI Copilot Chat** per interrogazione linguaggio naturale

## Architettura MVP (implementata)
```
React 19 + Vite + TypeScript frontend
Supabase (PostgreSQL) backend
├── app/
│   ├── src/
│   │   ├── pages/         # Dashboard, Network, Players, Analytics, Copilot, Settings, Upload
│   │   ├── components/    # Componenti UI
│   │   └── lib/           # Supabase client, data layer, utilità
│   └── public/            # Asset statici
├── automation/            # Script Playwright per download export Exalogic
└── supabase/              # Progetto Supabase (tabelle, RLS)
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
- Generazione JSON strutturato per il data layer
- Calcolo aggregazioni (KPI, trend, ranking)
- Generazione mock PVR/Agenti/Area Manager realistico

### Stage 2: AI Engine & Analytics Layer
- Implementazione KPI engine (rake, bet, won, active players, delta)
- Health Score algorithm (formula ponderata dal prompt)
- Anomaly detection (regole business + statistiche)
- AI Briefing generator (criticità, opportunità, suggerimenti)
- Copilot NLU (intent classification + query builder)

### Stage 3: Frontend Dashboard
- Executive Dashboard (KPI cards, trend chart, briefing panel, alerts)
- Network View (gerarchia Regioni → Area Manager → PVR → Agenti → Giocatori)
- Player Grid (tabella virtuale con ricerca, filtri, export)
- Analytics Page (confronto periodi, what-if)
- Copilot Chat (interfaccia ChatGPT-style)
- Settings Page

### Stage 4: Deploy
- Build e deploy su hosting statico

## Skill da Usare
- `vibecoding-webapp-swarm` — per la costruzione dell'app Next.js
