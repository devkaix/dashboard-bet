# Preprocessing Decision Engine — Foundation

> Commit corrente — 20/07/2026
> Modulo: 
> Stato: **Integrato nel data layer** — Dashboard alert e briefing usano lo stesso motore

## Stato integrazione

- ✅ Preprocessing integrato in loadData() (data.ts)
- ✅ Dashboard alert derivano da convertSignalsToAlerts(signals)
- ✅ Briefing costruito da buildBriefingFromSignals(signals, queue, rankings)
- ✅ decision_queue calcolata ma non ancora visualizzata in UI
- ✅ Alert giocatori disattivati (solo scope network)
- ✅ Soglie tecniche provvisorie (non commerciali)
- ✅ Integrazione read-only (nessuna scrittura Supabase)
- ✅ Nessuna pulizia delle righe storiche sospette
- ⬜ Bottone decisionale (prossimo step)
- ⬜ Collegamento Settings (prossimo step)
- ⬜ Preprocessing PVR e giocatori (prossimo step)`app/src/lib/preprocessing.ts`

## Obiettivo di prodotto

Trasformare i dati grezzi Exalogic in una pipeline decisionale spiegabile, prioritaria e auditabile. Questo modulo è il primo strato della fondazione: preprocessing puro della rete giornaliera.

## Architettura del flusso

```
daily_network_stats (file 6)
        │
        ▼
validateNetworkObservations()
        │
        ├── valid (ordinati, deduplicati, domain-validated)
        └── errors (date, NaN, duplicati, domain violations)
        │
        ▼
preprocessNetwork()
        │
        ├── payout_pct (null when total_bet=0)
        ├── baseline (solo giorni precedenti)
        ├── delta_pct (direzionale, negativo = calo)
        ├── z_score
        └── confidence
        │
        ▼
generateNetworkSignals()
        │
        ├── NETWORK_RAKE_NEGATIVE (fatto diretto)
        ├── NETWORK_RAKE_DROP (direzionale: solo cali)
        └── NETWORK_PAYOUT_ANOMALY (soglia assoluta + statistica)
        │
        ▼
buildDecisionQueue()
        │
        └── coda prioritaria deduplicata
```

## Fonti ufficiali

| Dominio | Fonte | Tabella |
|---------|-------|---------|
| Rete | file 6 | `daily_network_stats` |
| PVR | file 9 | `daily_pvr_stats` (slice successivo) |
| Giocatore | file 7 | `daily_player_stats` (slice successivo) |
| Provider/Gioco | file 10 | `daily_player_game_stats` (slice successivo) |

## Feature prodotte (rete giornaliera)

| Feature | Formula | Dipende da baseline | Null quando |
|---------|---------|:-------------------:|-------------|
| `payout_pct` | `won / bet × 100` | No | `total_bet = 0` |
| `rake_baseline` | media mobile dei giorni precedenti | Sì | baseline insufficiente (=0) |
| `payout_baseline` | media mobile payout precedenti (escludendo bet=0) | Sì | baseline insufficiente o nessun payout valido |
| `active_players_baseline` | media mobile active_players precedenti | Sì | baseline insufficiente |
| `rake_delta_pct` | `(curr - baseline) / abs(baseline) × 100` | Sì | baseline insufficiente |
| `payout_delta_pct` | idem per payout | Sì | payout o baseline null |
| `active_players_delta_pct` | idem per active_players | Sì | baseline insufficiente |
| `rake_z_score` | `(curr - mean) / std` su finestra baseline | Sì | <2 valori nella baseline |
| `payout_z_score` | idem per payout (escludendo bet=0) | Sì | <2 payout validi nella baseline |
| `confidence` | `min(1, baselineDays / minBaselineDays)` | Sì | — |

## Quality gate

1. **Validazione ISO date**: `YYYY-MM-DD` valida, non ambigua
2. **NaN/Infinity rejection**: metriche non numeriche o infinite → errore esplicito
3. **Domain validation**: `total_bet >= 0`, `total_won >= 0`, `active_players >= 0` e intero. Rake può essere negativo.
4. **Deduplicazione date**: stesso giorno → tiene primo, segnala duplicato
5. **Ordinamento cronologico**: obbligatorio prima del preprocessing
6. **Baseline solo da giorni precedenti**: mai includere il giorno corrente
7. **Errori separati dai segnali**: dati non validi non diventano zero silenziosamente
8. **Payout nullo con bet=0**: rapporto matematicamente non definito → null, non zero

## Regole implementate

### NETWORK_RAKE_NEGATIVE
- **Condizione**: `total_rake < 0`
- **Severità**: `high` (fatto contabile diretto)
- **Baseline**: non richiesta
- **Confidence**: 1.0
- **Priorità**: 300
- **Esclusione mutua**: se attivo, non genera anche `NETWORK_RAKE_DROP`
- **Baseline evidence**: `evidence.baseline_days` riporta giorni reali anche se insufficienti

