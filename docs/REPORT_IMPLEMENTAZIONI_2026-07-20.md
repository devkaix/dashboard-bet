# DAZN Bet AI Decision Platform — Report delle implementazioni

**Data:** 20 luglio 2026
**Versione piattaforma:** commit `1dc3a39`
**Destinatario:** Management DAZN Bet

---

## 1. Obiettivo del progetto

La piattaforma DAZN Bet AI Decision Platform trasforma i dati reali provenienti dal sistema Exalogic in:

- **indicatori affidabili** — ogni numero ha una provenienza certa e tracciabile;
- **alert spiegabili** — ogni segnalazione dichiara perché è stata generata e su quali dati si basa;
- **azioni prioritarie** — gli alert vengono ordinati per importanza, eliminando i duplicati;
- **futura risposta alla domanda "Cosa devo fare adesso?"** — la coda decisionale è già calcolata e pronta per essere visualizzata.

---

## 2. Situazione iniziale

Prima di questo intervento la piattaforma disponeva già di:

- dati reali di rete commerciale (giugno 2026);
- dati dei PVR (punti vendita raccolta);
- dati dei giocatori;
- ticket scommesse;
- dashboard, analytics, classifiche e diagnostica funzionanti.

Tuttavia gli alert e il briefing erano generati da logiche separate e non coordinate. Alcuni valori mostrati erano fissi o calcolati con formule non documentate. Inoltre:

- **106 righe storiche sospette** sono presenti nel database (giocatori aggregati il 30 giugno), non ancora pulite perché la loro origine non è stata certificata puntualmente;
- **gli alert sui giocatori** sono mantenuti disattivati finché i dati non saranno verificati.

L'obiettivo di questo intervento era costruire un **unico motore di preprocessing** che alimentasse in modo coerente alert, briefing e futura coda decisionale.

---

## 3. Implementazioni realizzate il 20 luglio 2026

### 3.1 Quality gate (controllo qualità dei dati)

Prima di elaborare i dati, il sistema ora:

- rifiuta date non valide;
- rifiuta valori NaN (non numerici) o infiniti;
- rifiuta valori economici negativi dove non ammessi (es. Bet negativo);
- rifiuta giocatori attivi non interi o negativi;
- rimuove i duplicati di data;
- ordina i dati cronologicamente;
- separa gli errori dai dati validi (nessun dato viene corretto in silenzio).

### 3.2 Baseline mobile

Per ogni giorno viene calcolata una baseline basata **esclusivamente sui giorni precedenti** (14 giorni di finestra, minimo 7 giorni per essere considerata affidabile). Il giorno corrente non viene mai incluso nella propria baseline.

### 3.3 Feature calcolate

Per ogni giorno il sistema produce:

| Feature | Significato |
|---------|-------------|
| Payout % | Rapporto Won/Bet × 100 (nullo se Bet = 0) |
| Delta % | Variazione rispetto alla baseline |
| Z-score | Quanto il valore si discosta dalla normalità statistica |
| Confidence | Affidabilità del calcolo (0-100%) |

### 3.4 Regole di alert

Il motore implementa tre regole principali:

**1. Rake negativo (fatto diretto)**
- Scatta quando il Rake giornaliero è inferiore a zero.
- Non richiede baseline: è un fatto contabile certo.
- Severità: alta.
- Azione raccomandata: aprire il drill-down per identificare PVR e giocatori coinvolti.

**2. Calo del Rake (segnale statistico)**
- Scatta solo quando il Rake **diminuisce** rispetto alla baseline.
- Richiede baseline sufficiente (minimo 7 giorni precedenti).
- Due livelli: warning (calo ≥ 20%) e critico (calo ≥ 35%).
- **Un aumento del Rake non genera mai questo alert.**

**3. Payout anomalo**
- Scatta quando il payout supera soglie definite o si discosta statisticamente dalla baseline.
- Due livelli: warning e critico.
- Il payout viene calcolato solo quando il Bet è maggiore di zero.

### 3.5 Caratteristiche degli alert

Ogni alert contiene sempre:

- **ID deterministico** — lo stesso input produce sempre lo stesso identificativo;
- **Severità** (alta/media/bassa);
- **Titolo e spiegazione** — basati sui valori reali, non su testi generici;
- **Azione raccomandata** — cosa fare per approfondire;
- **Evidenza** — fonte del dato, giorni di baseline utilizzati, se è un fatto diretto o statistico;
- **Priorità** — punteggio per ordinare gli alert più importanti.

### 3.6 Coda decisionale

Il sistema produce due output:

- **Storico completo** di tutti i segnali generati;
- **Coda decisionale** — deduplicata (un solo segnale per tipo), ordinata per priorità, limitata ai 10 più importanti.

La coda è già calcolata ma non ancora visualizzata nell'interfaccia.

### 3.7 Integrazione con la piattaforma

Tutta la pipeline di preprocessing è stata collegata al data layer reale:

- La **Dashboard** ora mostra alert generati esclusivamente dal motore di preprocessing.
- Il **Briefing** (criticità, opportunità, suggerimenti) è costruito dagli stessi segnali.

