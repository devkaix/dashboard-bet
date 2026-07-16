# DAILY_PLAYER_DUPLICATE_AUDIT — 106 righe extra

> Audit: commit `1675b96` — 14/07/2026
> Tabella: `daily_player_stats` — Progetto: `sktclykuktqaufaaoqui`

## RIEPILOGO

| Metrica | Valore |
|---------|--------|
| Righe totali | 794 |
| Chiavi distinte (player_id, date) | 794 |
| Duplicati reali (stessa chiave) | **0** |
| Righe attese da file 7 | 688 |
| Righe extra | **106** |
| Giocatori unici | 134 |

## CAUSA RADICE

Le 106 righe extra provengono dal file `export_grid_stat_all (5)...xlsx` (player_summary, 133 righe) che è stato **mis-detected** come `daily_player` durante l'upload.

### Come è successo

Il file player_summary ha 133 righe (un giocatore per riga, totali mensili). Il detector `det()` in `uploadHelpers.ts` controlla:

```typescript
if (h[0] === "username" && !h.includes("data")) return "player_summary";
// ...
return "daily_player"; // default catch-all
```

Se il file player_summary include una colonna chiamata "Data" (anche vuota), il detector lo classifica come `daily_player` invece di `player_summary`. Le 133 righe vengono importate con una data derivata (probabilmente l'ultimo giorno del mese o una data di default).

### Evidenza

La distribuzione giornaliera mostra un'anomalia chiara:

| Data | Giocatori/giorno |
|------|-----------------|
| 01-29 Giugno | 11-34 (media ~22) |
| **30 Giugno** | **133** ⚠️ |

Il 30 giugno ha 133 giocatori mentre gli altri giorni ne hanno in media 22. Questo conferma che le righe del player_summary sono state importate con data 30 giugno.

## CLASSIFICAZIONE

| Tipo | Conteggio | Descrizione |
|------|-----------|-------------|
| DUPLICATO_IDENTICO | 0 | Nessun duplicato di chiave |
| DATA_NON_NORMALIZZATA | 106 | Righe player_summary aggregate su singola data |
| ORIGINE_NON_TRACCIABILE | 0 | Tutte le righe provengono da upload tracciati |

## EXCEL UPLOADS CORRELATI

| File | Tipo rilevato | Righe | Data upload |
|------|--------------|-------|-------------|
| `export_grid_stat_all (4).xlsx` | daily_player | 688 | 2026-07-13 |
| `export_grid_stat_all (5)...xlsx` | Mis-detectato come daily_player | ~106 | Non tracciato separatamente |

## AZIONE RACCOMANDATA

**NON cancellare arbitrariamente.** Le 106 righe del 30 giugno:

1. Non sono duplicati di chiave (player_id+date univoci)
2. Contengono valori economici aggregati mensili, non giornalieri
3. Alterano i totali se sommate con le righe giornaliere

**Procedura consigliata**:
1. Identificare le righe del 30 giugno con valori anomali (bet/rake mensili invece che giornalieri)
2. Verificare che provengano dal player_summary tramite confronto con `monthly_player_stats_v`
3. Rimuovere solo le righe confermate come player_summary mis-importate
4. Re-importare il player_summary con il tipo corretto

## STATO

⚠️ **APERTO** — Richiede intervento manuale per identificare e rimuovere le righe mis-importate.
