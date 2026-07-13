# DAZN Bet AI Decision Platform — Guida completa alla Dashboard

Documento di riferimento in italiano per capire **cosa fa** la piattaforma, **quali servizi** offre, **come leggere** ogni schermata e **come interpretare** i dati mostrati.

---

## Indice

1. [Panoramica generale](#1-panoramica-generale)
2. [Architettura e sorgente dati](#2-architettura-e-sorgente-dati)
3. [Navigazione e layout](#3-navigazione-e-layout)
4. [Glossario dei termini chiave](#4-glossario-dei-termini-chiave)
5. [Dashboard (Home)](#5-dashboard-home)
6. [Rete Commerciale](#6-rete-commerciale)
7. [Giocatori](#7-giocatori)
8. [Analytics](#8-analytics)
9. [AI Copilot](#9-ai-copilot)
10. [Impostazioni](#10-impostazioni)
11. [Servizi e funzionalità trasversali](#11-servizi-e-funzionalità-trasversali)
12. [Come leggere colori, badge e indicatori](#12-come-leggere-colori-badge-e-indicatori)
13. [Limitazioni attuali (MVP)](#13-limitazioni-attuali-mvp)

---

## 1. Panoramica generale

**DAZN Bet AI** è una piattaforma di Business Intelligence per la gestione della rete commerciale del betting. Si posiziona sopra i dati esportati dalla dashboard Exalogic e li trasforma in:

- **KPI aggregati** (rake, bet, won, giocatori attivi)
- **Trend temporali** giornalieri e mensili
- **Classifiche** di giocatori e PVR
- **Allerte automatiche** su anomalie e rischi
- **Briefing AI** con criticità, opportunità e suggerimenti operativi
- **Vista gerarchica** della rete (Regioni → Area Manager → PVR → Agenti → Giocatori)
- **Assistente conversazionale** (AI Copilot) per interrogare i dati in linguaggio naturale

### A chi è rivolta

| Ruolo | Utilizzo principale |
|-------|---------------------|
| **Direzione / Executive** | Dashboard, briefing AI, confronti periodo |
| **Area Manager** | Rete commerciale, health score PVR, alert fido |
| **Operatori commerciali** | Griglia giocatori, retention, export CSV |
| **Analisti** | Analytics avanzata, Pareto, anomalie, simulatore What-If |

### Periodo dati attuale

I dati caricati nell'applicazione coprono **Giugno 2026** (30 giorni: 1–30 giugno):

| Metrica | Valore |
|---------|--------|
| Giocatori unici | 133 |
| Record giornalieri | 688 |
| PVR (punti vendita) | 20 |
| Agenti | 30 |
| Area Manager | 6 |
| Regioni | 6 (Lombardia, Toscana, Veneto) |
| Rake totale mese | € 61.964,77 |
| Bet totale mese | € 536.118,18 |
| Top giocatore | Rena72 (€ 13.333,60 di rake) |

---

## 2. Architettura e sorgente dati

### Come funziona tecnicamente

```
Excel Exalogic  →  Elaborazione offline  →  daznbet_data.json  →  App React (browser)
```

- L'app è un **frontend React + Vite** che gira nel browser.
- **Non c'è database live**: tutti i dati sono caricati da un file JSON statico (`app/public/data/daznbet_data.json`).
- Il file viene letto all'avvio tramite `loadData()` e tenuto in **cache in memoria** per tutta la sessione.
- I dati dei giocatori provengono da un export reale Exalogic; la gerarchia rete (regioni, area manager, PVR, agenti) è **generata per la demo** ma coerente con la struttura operativa.

### Colonne originali Excel (Exalogic)

| Colonna | Significato |
|---------|-------------|
| Data | Giorno di riferimento |
| Username | Identificativo giocatore |
| Buy In | Ricarica / ingresso fondi |
| Buy In Bonus | Bonus su buy-in |
| Stack | Saldo stack |
| Bet | Totale scommesso |
| Won | Totale vinto |
| Rake | Margine operatore (ricavo) |
| Payout | Rapporto vincite/scommesse (%) |
| Bet Bonus, Jackpot, ecc. | Metriche accessorie |

### Struttura del file JSON

Il file contiene queste sezioni principali:

| Sezione | Contenuto |
|---------|-----------|
| `metadata` | Periodo, conteggi, distribuzione Pareto |
| `regions` | Regioni geografiche |
| `area_managers` | Responsabili di area |
| `pvrs` | Punti Vendita Raccolta |
| `agents` | Agenti commerciali |
| `players` | Anagrafica e totali per giocatore |
| `daily_kpis` | KPI aggregati per ogni giorno del mese |
| `daily_stats` | Dettaglio giornaliero per giocatore |
| `monthly_aggregates` | Totali mensili |
| `rankings` | Classifiche top giocatori e PVR |
| `alerts` | Elenco allerte generate |
| `briefing` | Briefing AI (criticità, opportunità, suggerimenti) |

---

## 3. Navigazione e layout

### Barra laterale (Sidebar)

Menu fisso a sinistra con 6 voci:

| Voce | Percorso | Funzione |
|------|----------|----------|
| **Dashboard** | `/` | Panoramica executive |
| **Rete** | `/network` | Albero gerarchico commerciale |
| **Giocatori** | `/players` | Tabella completa giocatori |
| **Analytics** | `/analytics` | Analisi avanzata e confronti |
| **AI Copilot** | `/copilot` | Chat assistente intelligente |
| **Impostazioni** | `/settings` | Configurazione alert e preferenze |

La sidebar può essere **compressa** (icona in basso) per risparmiare spazio.

### Barra superiore (TopBar)

Mostra il titolo e il sottotitolo della pagina corrente, oltre a controlli globali (notifiche, profilo).

### Tema visivo

- **Tema scuro** professionale, orientato alla densità informativa
- **Verde** = valori positivi / in crescita
- **Rosso** = criticità / valori negativi
- **Ambra** = avvisi / attenzione
- **Blu** = azioni primarie e metriche bet
- **Viola** = componenti AI (briefing, copilot, insight)

---

## 4. Glossario dei termini chiave

### Metriche finanziarie

| Termine | Definizione | Come si legge |
|---------|-------------|---------------|
| **Rake** | Margine dell'operatore sulle giocate. È il ricavo principale della rete. | Valore positivo = guadagno. Valore negativo = perdita netta nel giorno. |
| **Bet** | Totale importo scommesso dai giocatori. | Indica il volume di gioco. Più alto = più attività. |
| **Won** | Totale vinto dai giocatori. | In genere: Won ≈ Bet − Rake. |
| **Buy In** | Ricarica / ingresso fondi del giocatore. | Misura l'afflusso di liquidità. |
| **Payout** | Percentuale di ritorno al giocatore (Won/Bet × 100). | Alto payout = giocatori vincono di più = meno margine. |
| **Fido** | Limite di credito assegnato a un PVR. | |
| **Fido usato** | Quota del fido già utilizzata. | Oltre l'85% = warning; oltre il 95% = critico. |
| **Saldo** | Saldo contabile del PVR. | |

### Entità della rete

| Termine | Definizione |
|---------|-------------|
| **Regione** | Area geografica (es. Lombardia, Toscana) |
| **Area Manager (AM)** | Responsabile commerciale di una o più regioni |
| **PVR** | Punto Vendita Raccolta — sede operativa della rete |
| **Agente** | Operatore che gestisce i giocatori di un PVR |
| **Giocatore** | Utente finale che scommette |

### Indicatori di salute

| Termine | Definizione |
|---------|-------------|
| **Health Score** | Punteggio 0–100 che misura la "salute" di un PVR o giocatore |
| **Giorni attivi** | Numero di giorni nel mese in cui il giocatore ha giocato |
| **Churn** | Rischio di abbandono del giocatore |
| **Pareto** | Concentrazione del rake: pochi giocatori generano la maggior parte del ricavo |

### Formula Health Score (PVR e Giocatori)

Il punteggio è calcolato con una formula ponderata:

| Fattore | Peso |
|---------|------|
| Crescita rake | 30% |
| Mix Sport vs Casino | 15% |
| Nuovi clienti | 15% |
| Tasso di retention | 15% |
| Utilizzo fido | 10% |
| Saldo positivo | 10% |
| Movimento / attività | 5% |

**Interpretazione:**

| Punteggio | Etichetta | Colore |
|-----------|-----------|--------|
| ≥ 80 | Buona / Attivo | Verde |
| 50–79 | Media / A rischio | Ambra |
| < 50 | Critica | Rosso |

---

## 5. Dashboard (Home)

**Percorso:** `/`  
**Scopo:** Vista executive con i KPI principali, trend, briefing AI, classifica e allerte.

### 5.1 Intestazione

- Titolo: **Dashboard — Panoramica rete — Giugno 2026**
- **Esporta Report**: pulsante per export (UI presente, funzionalità demo)
- **Aggiorna Dati**: ricarica visivamente i dati (simulazione refresh)

### 5.2 Le 5 card KPI

| Card | Cosa mostra | Dettaglio |
|------|-------------|-----------|
| **Rake Totale** | Ricavo totale del mese | Sparkline giornaliera + confronto vs maggio (+12,4% demo) |
| **Bet Totale** | Volume scommesse del mese | Sparkline + confronto vs maggio |
| **Won Totale** | Vincite totali | Include payout medio nel footer |
| **Giocatori Attivi** | Media giornaliera giocatori attivi | Es. 22,9/giorno su 133 totali |
| **Tendenza Rake** | Variazione e giorni negativi | Evidenzia quanti giorni hanno avuto rake < 0 e il giorno peggiore |

Ogni card include:
- **Valore principale** in euro o numero
- **Delta percentuale** (verde = positivo, rosso = negativo, ambra = warning)
- **Mini grafico sparkline** dell'andamento nel mese
- **Nota in basso** con contesto aggiuntivo

### 5.3 Grafico "Andamento Giornaliero"

Grafico ad area con due serie sovrapposte:

- **Verde — Rake**: andamento del margine giornaliero
- **Blu — Bet**: andamento del volume scommesse

Elementi da leggere:
- **Asse X**: giorni del mese (1–30 giugno)
- **Asse Y**: importi in migliaia di euro (es. "5k" = € 5.000)
- **Linea tratteggiata orizzontale**: media rake del periodo
- **Tooltip al passaggio del mouse**: valori esatti per rake e bet

### 5.4 Pannello AI Briefing

Pannello viola con analisi automatica suddivisa in **tre colonne**:

#### Criticità (rosso)
Problemi che richiedono attenzione immediata. Esempi nel dataset:
- 5 giorni con rake negativo (totale € −6.473,61)
- 5 PVR con fido quasi esaurito (>85%)
- 10 giocatori ad alto rischio churn

#### Opportunità (verde)
Potenziali di crescita:
- Top player Rena72 con € 13.333,60 di rake
- Distribuzione Pareto: top 10% genera l'82,3% del rake
- 22 giocatori molto fedeli (10+ giorni attivi)

#### Suggerimenti (ambra)
Azioni operative consigliate:
- Campagna retention per giocatori a rischio
- Investigare giorni con rake negativo
- Aumentare fido ai PVR in crescita
- Visite commerciali ai PVR con health score basso

### 5.5 Tabella Top 10 Giocatori

Classifica per **rake totale** con colonne:

| Colonna | Significato |
|---------|-------------|
| # | Posizione in classifica |
| Username | Nome giocatore |
| PVR | Punto vendita di appartenenza |
| Rake Totale | Ricavo generato |
| Bet Totale | Volume scommesso |
| Giorni | Giorni attivi nel mese (verde ≥20, ambra 10–19, rosso <10) |
| Health | Anello con punteggio salute |
| Stato | Badge Attivo / A Rischio / Critico |

### 5.6 Feed Allerte

Lista scorrevole di alert con filtri:

| Filtro | Mostra |
|--------|--------|
| **Tutte** | Tutti gli alert |
| **Critiche** | Severità `high` |
| **Avvisi** | Severità `medium` e `low` |

Ogni alert mostra:
- Icona e bordo colorato per severità
- Titolo e descrizione
- Data relativa ("Oggi", "X giorni fa")

**Categorie alert nel sistema:**

| Categoria | Esempio |
|-----------|---------|
| `rake_negative` | Rake negativo in un giorno specifico |
| `fido` | Utilizzo fido PVR elevato |
| `payout` | Payout anomalo |
| `churn` | Giocatore a rischio abbandono |

---

## 6. Rete Commerciale

**Percorso:** `/network`  
**Scopo:** Esplorare la gerarchia completa della rete in vista ad albero.

### 6.1 Struttura gerarchica

```
Regione
 └── Area Manager
      └── PVR (Punto Vendita)
           └── Agente
                └── Giocatore
```

### 6.2 Barra filtri

| Controllo | Funzione |
|-----------|----------|
| **Filtro regione** | Mostra solo una regione (Lombardia, Toscana, Veneto) |
| **Ricerca** | Cerca per nome PVR, agente o giocatore |
| **Espandi** | Apre tutti i nodi dell'albero |
| **Comprimi** | Chiude tutti i nodi |

### 6.3 Cosa mostra ogni livello

| Livello | Informazioni visibili nella riga |
|---------|----------------------------------|
| **Regione** | N. Area Manager, N. PVR, rake totale regione, health ring |
| **Area Manager** | Email, N. PVR, rake totale |
| **PVR** | Codice, città, badge trend (In Crescita/Stabile/In Calo), N. agenti, N. giocatori, rake, barra utilizzo fido |
| **Agente** | Codice, % commissione, N. giocatori, rake totale |
| **Giocatore** | Rake, giorni attivi, badge stato (Attivo/Inattivo) |

### 6.4 Pannello dettaglio (clic su un nodo)

Si apre un pannello laterale destro (420px) con:

- **Tipo entità** e percorso gerarchico (breadcrumb)
- **Health Score** (anello grande) per PVR e giocatori
- **KPI specifici** per tipo:
  - *PVR*: rake totale, giocatori, agenti, fido
  - *Agente*: giocatori, commissione, codice
  - *Giocatore*: rake, bet, payout, giorni attivi
  - *Regione/AM*: conteggi strutturali
- **AI Insight** (solo giocatori): suggerimento automatico basato sul health score
- **Lista giocatori** (solo agenti): elenco con rake per giocatore

### 6.5 Barra riepilogo in basso

Barra fissa con totali rete:
- Health media rete (barra + punteggio /100)
- Rake totale
- Giocatori totali
- N. PVR
- N. Agenti

### 6.6 Badge trend PVR

| Badge | Condizione | Significato |
|-------|------------|-------------|
| **In Crescita** (verde) | Health ≥ 75 | PVR in buona salute |
| **Stabile** (ambra) | Health 50–74 | Monitorare |
| **In Calo** (rosso) | Health < 50 | Intervento necessario |

### 6.7 Barra utilizzo Fido

| Colore | Utilizzo |
|--------|----------|
| Verde | < 85% |
| Ambra | 85–94% |
| Rosso | ≥ 95% |

---

## 7. Giocatori

**Percorso:** `/players`  
**Scopo:** Griglia completa di tutti i 133 giocatori con ricerca, filtri, ordinamento ed export.

### 7.1 Riepilogo in alto

5 card statistiche:
- **Totale Giocatori**: 133
- **Attivi**: giocatori con stato `active`
- **Inattivi**: giocatori con stato `inactive`
- **Rake Medio**: rake medio per giocatore
- **Top Player**: username del miglior giocatore

Badge aggiuntivi: Rake Totale, Bet Totale, Payout Medio della rete.

### 7.2 Filtri e ricerca

| Filtro | Opzioni |
|--------|---------|
| **Ricerca testuale** | Username, nome, PVR, agente |
| **PVR** | Tutti o singolo punto vendita |
| **Stato** | Tutti / Attivo / Inattivo |
| **Livello attività** | Molto Attivo (20+ giorni) / Attivo (10–19) / Poco Attivo (<10) |

I filtri attivi appaiono come **pillole** rimovibili. Il contatore mostra i risultati filtrati.

### 7.3 Colonne della tabella

| Colonna | Descrizione | Come interpretarla |
|---------|-------------|-------------------|
| **Username** | Identificativo con avatar iniziali | |
| **PVR** | Punto vendita | |
| **Agente** | Agente di riferimento | |
| **Rake Totale** | Ricavo generato nel mese | Ordinabile (default: decrescente) |
| **Bet Totale** | Volume scommesse | |
| **Payout %** | Payout medio | Rosso >150%, Ambra >100%, Verde <50% |
| **Giorni Attivi** | Giorni con attività nel mese | Badge colorato |
| **Health** | Anello 0–100 | |
| **Stato** | Attivo / Inattivo | |
| **Trend** | Sparkline ultimi 14 giorni di rake | Colore basato su health |
| **Azioni** | Icona occhio → apre dettaglio | |

### 7.4 Paginazione

- Default: **20 righe per pagina** (opzioni 20, 50, 100)
- Navigazione con frecce e numeri pagina
- Contatore "Visualizzazione X–Y di Z giocatori"

### 7.5 Export CSV

Il pulsante **Esporta CSV** scarica un file con tutti i giocatori filtrati, contenente:
Username, Nome, PVR, Agente, Rake, Bet, Won, Payout, Giorni Attivi, Health Score, Stato.

### 7.6 Pannello dettaglio giocatore

Clic sull'icona occhio apre un pannello laterale con:

1. **Profilo**: username, PVR, agente, health score, stato, badge "Top 1%" se ≥25 giorni attivi
2. **KPI**: Rake, Bet, Won, Giorni Attivi, Payout Medio, Buy In
3. **Trend 30 giorni**: mini grafico a barre del rake giornaliero
4. **Attività giornaliera**: tabella con Data, Bet, Won, Rake (rosso se negativo), Payout
5. **Insight AI**: testo automatico basato sul profilo del giocatore:
   - Top performer → programma VIP
   - Health basso → intervento retention entro 7 giorni
   - Molto attivo → monitorare payout
   - Potenziale → strategia engagement

---

## 8. Analytics

**Percorso:** `/analytics`  
**Scopo:** Analisi approfondita con confronti periodo, trend, anomalie, distribuzioni e simulazioni.

### 8.1 Confronto periodo (Maggio vs Giugno 2026)

Barra superiore per selezionare i periodi da confrontare.

**Grafico a barre affiancate**: rake giornaliero Maggio (blu) vs Giugno (verde).

**Card delta** (4 metriche):

| Metrica | Cosa confronta |
|---------|----------------|
| Rake | Totale maggio vs giugno + % variazione |
| Bet | Idem |
| Won | Idem |
| Gioc. Attivi | Numero giocatori attivi |

> **Nota:** I dati di maggio sono **simulati** (~88% di giugno) per la demo del confronto.

**Granularità**: Giornaliero / Settimanale / Mensile.

### 8.2 Analisi Trend

Grafico combinato (area + linee) con toggle per mostrare/nascondere:
- **Rake** (area verde)
- **Bet** (linea blu)
- **Won** (linea ciano)

Footer con indicatori:
- Trend stimato (+€/giorno)
- Coefficiente R² (affidabilità trend)
- Previsione mese successivo

### 8.3 Rilevazione Anomalie

**Scatter plot** con:
- Punti grigi = giorni normali
- Punti rossi = anomalie (deviazione > 2σ dalla media)

**Lista anomalie** con:
- Data e valore rake
- Z-score (σ)
- Descrizione (es. "Rake negativo — perdita netta", "Picco anomalo")

Nel dataset giugno 2026: **5 giorni con rake negativo**, il peggiore il **17 giugno** (€ −4.603,42).

### 8.4 Analisi distribuzione (3 grafici)

| Grafico | Cosa mostra |
|---------|-------------|
| **Pareto — Rake per Giocatore** | Barre rake top 20 + linea cumulativa % |
| **Distribuzione Sport/Casino** | Torta: Calcio 45%, Tennis 20%, Basket 15%, Casino Slots 12%, Casino Live 8% |
| **Rake per PVR** | Barre orizzontali top 10 PVR per rake |

> La distribuzione Sport/Casino è **simulata** per la demo.

### 8.5 Simulatore What-If

Strumento interattivo per proiettare il rake variando:

| Slider | Range | Effetto |
|--------|-------|---------|
| Giocatori Attivi | −50% … +50% | Varia il numero di giocatori |
| Payout Medio | −20% … +20% | Varia il payout |
| Bet per Giocatore | −30% … +50% | Varia il volume per giocatore |

**Formula:** `Rake Proiettato = (Giocatori × Bet/Giocatore) × (1 − Payout)`

**Preset rapidi:**
- Ottimistico (+20% giocatori, −5% payout, +10% bet)
- Pessimistico (−15%, +8%, −10%)
- Crescita Aggressiva (+30%, −10%, +25%)

Mostra: rake attuale, rake proiettato, variazione assoluta e percentuale.

### 8.6 Insight dall'AI

Box finale con 4 insight automatici sul confronto periodo:
1. Crescita rake +12,3% vs maggio
2. Calo giocatori attivi −3%
3. 5 giorni con rake negativo
4. Concentrazione Pareto estrema (top 10% = 82,3% rake)

---

## 9. AI Copilot

**Percorso:** `/copilot`  
**Scopo:** Assistente conversazionale per interrogare i dati in linguaggio naturale.

### 9.1 Layout

- **Sidebar sinistra**: domande suggerite per categoria
- **Area chat centrale**: conversazione
- **Barra input in basso**: campo testo + chip rapidi

### 9.2 Categorie domande suggerite

| Categoria | Esempi |
|-----------|--------|
| **Trend** | "Perché giugno è andato peggio di maggio?", "Qual è il trend del rake?" |
| **Ranking** | "Quali sono i 5 PVR migliori?", "Chi sono i giocatori top?" |
| **Network** | "Quali PVR stanno crescendo?", "Quali agenti perdono giocatori?" |
| **Anomalie** | "Ci sono anomalie questo mese?", "Giorni con rake negativo?" |

### 9.3 Chip rapidi

`Rake di oggi` · `Top giocatori` · `Allerte` · `Confronta periodi` · `Trend` · `Fai un briefing`

### 9.4 Tipi di risposta

Il Copilot risponde con testo + componenti dati:

| Tipo risposta | Contenuto |
|---------------|-----------|
| **Testo** | Spiegazione in italiano |
| **Tabella** | Dati strutturati (es. top 5 PVR o giocatori) |
| **Trend chart** | Mini grafico a barre del rake giornaliero |
| **Alert card** | Riepilogo anomalie con severità |
| **Briefing** | Criticità, opportunità e suggerimenti |

### 9.5 Parole chiave riconosciute

Il motore risponde in base a keyword nel messaggio:

| Keyword | Risposta |
|---------|----------|
| peggio, maggio, giugno | Confronto periodo con trend |
| pvr, migliori | Top 5 PVR |
| giocatori, top | Top 5 giocatori per rake |
| anomalie | Giorni rake negativo + alert |
| briefing, riassunto | Briefing completo |
| trend + rake | Andamento rake mensile |
| negativo, giorni | Dettaglio giorni negativi |

> **Nota:** Il Copilot usa un motore **rule-based** (non LLM esterno). Risponde solo a domande correlate ai dati di giugno 2026.

### 9.6 Contesto attuale

Pannello in basso nella sidebar:
- Periodo: Giugno 2026
- Rete: Completa
- Dati: 133 giocatori, 688 record

---

## 10. Impostazioni

**Percorso:** `/settings`  
**Scopo:** Configurare alert, preferenze utente, tema, gestione dati e account.

### 10.1 Tab: Soglie Alert

Configura le soglie che attivano alert automatici:

| Soglia | Default | Descrizione |
|--------|---------|-------------|
| Utilizzo Fido — Warning | 85% | Alert quando il fido supera questa % |
| Utilizzo Fido — Critico | 95% | Alert critico |
| Calo Rake Giornaliero | −20% | Alert se rake cala rispetto alla media |
| Giocatori Inattivi | 7 giorni | Giorni senza attività prima di segnalare churn |
| Anomalia Payout | 200% | Alert se payout medio supera questa % |

Per ogni soglia: slider, livello severità (Critico / Avviso / Info), pulsante reset.

**Canali notifica** (toggle):
- Dashboard ✓
- Email
- SMS
- Webhook

**Anteprima**: simula quanti alert avresti ricevuto nel periodo (es. 2 critici, 3 avvisi, 1 info).

### 10.2 Tab: Preferenze

| Sezione | Opzioni |
|---------|---------|
| **Notifiche** | Push browser, suoni alert, auto-refresh ogni 5 min |
| **Lingua e formato** | Italiano/English, formato data, valuta (EUR/USD/GBP) |
| **Tabella giocatori** | Righe per pagina (10/25/50/100) |

### 10.3 Tab: Tema

| Opzione | Scelte |
|---------|--------|
| Colore accento | Blue, Purple, Cyan, Indigo |
| Modalità | Scuro / Chiaro |
| Densità | Compatta / Standard / Comoda |
| Effetti | Animazioni, glassmorphism, sparkline, highlight AI |

### 10.4 Tab: Dati

| Funzione | Descrizione |
|----------|-------------|
| **Sorgente dati** | Ultimo aggiornamento, conteggio record |
| **Aggiorna Ora** | Ricarica dati (simulazione) |
| **Esporta Tutti i Dati** | Export completo |
| **Modalità aggiornamento** | Manuale o automatico (03:00) |
| **Svuota Cache** | Forza ricaricamento dal server |

### 10.5 Tab: Account

| Sezione | Contenuto |
|---------|-----------|
| **Profilo** | Nome, email, ruolo (demo: Admin / Gestore Rete) |
| **Sicurezza** | Cambio password, 2FA |
| **Notifiche personali** | Alert email, report settimanale, alert critici real-time |

Barra inferiore: **Annulla Modifiche** / **Salva Impostazioni**.

> Le impostazioni sono salvate **solo in memoria** nella sessione corrente (MVP demo).

---

## 11. Servizi e funzionalità trasversali

### 11.1 Servizio caricamento dati (`loadData`)

- Carica `daznbet_data.json` via HTTP
- Cache in memoria per tutta la sessione
- Funzioni helper: `formatCurrency`, `formatPercent`, `getPvrName`, `getPlayerStatus`

### 11.2 Servizio KPI

Aggregazioni automatiche da `daily_kpis` e `monthly_aggregates`:
- Rake, bet, won totali
- Media giocatori attivi/giorno
- Media payout
- Sparkline per ogni metrica

### 11.3 Servizio Ranking

Da `rankings`:
- `top_players_by_rake` — classifica giocatori per rake
- `top_players_by_bet` — classifica per volume bet
- `top_pvrs` — classifica PVR per performance

### 11.4 Servizio Alert

Da `alerts`:
- Filtro per severità (high, medium, low)
- Categorie: rake negativo, fido, payout, churn
- Ogni alert: titolo, descrizione, data, valore metrica

### 11.5 Servizio Briefing AI

Da `briefing`:
- Generato automaticamente dai dati
- Tre liste: `criticals`, `opportunities`, `suggestions`
- Ogni item: titolo, descrizione, metrica, valore

### 11.6 Servizio Anomaly Detection (Analytics)

- Calcolo media e deviazione standard del rake giornaliero
- Z-score per ogni giorno
- Flag anomalia se |z| > 2
- Evidenziazione giorni con rake negativo

### 11.7 Servizio What-If (Analytics)

Simulazione matematica del rake variando giocatori, payout e bet.

### 11.8 Servizio AI Copilot (NLU rule-based)

Classificazione intent per keyword → risposta predefinita con dati reali.

### 11.9 Servizio Export

- **CSV giocatori**: dalla pagina Giocatori (filtrati)
- **Report dashboard**: pulsante presente (demo)
- **Export dati completi**: da Impostazioni (demo)

### 11.10 Servizio Health Score

Calcolo e visualizzazione punteggio 0–100 per PVR e giocatori, con anello colorato e etichette.

---

## 12. Come leggere colori, badge e indicatori

### Codice colore universale

| Colore | Significato | Dove appare |
|--------|-------------|-------------|
| 🟢 Verde (`#10b981`) | Positivo, buono, in crescita | Rake, health alto, delta positivo |
| 🔴 Rosso (`#ef4444`) | Negativo, critico, pericolo | Rake negativo, health basso, alert critici |
| 🟡 Ambra (`#f59e0b`) | Attenzione, warning | Fido alto, payout elevato, giorni medi |
| 🔵 Blu (`#3b82f6`) | Bet, azioni primarie | Volume scommesse, pulsanti, link attivi |
| 🟣 Viola (`#8b5cf6`) | AI / intelligenza | Briefing, Copilot, insight, What-If |
| 🔵 Ciano (`#06b6d4`) | Giocatori attivi | Metriche utenza |

### Badge stato giocatore

| Badge | Condizione |
|-------|------------|
| **Attivo** (verde) | `status = active` oppure health ≥ 75 |
| **A Rischio** (ambra) | Health 50–74 |
| **Critico** (rosso) | Health < 50 |
| **Inattivo** (rosso) | `status = inactive` |

### Badge giorni attivi

| Colore | Giorni |
|--------|--------|
| Verde | ≥ 20 |
| Ambra | 10–19 |
| Rosso | < 10 |

### Severità alert

| Livello | Colore bordo | Icona |
|---------|--------------|-------|
| `high` (Critico) | Rosso | Triangolo |
| `medium` (Avviso) | Ambra | Cerchio |
| `low` (Info) | Blu | Info |

### Anello Health Score

- **Numero centrale**: punteggio 0–100
- **Arco colorato**: proporzionale al punteggio
- **Colori**: verde ≥80, ambra 50–79, rosso <50

---

## 13. Limitazioni attuali (MVP)

Questa versione è un **MVP dimostrativo**. È importante conoscere questi limiti:

| Aspetto | Stato attuale |
|---------|---------------|
| **Database** | Nessuno — solo file JSON statico |
| **Aggiornamento dati** | Manuale (sostituire il JSON) |
| **Dati maggio 2026** | Simulati per il confronto periodo |
| **Distribuzione Sport/Casino** | Simulata |
| **AI Copilot** | Rule-based, non LLM reale |
| **Impostazioni** | Non persistono tra sessioni |
| **Export report** | UI presente, non genera PDF reali |
| **Notifiche email/SMS** | Solo toggle UI, non inviano messaggi |
| **Autenticazione** | Nessun login reale |
| **Delta % KPI dashboard** | Valori demo hardcoded (es. +12,4% vs maggio) |
| **Gerarchia rete** | PVR/Agenti/AM generati per demo |

### Prossimi passi previsti (da piano progetto)

1. Connessione a database proprietario
2. Import automatico da Excel Exalogic
3. API backend per KPI, alert, briefing in tempo reale
4. Copilot con LLM reale
5. Deploy su hosting di produzione
6. Notifiche email/webhook funzionanti

---

## Riepilogo rapido: quale pagina usare per cosa

| Voglio… | Vado su… |
|---------|----------|
| Vedere i numeri chiave del mese | **Dashboard** |
| Capire cosa fare oggi (criticità/suggerimenti) | **Dashboard** → AI Briefing |
| Vedere alert e problemi | **Dashboard** → Allerte |
| Esplorare la struttura commerciale | **Rete** |
| Controllare fido e health di un PVR | **Rete** → clic su PVR |
| Cercare un giocatore specifico | **Giocatori** |
| Esportare lista giocatori | **Giocatori** → Esporta CSV |
| Vedere dettaglio giornaliero di un giocatore | **Giocatori** → icona occhio |
| Confrontare maggio vs giugno | **Analytics** |
| Trovare anomalie nel rake | **Analytics** → Rilevazione Anomalie |
| Simulare scenari futuri | **Analytics** → Simulatore What-If |
| Fare una domanda in linguaggio naturale | **AI Copilot** |
| Configurare soglie alert | **Impostazioni** → Soglie Alert |
| Cambiare tema o lingua | **Impostazioni** → Tema / Preferenze |

---

*Documento generato per il progetto DAZN Bet AI Decision Platform — versione MVP locale.*  
*Ultimo aggiornamento: luglio 2026*