Non esistono più due motori separati che producono alert diversi.

---

## 4. Flusso dei dati

```
File Excel Exalogic
      │
      ▼
Database Supabase
      │
      ▼
Dati giornalieri della rete (daily_network_stats)
      │
      ▼
Controllo qualità (date, valori, duplicati)
      │
      ▼
Preprocessing (baseline, delta, z-score, payout)
      │
      ▼
Segnali decisionali (rake negativo, calo rake, payout anomalo)
      │
      ▼
Coda decisionale (ordinata per priorità, deduplicata)
      │
      ├── Alert Dashboard
      ├── Briefing automatico
      └── Futuro bottone "Cosa devo fare adesso?"
```

---

## 5. Benefici aziendali

| Beneficio | Descrizione |
|-----------|-------------|
| **Riduzione alert errati** | Ogni alert ha una provenienza certa e spiegabile |
| **Tracciabilità** | Per ogni alert si può risalire al dato originale |
| **Dati reali** | Nessun dato inventato o simulato |
| **Fatti vs statistica** | Il sistema distingue fatti contabili diretti da segnali statistici |
| **Priorità** | Gli alert sono ordinati: i più importanti compaiono per primi |
| **Base pronta** | La coda decisionale è già calcolata per il futuro bottone operativo |

---

## 6. Controlli e test

| Verifica | Risultato |
|----------|:---------:|
| Typecheck (TypeScript) | ✅ Superato |
| Test automatici | ✅ 80/80 |
| Build di produzione | ✅ Completata |
| Deploy (Vercel) | ✅ Pronto |
| Commit GitHub | `1dc3a39` |

### Test eseguiti

| Categoria | Numero test | Cosa verificano |
|-----------|:----------:|-----------------|
| Preprocessing | 46 | Validazione, feature, regole, code |
| Upload helpers | 24 | Parsing Excel, detection tipi file |
| Data layer | 10 | Integrazione pipeline, DailyKPI mapping |

---

## 7. Cosa non è stato ancora implementato

| Funzionalità | Stato |
|-------------|-------|
| Bottone "Cosa devo fare adesso?" | ⬜ Pianificato |
| Visualizzazione coda decisionale in UI | ⬜ Pianificato |
| Alert su singoli giocatori | ⬜ Disattivato (dati da certificare) |
| Alert su PVR | ⬜ Pianificato |
| Collegamento Impostazioni → soglie preprocessing | ⬜ Pianificato |
| Copilot collegato al nuovo motore | ⬜ Pianificato |
| Pulizia 106 righe sospette | ⬜ In attesa di certificazione |
| Health Score | ⬜ Non implementato (formula non approvata) |
| Fido PVR | ⬜ Non implementato (dati non disponibili) |
| Agenti | ⬜ Non implementato (dati non disponibili) |
| Soglie commerciali definitive | ⬜ Da validare sui dati storici |

**Le soglie attuali sono tecniche e provvisorie.** Prima dell'attivazione operativa devono essere validate sui dati storici e approvate commercialmente.

---

## 8. Prossimi passi consigliati

Nell'ordine:

1. **Certificazione dei dati giocatore** — verificare e pulire le 106 righe storiche sospette.
2. **Visualizzazione della coda decisionale** — mostrare i 10 alert prioritari in Dashboard.
3. **Bottone operativo** — implementare "Cosa devo fare adesso?".
4. **Drill-down dell'alert** — da segnale rete → PVR coinvolti → giocatori.
5. **Configurazione soglie** — collegare le Impostazioni alle soglie del preprocessing.
6. **Copilot** — collegare l'assistente analitico al nuovo motore.
7. **Monitoraggio** — validare gli alert generati con i dati dei mesi successivi.

---

## 9. Registro tecnico

| Commit | Data | Descrizione | File principali | Test | Esito |
|--------|------|-------------|-----------------|:----:|:-----:|
| `3a01d88` | 16/07 | Fondazione preprocessing | preprocessing.ts | 31 | ✅ |
| `0dbd3c6` | 16/07 | Correzione semantica segnali | preprocessing.ts, test | 73 | ✅ |
| `1dc3a39` | 16/07 | Integrazione nel data layer | data.ts, Dashboard, AlertItem | 80 | ✅ |

---

## 10. Conclusione per il management

Abbiamo costruito la base affidabile del motore decisionale della piattaforma. Tutti gli alert visibili in Dashboard ora provengono da un unico motore di preprocessing che:

- utilizza esclusivamente dati reali;
- spiega sempre perché un alert è stato generato;
- ordina gli alert per priorità;
- è pronto per alimentare il futuro bottone operativo.

**La piattaforma non è ancora dichiarata completa.** Per arrivare a una versione operativa completa servono:

- la certificazione puntuale dei dati giocatore;
- la visualizzazione della coda decisionale;
- l'implementazione del bottone "Cosa devo fare adesso?".

Il lavoro svolto il 20 luglio 2026 costituisce la fondazione tecnica su cui costruire questi ultimi tasselli.

---

*Documento generato automaticamente dai commit GitHub — 20 luglio 2026*