### NETWORK_RAKE_DROP (direzionale)
- **Condizione**: baseline sufficiente + rake in **diminuzione** rispetto alla baseline
- **Warning**: `rake_delta_pct <= -rakeDropWarningPct` o `rake_z_score <= -zScoreWarning`
- **Critical**: `rake_delta_pct <= -rakeDropCriticalPct` o `rake_z_score <= -zScoreCritical`
- **Direzionalità**: un aumento del rake (delta positivo, z-score positivo) non produce mai questo segnale
- **Confidence**: proporzionale ai giorni di baseline

### NETWORK_PAYOUT_ANOMALY
- **Soglia assoluta**: `payout_pct >= payoutWarningPct` → medium; `>= payoutCriticalPct` → high
- **Anomalia statistica**: `payout_z_score >= zScoreWarning` con baseline sufficiente
- **evidence.direct_fact**: `true` se soglia assoluta, `false` se solo via z-score
- **Bet=0**: payout null → nessun segnale generato

## Contratto DecisionSignal

Ogni segnale contiene sempre:
- `id`: deterministico = `rule_id:scope:entity_id:date` (nessun contatore, nessun timestamp)
- `rule_id`: regola che l'ha generato
- `scope`: network | pvr | player | game
- `entity_id`: identificatore dell'entità
- `date`: data ISO del fatto
- `category`: critical | warning | info
- `metric`: metrica monitorata
- `severity`: high | medium | low
- `current_value`: valore osservato
- `baseline_value`: valore baseline (null se insufficiente)
- `delta_pct`: variazione percentuale (null se insufficiente)
- `z_score`: z-score statistico (null se insufficiente)
- `confidence`: 0-1
- `priority_score`: punteggio per ordinamento coda
- `title`, `explanation`, `recommended_action`: testuali basati su valori reali
- `evidence.source`, `evidence.baseline_days`, `evidence.direct_fact`

## ID deterministici

Gli ID sono derivati dalla combinazione:
```
rule_id + scope + entity_id + date
```
Esempio: `NETWORK_RAKE_NEGATIVE:network:network:2026-06-17`

Nessun contatore globale, nessun `Date.now()`, nessun `Math.random()`. A parità di input, ogni esecuzione produce lo stesso identico ID.

## Differenza tra alert history e decision queue

- **Alert history** = `generateNetworkSignals()` → tutti i segnali generati, storico completo
- **Decision queue** = `buildDecisionQueue()` → deduplicato per `rule_id+scope+entity_id`, ordinato per priorità, con limit

### Regole della coda decisionale
1. Priorità più alta vince
2. A parità di priorità: data più recente
3. Ordinamento finale: `priority_score` decrescente
4. Applicazione del `limit`

La coda decisionale è progettata per alimentare il futuro bottone "Cosa devo fare adesso?".

## Configurazione (soglie tecniche provvisorie)

```typescript
const config = {
  baselineWindowDays: 14,
  minBaselineDays: 7,
  rakeDropWarningPct: 20,
  rakeDropCriticalPct: 35,
  activePlayersDropWarningPct: 20,
  activePlayersDropCriticalPct: 35,
  payoutWarningPct: 120,
  payoutCriticalPct: 200,
  zScoreWarning: 2,
  zScoreCritical: 3,
}
```

**⚠️ Queste sono soglie tecniche iniziali e non soglie commerciali definitivamente approvate.** Prima dell'attivazione operativa saranno collegate a Settings e validate sui dati storici.

## Esclusioni correnti

- **Health Score**: non implementato, formula non approvata
- **Agenti**: nessuna fonte dati reale
- **Fido PVR**: nessuna fonte dati reale
- **Churn prediction**: non implementato
- **Maggio simulato**: non creato
- **106 righe extra**: non pulite, solo documentate
- **Active players alerts**: non generati (dato con anomalia storica non certificata)
- **Integrazione applicativa**: non ancora collegato a data.ts, Dashboard, Copilot o Settings

## Prossimi step

1. **Integrazione con data.ts**: `fetchDailyKpis()` → `preprocessNetwork()` → `generateNetworkSignals()`
2. **Collegamento Settings**: leggere `PreprocessingConfig` dalla pagina Impostazioni
3. **Preprocessing PVR**: `daily_pvr_stats` → segnali per singolo PVR
4. **Preprocessing giocatori**: `daily_player_stats` → segnali per giocatore
5. **Drill-down causale**: da segnale rete → PVR contributori → giocatori
6. **Bottone decisionale**: `buildDecisionQueue()` → UI "Cosa devo fare adesso?"
