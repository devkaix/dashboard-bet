# DAZN Bet AI Decision Platform — Frontend

Frontend React + Vite + TypeScript della piattaforma di Business Intelligence per la rete commerciale DAZN Bet.

## Stack

- **React 19** + **Vite**
- **TypeScript**
- **Tailwind CSS** + shadcn/ui components
- **Supabase** (`@supabase/supabase-js`) per lettura/scrittura dati
- **`xlsx`** per il parsing browser-side dei file Excel
- **Vitest** + Testing Library per i test

## Variabili d'ambiente

Copia `.env` (non committato) con:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Script

```bash
npm install
npm run dev          # sviluppo locale
npm run build        # build di produzione
npm run typecheck    # controllo tipi TypeScript
npm run lint         # lint
npm run test         # test con Vitest
npm run test:ui      # Vitest UI
```

## Struttura

```
src/
├── components/         # Componenti UI condivisi
├── pages/              # Route dell'app
│   ├── Dashboard.tsx
│   ├── Network.tsx
│   ├── Players.tsx
│   ├── Analytics.tsx
│   ├── Copilot.tsx     # Assistente Analitico (motore locale)
│   ├── Settings.tsx
│   └── Upload.tsx      # Import Excel in Supabase
├── lib/
│   ├── supabase.ts         # Client Supabase
│   ├── data.ts             # Data layer (KPI, ranking, alert, briefing)
│   ├── database.types.ts   # Tipi TypeScript generati da Supabase
│   ├── uploadHelpers.ts    # Helper puri per parsing Excel
│   └── utils.ts
└── test/
    └── setup.ts            # Setup Vitest
```

## Caricamento dati

L'import avviene interamente nel browser dalla pagina `/upload`:

1. L'utente trascina uno o più file `.xlsx`/`.xls`/`.csv`.
2. Viene parsato il primo foglio con `xlsx`.
3. L'app ricalcola il range del foglio per gestire export Exalogic con `!ref` errato.
4. Viene calcolato l'hash SHA-256 del file per bloccare caricamenti duplicati.
5. Vengono riconosciuti i tipi di report, inclusi `players_master` e `player_summary`.
6. `player_summary` viene validato contro la vista `monthly_player_stats_v` e **non** scritto in `daily_player_stats`.
7. I dati vengono inseriti/aggiornati in batch in Supabase tramite `upsert`.

Vedi la [GUIDA_DASHBOARD.md](../GUIDA_DASHBOARD.md) per la documentazione completa.
