# Automation (POC) — Export DAZN Bet portal

Questa cartella contiene un POC Playwright per scaricare automaticamente gli export dal portale `daznbet.it`.

## Requisiti

- Node.js + npm installati
- Credenziali **NON** inserite nel codice: usare variabili ambiente

## Setup

Da `gestionale bet service\\automation`:

```bash
npm install
```

Installa i browser di Playwright (una tantum):

```bash
npx playwright install chromium
```

## Esecuzione (Windows PowerShell)

Imposta le variabili ambiente nella sessione corrente:

```powershell
$env:DAZN_USERNAME="(il tuo username)"
$env:DAZN_PASSWORD="(la tua password)"
$env:DAZN_MONTH="2026-06"
```

Avvia il download della sezione **Gestione Punto** con livello **Tutti**:

```powershell
node .\\scripts\\download-gestione-punto.js
```

Output:
- file scaricato in `automation\\downloads\\`
- in caso di errore: screenshot `automation\\downloads\\error_*.png`

