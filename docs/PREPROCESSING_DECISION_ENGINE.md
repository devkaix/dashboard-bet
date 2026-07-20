# Preprocessing Decision Engine — Foundation

> Commit: `87d24c4` — 16/07/2026
> Modulo: `app/src/lib/preprocessing.ts`

## Obiettivo di prodotto

Trasformare i dati grezzi Exalogic in una pipeline decisionale spiegabile, prioritaria e auditabile. Questo modulo è il primo strato della fondazione: preprocessing puro della rete giornaliera.

## Architettura del flusso

```
daily_network_stats (file 6)
        │
        ▼
validateNetworkObservations()
        │
        ├── valid (ordinati, deduplicati)
        └── errors (date invalide, NaN, duplicati)
        │
        ▼
preprocessNetwork()
        │
        ├── payout_pct
        ├── baseline (solo giorni precedenti)
        ├── delta_pct
        ├── z_score
        └── confidence
        │
        ▼
generateNetworkSignals()
        │
        ├── NETWORK_RAKE_NEGATIVE
        ├── NETWORK_RAKE_DROP
        └── NETWORK_PAYOUT_ANOMALY
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

| Feature | Formula | Dipende da baseline |
|---------|---------|:-------------------:|
| `payout_pct` | `won / bet × 100` | No |
| `rake_baseline` | media mobile dei giorni precedenti | Sì |
| `payout_baseline` | media mobile payout precedenti | Sì |
| `active_players_baseline` | media mobile active_players precedenti | Sì |
| `rake_delta_pct` | `(curr - baseline) / abs(baseline) × 100` | Sì |
| `payout_delta_pct` | idem per payout | Sì |
| `active_players_delta_pct` | idem per active_players | Sì |
| `rake_z_score` | `(curr - mean) / std` su finestra baseline | Sì |
| `payout_z_score` | idem per payout | Sì |
| `confidence` | `min(1, baselineDays / minBaselineDays)` | Sì |

## Quality gate

1. **Validazione ISO date**: `YYYY-MM-DD` valida, non ambigua
2. **NaN/Infinity rejection**: metriche non numeriche o infinite → errore esplicito
3. **Deduplicazione date**: stesso giorno → tiene primo, segnala duplicato
4. **Ordinamento cronologico**: obbligatorio prima del preprocessing
5. **Baseline solo da giorni precedenti**: mai includere il giorno corrente
6. **Errori separati dai segnali**: dati non validi non diventano zero silenziosamente
7. **Rake negativo**: segnalabile anche senza baseline (fatto diretto)

## Regole implementate

### NETWORK_RAKE_NEGATIVE
- **Condizione**: `total_rake < 0`
- **Severità**: `high`
- **Baseline**: non richiesta (fatto contabile diretto)
- **Confidence**: 1.0
- **Priorità**: 300
- **Esclusione mutua**: se attivo, non genera anche `NETWORK_RAKE_DROP`

### NETWORK_RAKE_DROP
- **Condizione**: baseline sufficiente + delta oltre soglia
- **Warning**: delta ≥ `rakeDropWarningPct` (15%) o z-score ≥ `zScoreWarning` (1.5)
- **Critical**: delta ≥ `rakeDropCriticalPct` (30%) o z-score ≥ `zScoreCritical` (2.0)
- **Confidence**: proporzionale ai giorni di baseline
- **Priorità**: 200-300 in base a severity × confidence

### NETWORK_PAYOUT_ANOMALY
- **Condizione**: payout ≥ soglia warning (95%)
- **Severità**: medium (≥95%) o high (≥98%)
- **Baseline**: usata per delta/z-score quando disponibile
- **Confidence**: proporzionale ai giorni di baseline
- **Azione raccomandata**: prudente, non automatica

## Contratto DecisionSignal

Ogni segnale contiene sempre:
- `id`: identificatore univoco stabile
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

## Differenza tra alert history e decision queue

- **Alert history** = `generateNetworkSignals()` → tutti i segnali generati, storico completo
- **Decision queue** = `buildDecisionQueue()` → deduplicato per `rule_id+scope+entity_id`, ordinato per priorità, con limit

La coda decisionale è progettata per alimentare il futuro bottone "Cosa devo fare adesso?".

## Configurazione

```typescript
const config = {
  baselineWindowDays: 14,      // finestra mobile
  minBaselineDays: 5,          // minimo per baseline sufficiente
  rakeDropWarningPct: 15,      // soglia warning calo rake
  rakeDropCriticalPct: 30,     // soglia critica calo rake
  activePlayersDropWarningPct: 15,
  activePlayersDropCriticalPct: 30,
  payoutWarningPct: 95,        // payout sopra 95% = warning
  payoutCriticalPct: 98,        // payout sopra 98% = critico
  zScoreWarning: 1.5,
  zScoreCritical: 2.0,
}
```

## Esclusioni correnti

- **Health Score**: non implementato, formula non approvata
- **Agenti**: nessuna fonte dati reale
- **Fido PVR**: nessuna fonte dati reale
- **Churn prediction**: non implementato
- **Maggio simulato**: non creato
- **106 righe extra**: non pulite, solo documentate

## Prossimi step

1. **Integrazione con data.ts**: `fetchDailyKpis()` → `preprocessNetwork()` → `generateNetworkSignals()`
2. **Collegamento Settings**: leggere `PreprocessingConfig` dalla pagina Impostazioni
3. **Preprocessing PVR**: `daily_pvr_stats` → segnali per singolo PVR
4. **Preprocessing giocatori**: `daily_player_stats` → segnali per giocatore
5. **Drill-down causale**: da segnale rete → PVR contributori → giocatori
6. **Bottone decisionale**: `buildDecisionQueue()` → UI "Cosa devo fare adesso?"
