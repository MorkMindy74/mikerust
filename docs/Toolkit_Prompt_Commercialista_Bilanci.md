# Toolkit prompt & schemi per il commercialista
## Analisi di bilanci, riclassificati, confronti pluriennali, cespiti e libri contabili

> Pensato per essere caricato insieme ai file (PDF/Excel) in uno strumento di AI generativa.
> I prompt sono parametrizzati: sostituisci le parti tra `[...]`.

---

## 0. Prima di iniziare: privacy e impostazione

**Anonimizzazione (obbligo di fatto, non opzione).** Prima di caricare documenti su strumenti cloud (ChatGPT, Gemini, Claude consumer), rimuovi o sostituisci con segnaposto: ragione sociale, P.IVA/C.F., nomi di persone, IBAN, indirizzi, nominativi clienti/fornitori. Per dati realmente riservati usa account *enterprise* (no training sui dati) o un LLM in locale. È la stessa indicazione della guida CNDCEC che hai caricato.

**Validazione.** L'output dell'AI è una bozza: ogni numero, indice e conclusione va riconciliato con le fonti. La responsabilità resta in capo al professionista (art. 13 L. 132/2025).

**Prompt "di sistema" da incollare sempre all'inizio** (definisce il ruolo e riduce le allucinazioni):

```
Agisci come analista di bilancio esperto di principi contabili italiani (OIC) e
schemi civilistici (artt. 2424, 2425, 2427 c.c.). Regole che devi rispettare:
1. Usa SOLO i numeri presenti nei file che ti carico. Se un dato manca, scrivi
   "DATO NON DISPONIBILE" e non inventarlo né stimarlo.
2. Per ogni indice mostra la formula usata, il numeratore e il denominatore con
   i valori effettivi, così posso verificare il calcolo.
3. Segnala incoerenze, quadrature che non tornano e poste anomale invece di
   "sistemarle" silenziosamente.
4. Distingui sempre i fatti (numeri dai file) dalle tue interpretazioni.
5. Output in italiano, in tabelle dove utile.
Confermami di aver capito e attendi i file.
```

---

## 1. BILANCIO D'ESERCIZIO (civilistico, non ancora riclassificato)

### Prompt – lettura e controllo
```
Allego il bilancio dell'esercizio [ANNO] (Stato Patrimoniale, Conto Economico
[ed eventuale Nota Integrativa]).
Esegui in ordine:
1. QUADRATURE: verifica che Totale Attivo = Totale Passivo; che l'utile/perdita
   del CE coincida con la voce di patrimonio netto; che i totali parziali
   sommino correttamente. Elenca ogni differenza in euro.
2. COMPLETEZZA: segnala voci di schema civilistico previste ma assenti o a zero
   in modo sospetto (es. nessun fondo TFR con personale presente).
3. POSTE ANOMALE o di importo rilevante che meritano approfondimento, con il
   motivo.
4. Sintesi: 5 osservazioni principali sulla salute economico-finanziaria.
Mostra tutto in tabella. Non riclassificare ancora.
```

### Schema delle analisi da ottenere
- Quadratura attivo/passivo e dei totali parziali.
- Coerenza utile CE ↔ patrimonio netto SP.
- Identificazione delle voci più pesanti (peso % su totale attivo / su valore della produzione).
- Voci insolite: crediti v/soci, crediti/debiti v/imprese del gruppo, immobilizzazioni finanziarie, costi capitalizzati.

### Lavori noiosi ma delicati (qui l'AI aiuta molto)
- **Continuità dei saldi**: i valori di apertura di quest'anno = chiusura dell'anno scorso? (vedi §3).
- **Quadratura ammortamenti**: ammortamenti a CE coerenti con l'incremento dei fondi ammortamento a SP.
- **TFR**: accantonamento dell'anno + rivalutazione − utilizzi (anticipi/liquidazioni) = variazione del fondo.
- **Ratei e risconti**: presenza e coerenza con costi/ricavi a cavallo d'anno.
- **Fondo svalutazione crediti** vs entità e anzianità dei crediti.

---

## 2. BILANCIO RICLASSIFICATO

Se carichi già il riclassificato: usalo per gli indici. Se carichi il civilistico: chiedi prima la riclassificazione (schemi pronti al §6).

### Prompt – riclassificazione + indici
```
Allego [il bilancio civilistico / il bilancio già riclassificato].
[Se civilistico:] Riclassifica lo Stato Patrimoniale con criterio finanziario
(liquidità/esigibilità) e il Conto Economico a valore aggiunto.
Poi calcola e commenta questo cruscotto di indici, mostrando formula e valori:
- Redditività: ROE, ROI, ROS, incidenza oneri finanziari.
- Struttura finanziaria: Margine di struttura, Capitale Circolante Netto (CCN),
  Margine di Tesoreria, Posizione Finanziaria Netta (PFN), Leverage (D/E).
- Liquidità: Current ratio, Quick ratio (acid test).
- Rotazione/durata: giorni medi di incasso crediti, di pagamento debiti,
  di giacenza magazzino, ciclo del circolante.
- Sostenibilità del debito: PFN/EBITDA, DSCR se ricavabile.
Per ogni indice indica un benchmark indicativo e se il valore è
fisiologico/da attenzionare. Concludi con punti di forza e di debolezza.
```

