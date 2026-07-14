# DAZN Bet AI Decision Platform — Context & Data Analysis

## Project Overview
Build an AI-powered Business Intelligence Decision Platform for DAZN Bet that sits on top of the Exalogic dashboard. The platform ingests exported Excel data via a browser-side upload page, stores it in Supabase (PostgreSQL), and transforms it into insights, alerts, and actionable suggestions for the commercial network management.

Current stack: React 19 + Vite + TypeScript frontend, Supabase backend, browser-side Excel parsing with `xlsx`.

## Real Data Analysis (from uploaded Excel)
- **File**: export_grid_stat_all (4).xlsx — exported from Exalogic dashboard
- **Period**: June 2026 (30 days: 2026-06-01 to 2026-06-30)
- **Players**: 133 unique usernames
- **Records**: 689 daily records (688 after cleaning)
- **Columns**: Data, Username, Buy In, Buy In Bonus, Stack, Bet, Won, Rake, Payout, Bet Bonus, Jackpot, Jackpot Won, Overlay, Refund
- **Format**: European (commas as decimal separators)

### Key Metrics
- **Total Rake (June)**: €55,934.67
- **Total Bet**: €484,236.36
- **Total Won**: €425,604.37
- **Average Daily Rake**: €1,864.49
- **Active Players per Day**: avg 22.9 (min 11, max 34)
- **Pareto Distribution**: Top 10% of players (13) generate 82.3% of rake. Top 20% (26) generate 96.4%.
- **Negative Rake Days**: 5 days (June 17, 18, 20, 23, 27) — worst: -€4,603.42 on 17/06
- **Top Player by Rake**: "Rena72" with €13,333.60
- **Top Player by Bet**: "Rena72" with €133,583.50
- **Most Active Player**: "Claudia80" with 30 active days (every day)
- **Average Player Activity**: 5.2 days/month

## Hierarchy Data (Real Only)
- **Regions** and **Area Managers** are derived only from the real `region` and `area_manager` fields on the `pvrs` table.
- **PVRs (Punti Vendita Raccolta)** are loaded from the real `pvrs` table (Exalogic ID + name).
- **Agents** are not shown until a real agent data source is introduced. The network tree falls back to **PVR → Players** when agents are absent.
- PVR-to-player mapping uses the verified `pvr_reference_map` table; `pvr_ref_code` on `players` is populated from `players_master` imports.

## AI Briefing Content (Auto-generated from real data)
### Criticals
- 5 giorni con rake negativo nel mese (worst: -€4,603.42)
- Negative-rake PVRs and players surfaced from real daily stats

### Opportunities
- Top player "Rena72" generates €13,333.60 in rake
- Pareto distribution: clear VIP segment to target
- 14 highly loyal players (10+ active days)

### Suggestions
- Contact churn-risk players with personalized bonus offers
- Investigate negative rake pattern
- Monitor PVRs with no mapped reference code

## Health Score
No health score is currently generated. The field is kept as `null` on both PVRs and players until an approved, business-validated formula is implemented. The UI handles this gracefully (e.g. "Non disponibile").

## Required Pages
1. **Executive Dashboard** (/) — KPI cards, trend chart, AI briefing panel (3 columns: Criticals, Opportunities, Suggestions), alert feed
2. **Network View** (/network) — Hierarchical view: Regions → Area Managers → PVRs → Players (Agents when real data available)
3. **Player Grid** (/players) — Virtual table with 133+ players, search, filters, export
4. **Analytics** (/analytics) — Period comparison (real months only), trend analysis, what-if scenarios
5. **Assistente Analitico** (/copilot) — Local analytical engine for natural language queries
6. **Settings** (/settings) — Alert thresholds, user preferences

## Enterprise Realignment (completed)
- Removed all synthetic data generation from `data.ts`.
- Added `pvr_reference_map` and `player_username_aliases` mapping tables.
- Added real-data columns to `players`: `pvr_id`, `pvr_ref_code`, `kyc_status`, `balance`, `withdrawable_balance`, `registration_date`, `username_normalized`.
- `excel_uploads` now tracks `file_hash`, period, validation status/report, and prevents duplicate uploads by content hash.
- `player_summary` files are validated against `monthly_player_stats_v` and never written to `daily_player_stats`.
- `players_master` imports update player metadata and resolve PVR mapping through `pvr_reference_map`.
- `won` is always read from the real `won` column, never computed as `bet - rake`.
- Added Vitest test suite (`data.test.ts`, `uploadHelpers.test.ts`).
- Real `players_export` headers supported: `index`, `user`, `PVR rif.`, `stato`, `saldo`, `saldo prel`, `creato`.
- Ticket datetime parsing supports both ISO (`2026-06-19 02:15:39`) and Italian formats with double spaces.
- Daily ticket count uses date-only keys aligned with `daily_network_stats`.
- PVR `active_players` counts distinct players.
- Network view falls back to flat `PVR → Players` when regions/area managers are missing.
- PVR totals are sourced from `daily_pvr_stats` when available.
- Health score hidden when `null` instead of showing 0/stable.
- RLS tightened: mapping tables read-only for anon, `excel_uploads` insert/select only.

## Design Direction
- Dark theme (professional, data-dense, dashboard-like)
- Color palette: Deep navy/slate background, emerald green for positive metrics, red for negative/alert, amber for warnings, blue for primary actions
- Cards with subtle borders and glass-morphism effects
- Data-dense layout with information hierarchy
- Real-time feel with sparklines and mini-charts
- Italian language for all UI text

---
*Last updated: 13/07/2026*
