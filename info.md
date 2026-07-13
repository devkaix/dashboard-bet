# DAZN Bet AI Decision Platform — Context & Data Analysis

## Project Overview
Build an AI-powered Business Intelligence Decision Platform for DAZN Bet that sits on top of the Exalogic dashboard. The platform ingests exported Excel data, stores it in a proprietary database, and transforms it into insights, alerts, and actionable suggestions for the commercial network management.

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

## Hierarchy Data (Generated Mock for Demo)
- **Regions**: 6 (Lombardia x4, Toscana, Veneto)
- **Area Managers**: 6 (Matteo Dossena, Marco Rossi, Laura Bianchi, Giuseppe Verdi, Anna Neri, Paolo Fontana)
- **PVRs (Punti Vendita Raccolta)**: 20 (PVR Bonaparte, PVR Romanoni, PVR Da Engi, PVR Lissone, PVR Monza, etc.)
- **Agents**: 30 (Agente Rossi, Bianchi, Verdi, etc.)

## AI Briefing Content (Auto-generated from real data)
### Criticals
- 5 giorni con rake negativo nel mese (worst: -€4,603.42)
- Multiple PVRs with fido usage >85%
- 10+ high-value players at churn risk (<3 active days, rake >€50)

### Opportunities
- Top player "Rena72" generates €13,333.60 in rake
- Pareto distribution: clear VIP segment to target
- 14 highly loyal players (10+ active days)

### Suggestions
- Contact churn-risk players with personalized bonus offers
- Investigate negative rake pattern
- Increase fido for growing PVRs
- Schedule commercial visits for low-health PVRs

## Health Score Formula (for PVRs and Players)
- Rake growth (30%)
- Sport vs Casino mix (15%)
- New customers (15%)
- Retention rate (15%)
- Fido utilization (10%)
- Positive balance (10%)
- Movement/Activity (5%)

## Required Pages
1. **Executive Dashboard** (/) — KPI cards, trend chart, AI briefing panel (3 columns: Criticals, Opportunities, Suggestions), alert feed
2. **Network View** (/network) — Hierarchical view: Regions → Area Managers → PVRs → Agents → Players
3. **Player Grid** (/players) — Virtual table with 133+ players, search, filters, export
4. **Analytics** (/analytics) — Period comparison, trend analysis, what-if scenarios
5. **AI Copilot** (/copilot) — ChatGPT-style interface for natural language queries
6. **Settings** (/settings) — Alert thresholds, user preferences

## Design Direction
- Dark theme (professional, data-dense, dashboard-like)
- Color palette: Deep navy/slate background, emerald green for positive metrics, red for negative/alert, amber for warnings, blue for primary actions
- Cards with subtle borders and glass-morphism effects
- Data-dense layout with information hierarchy
- Real-time feel with sparklines and mini-charts
- Italian language for all UI text

---
*Last updated: 13 July 2026*