### Schema – cruscotto indici (cosa ti deve restituire)

| Area | Indici principali | A cosa serve |
|---|---|---|
| Redditività | ROE, ROI, ROS, ROA | Quanto rende il capitale e la gestione caratteristica |
| Struttura | Margine di struttura, CCN, Margine di tesoreria | Equilibrio fonti/impieghi, copertura immobilizzazioni |
| Liquidità | Current ratio, Quick ratio | Capacità di far fronte al breve termine |
| Indebitamento | Leverage (D/E), PFN, PFN/EBITDA | Peso e sostenibilità del debito |
| Durate | gg crediti, gg debiti, gg magazzino, ciclo monetario | Assorbimento di cassa del circolante |
| Crisi | DSCR, PN, indici allerta CNDCEC | Segnali precoci ex Codice della Crisi |

### Lavori noiosi ma delicati
- **Tracciabilità della riclassificazione**: che ogni voce civilistica finisca in una sola voce riclassificata e che i totali coincidano col civilistico (l'AI può fornire la "tabella ponte").
- **EBITDA/EBIT coerenti**: ricostruzione da CE senza dimenticare voci straordinarie o non ricorrenti.
- **PFN**: somma corretta di debiti finanziari a breve+lungo − disponibilità liquide − crediti finanziari; attenzione a non includere debiti commerciali.

---

## 3. CONFRONTO DI 2–3 ANNUALITÀ

### Prompt – analisi orizzontale e per indici
```
Allego i bilanci degli esercizi [ANNO1], [ANNO2] (e [ANNO3]).
1. CONTROLLO DI CONTINUITÀ: verifica che i saldi di chiusura di ogni anno
   coincidano con i saldi di apertura dell'anno successivo. Elenca le rotture
   di continuità in euro, voce per voce.
2. ANALISI ORIZZONTALE: per ogni voce di SP e CE mostra valore per anno,
   variazione assoluta e variazione %. Evidenzia le variazioni > [20]% o
   > [50.000] euro.
3. TREND DEGLI INDICI: ricostruisci il cruscotto indici per ciascun anno in
   un'unica tabella, così da leggere l'andamento (in miglioramento/peggioramento).
4. NARRATIVA: spiega in 8-10 righe la storia economico-finanziaria che emerge
   (es. crescita ricavi ma erosione marginalità, aumento indebitamento, ecc.).
Tabelle affiancate per anno. Segnala dati incoerenti tra annualità.
```

### Schema – tabella di confronto

| Voce / Indice | Anno1 | Anno2 | Anno3 | Δ assoluta | Δ % | Trend |
|---|---|---|---|---|---|---|

### Lavori noiosi ma delicati
- **Continuità dei saldi** tra annualità (il controllo più trascurato e più rivelatore di errori di riporto).
- **Omogeneità degli schemi**: stessi criteri di classificazione tra anni (riclassifiche, cambi di principio contabile da segnalare in Nota Integrativa).
- **Variazioni "sospette"**: voci che cambiano segno, azzeramenti improvvisi, riclassifiche mascherate da variazioni gestionali.
- **Coerenza fiscale pluriennale**: perdite riportabili, ACE, crediti d'imposta che si trascinano tra dichiarazioni.

---

## 4. ELENCO CESPITI (registro dei beni ammortizzabili)

### Prompt – riconciliazione e ammortamenti
```
Allego il registro cespiti [e il bilancio dell'anno [ANNO]].
1. RICONCILIAZIONE: confronta il totale costo storico e il totale fondo
   ammortamento del registro con le immobilizzazioni e i relativi fondi a SP.
   Elenca ogni differenza.
2. AMMORTAMENTI: per ciascun cespite verifica che la quota dell'anno sia
   coerente con coefficiente x costo (pro-rata temporis per gli acquisti
   dell'anno; metà aliquota primo anno se applicato). Segnala calcoli anomali.
3. SUPERAMMORTAMENTO: segnala cespiti completamente ammortizzati ancora in uso
   e cespiti con fondo > costo (errore).
4. MOVIMENTI: isola acquisti e dismissioni dell'anno; per le cessioni calcola
   plus/minusvalenza (corrispettivo − valore netto contabile) se i dati ci sono.
5. Restituisci una tabella riepilogo per categoria (costo, F.do, valore netto,
   quota dell'anno).
```

### Schema – riepilogo cespiti

| Categoria | Costo storico | F.do amm.to inizio | Quota anno | F.do amm.to fine | Valore netto | Note |
|---|---|---|---|---|---|---|

### Lavori noiosi ma delicati
- **Riconciliazione registro ↔ bilancio** (costo storico e fondi): differenze = errori da trovare.
- **Pro-rata temporis** e **metà aliquota** nel primo anno; coerenza dei coefficienti con le tabelle ministeriali.
- **Beni < 516,46 €** dedotti integralmente vs capitalizzati.
- **Cespiti totalmente ammortizzati** ancora presenti; **dismissioni** non registrate.
- **Plus/minusvalenze** su cessioni e rilevanza fiscale (rateizzazione plusvalenze).
- **Manutenzioni**: ordinarie (a costo) vs incrementative (capitalizzate) e plafond 5%.

---

## 5. LIBRI CONTABILI (libro giornale, mastrini, registri IVA)

### Prompt – controlli di quadratura
```
Allego [libro giornale / mastrini / registri IVA] del periodo [PERIODO].
Esegui questi controlli e riportami solo le anomalie:
1. PARTITA DOPPIA: in ogni scrittura il totale Dare = totale Avere?
   Elenca scritture sbilanciate con data e importo.
2. PROGRESSIVITÀ: numerazione/date delle registrazioni progressive e senza
   salti o duplicati?
3. SALDI: i saldi dei mastrini chiave (banche, cassa, clienti, fornitori,
   erario, IVA) sono coerenti e di segno atteso? Segnala saldi anomali
   (es. cassa negativa, banca a credito non giustificata).
4. RIEPILOGO IVA: dai registri IVA ricostruisci IVA a debito, a credito e
   saldo del periodo; segnala scostamenti rispetto a [LIPE/liquidazione].
Tabella delle anomalie con riferimento alla scrittura.
```

### Schema – registro anomalie

| Rif. scrittura | Data | Descrizione | Tipo anomalia | Importo | Azione suggerita |
|---|---|---|---|---|---|

### Lavori noiosi ma delicati
- **Quadratura Dare/Avere** di tutte le scritture e quadratura generale del giornale.
- **Cassa mai negativa**; saldi banca riconciliati con estratti conto.
- **Riconciliazione IVA**: registri IVA ↔ liquidazioni periodiche (LIPE) ↔ dichiarazione IVA annuale.
- **Ritenute e contributi**: maturato a libro ↔ versato (F24).
- **Quadratura clienti/fornitori**: mastrini ↔ scadenzario ↔ saldi di bilancio.
- **Scritture di assestamento** di fine anno (ratei, risconti, fatture da emettere/ricevere, ammortamenti, TFR).

---

## 6. SCHEMI DI RICLASSIFICAZIONE PRONTI

### 6.1 Stato Patrimoniale – criterio finanziario
```
ATTIVO                              | PASSIVO E NETTO
Liquidità immediate                 | Passività correnti (entro 12 mesi)
Liquidità differite (crediti br.)   | Passività consolidate (oltre 12 mesi)
Rimanenze (disponibilità)           | Patrimonio netto
Immobilizzazioni (immateriali,      |
materiali, finanziarie)             |
```
Margini chiave: **Margine di struttura** = PN − Immobilizzazioni; **CCN** = Attivo corrente − Passivo corrente; **Margine di tesoreria** = (Liquidità imm. + differite) − Passivo corrente.

### 6.2 Conto Economico – a valore aggiunto
```
Ricavi delle vendite
− Costi esterni (materie, servizi, godimento beni terzi)
= VALORE AGGIUNTO
− Costo del personale
= MARGINE OPERATIVO LORDO (EBITDA)
− Ammortamenti e accantonamenti
= REDDITO OPERATIVO (EBIT)
± Gestione finanziaria
± Gestione straordinaria
− Imposte
= RISULTATO NETTO
```

### 6.3 Check rapido "Codice della Crisi" (segnali precoci)
- **Patrimonio netto** positivo? PN negativo → causa di scioglimento (art. 2484 c.c.).
- **DSCR a 6 mesi** ≥ 1? (flussi attesi / impegni finanziari).
- **Indici settoriali CNDCEC**: oneri finanziari/ricavi, debiti tributari/previdenziali scaduti, sostenibilità debiti.
- **Adeguati assetti** (art. 2086 c.c.): l'azienda ha strumenti per rilevare tempestivamente la crisi?

---

## 7. Avvertenze finali
- I prompt producono **bozze di lavoro**, non pareri: rileggi e riconcilia ogni numero.
- Nessuna decisione automatizzata: il giudizio professionale è del commercialista.
- Conserva traccia dei prompt usati e degli output (utile per policy interna e trasparenza verso il cliente).
- Aggiorna benchmark e coefficienti con le fonti ufficiali dell'anno.
