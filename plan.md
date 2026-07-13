# DAZN Bet AI Decision Platform — Piano di Esecuzione

## Obiettivo
Costruire un MVP funzionante della piattaforma AI Decision Intelligence per DAZN Bet che:
- Usa i **dati reali** dal file Excel Exalogic caricato (133 giocatori, 689 record, 30 giorni)
- Mostra una **Executive Dashboard** completa con KPI reali, trend, ranking
- Include **AI Briefing Panel** con criticita, opportunita, suggerimenti generati dai dati
- Ha **Player Grid** virtuale con ricerca/filtri
- Mostra **Health Score** per PVR e giocatori
- Include **AI Copilot Chat** per interrogazione linguaggio naturale
- Funziona **senza database** — tutto in-memory dal file reale

## Architettura MVP
```
Next.js 14+ (App Router) Fullstack
├── app/                    # Frontend + API Routes
│   ├── api/               # Backend API (Next.js API Routes)
│   │   ├── kpi/           # KPI aggregati
│   │   ├── players/       # Player grid, dettagli
│   │   ├── trends/        # Serie temporali
│   │   ├── rankings/      # Classifiche
│   │   ├── alerts/        # Alert e anomalie
│   │   ├── briefing/      # AI Briefing mattutino
│   │   └── copilot/       # AI Copilot chat
│   ├── page.tsx           # Executive Dashboard (homepage)
│   ├── network/           # Vista gerarchica rete
│   ├── players/           # Player Grid
│   ├── analytics/         # Strumenti analisi
│   ├── copilot/           # Chat AI
│   └── settings/          # Configurazione
├── lib/
│   ├── data.ts            # Data layer — carica e processa Excel reale
│   ├── analytics.ts       # KPI engine, health score, anomaly detection
│   ├── ai-engine.ts       # AI decision engine (rule-based + heuristic)
│   └── copilot.ts         # NLU e query builder per Copilot
├── components/
│   ├── dashboard/         # KpiCard, TrendChart, AIBriefingPanel
│   ├── network/           # Vista gerarchica
│   ├── players/           # PlayerGrid virtuale
│   ├── copilot/           # ChatInterface
│   └── ui/                # Componenti riutilizzabili
└── public/
    └── data/              # Dati JSON derivati dall'Excel
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
