# Piano Workflow Assicurativi — MikeRust

## Obiettivo

Aggiungere 3 workflow built-in di tipo `tabular` per il dominio `insurance`,
pensati per confrontare polizze di responsabilità civile tra diversi assicuratori.

---

## Workflow da creare

| ID | Titolo | Practice | Tipo | Colonne totali |
|---|---|---|---|---|
| `builtin-insurance-rcp` | RC Professionale Review | Others — Insurance | `tabular` | 20 |
| `builtin-insurance-rcd` | RC Prodotti Review | Others — Insurance | `tabular` | 20 |
| `builtin-insurance-dno` | D&O Review | Others — Insurance | `tabular` | 20 |

---

## Blocco A — Colonne comuni (12 colonne)

Presenti in tutti e tre i workflow, nello stesso ordine (index 0–11).

| Index | Nome | Format | Note |
|---|---|---|---|
| 0 | Assicuratore | `text` | Nome completo della compagnia, paese di sede |
| 1 | Contraente / Assicurato | `text` | Chi stipula e chi è coperto; distinguere se diversi |
| 2 | Data decorrenza | `date` | Inizio copertura |
| 3 | Data scadenza | `date` | Fine copertura |
| 4 | Premio annuo | `monetary_amount` | Premio lordo; indicare se rateizzato e con quale frequenza |
| 5 | Massimale per sinistro | `monetary_amount` | Limite di indennizzo per singolo evento/sinistro |
| 6 | Massimale aggregato annuo | `monetary_amount` | Tetto totale per anno di polizza |
| 7 | Franchigia / SIR | `monetary_amount` | Importo a carico dell'assicurato per sinistro |
| 8 | Tipo franchigia | `tag` (assoluta / relativa / SIR) | Come si applica la franchigia |
| 9 | Territorialità | `text` | Ambito geografico della copertura; esclusioni geografiche rilevanti |
| 10 | Legge applicabile | `text` | Governing law della polizza |
| 11 | Foro competente / ADR | `text` | Tribunale competente o meccanismo arbitrale |

---

## Blocco B1 — Colonne specifiche RC Professionale (8 colonne, index 12–19)

| Index | Nome | Format | Note |
|---|---|---|---|
| 12 | Attività assicurata | `text` | Professioni e attività coperte; esclusioni di attività |
| 13 | Trigger di copertura | `tag` (claims-made / loss-occurrence / mixed) | Come scatta la copertura |
| 14 | Retroattività | `text` | Data retroattiva o "full prior acts"; "no retroactivity" se assente |
| 15 | Ultrattività / run-off | `text` | Durata e condizioni della copertura post-scadenza |
| 16 | Estensione a collaboratori | `yes_no` | Dipendenti, praticanti, collaboratori inclusi nella copertura |
| 17 | Copertura spese legali | `text` | Within limits vs outside limits; advance of defence costs |
| 18 | Esclusioni principali | `bulleted_list` | Dolo, colpa grave, attività non dichiarate, sanzioni, ecc. |
| 19 | Obbligo di denuncia | `text` | Termini e modalità di notifica del sinistro all'assicuratore |

---

## Blocco B2 — Colonne specifiche RC Prodotti (8 colonne, index 12–19)

| Index | Nome | Format | Note |
|---|---|---|---|
| 12 | Prodotti assicurati | `text` | Categorie merceologiche coperte; esclusioni di prodotto |
| 13 | Copertura ritiro prodotti | `yes_no` | Product recall incluso o escluso |
| 14 | Massimale recall | `monetary_amount` | Limite specifico per costi di ritiro; "Not addressed" se assente |
| 15 | Danni a prodotti incorporati | `yes_no` | Cover su prodotti finiti che incorporano il prodotto assicurato |
| 16 | Esclusione difetti di progettazione | `yes_no` | Design defect escluso dalla copertura? |
| 17 | Copertura USA / Canada | `yes_no` | Territorio nordamericano incluso o espressamente escluso |
| 18 | Copertura completed operations | `yes_no` | Danni manifestatisi dopo la consegna/installazione coperti |
| 19 | Esclusioni principali | `bulleted_list` | Dolo, ritiri già avviati, prodotti difettosi noti, ecc. |

---

## Blocco B3 — Colonne specifiche D&O (8 colonne, index 12–19)

| Index | Nome | Format | Note |
|---|---|---|---|
| 12 | Side A | `yes_no` | Copertura personale degli amministratori non indennizzati dalla società |
| 13 | Side B | `yes_no` | Rimborso alla società per indennizzo corrisposto agli amministratori |
| 14 | Side C / Entity coverage | `yes_no` | Copertura diretta della società per securities claims |
| 15 | Run-off / copertura post-mandato | `text` | Durata del run-off; condizioni di attivazione |
| 16 | Esclusione condotte fraudolente | `text` | Formulazione; presenza della "final adjudication" clause |
| 17 | Esclusione profitto illecito | `text` | Formulazione; presenza della "final adjudication" clause |
| 18 | Spese di difesa | `text` | Advance of defence costs; within limits vs outside limits; obbligo di rimborso se escluso |
| 19 | Esclusioni principali | `bulleted_list` | Insider trading, inquinamento, sanzioni, condotte dolose, ecc. |

---

## Struttura `prompt_md` (postura per ogni workflow)

Ogni workflow avrà un `prompt_md` breve con questo schema:

```
## Obiettivo
Stai analizzando una polizza [tipo] per confrontarla con altre polizze
dello stesso tipo. Per ogni colonna estrai l'informazione richiesta
dalla polizza allegata.

## Stile
- Risposte concise; cita il numero di articolo o clausola tra parentesi.
- Se la polizza non tratta una colonna, rispondi "Non previsto" — non inventare.
- Per importi, indica sempre la valuta.
- Per date, usa il formato ISO (YYYY-MM-DD).
```

---

## Prossimi passi

- [ ] **Step 1** — Revisionare questo piano: aggiungere/rimuovere colonne, cambiare nomi o formati
- [ ] **Step 2** — Scrivere il prompt di ogni colonna (seguendo lo stile dei built-in legali: preciso, con istruzione sul formato atteso e su cosa scrivere se l'informazione è assente)
- [ ] **Step 3** — Scrivere il `prompt_md` definitivo per ciascun workflow
- [ ] **Step 4** — Generare il TypeScript completo da incollare in `builtinWorkflows.ts`
- [ ] **Step 5** — Test su 2–3 polizze reali; iterare sui prompt delle colonne
- [ ] **Step 6** *(opzionale)* — Aggiungere Cyber e RC Generale come fase 2

---

## Note implementative

- Il campo `domain` sarà `"insurance"` per tutti e tre (il dominio è già presente nell'enum di MikeRust).
- Il campo `practice` sarà `"Others — Insurance"` in attesa di aggiungere practice specifiche in `practices.ts`.
- Gli ID seguono la convenzione `builtin-` dei workflow esistenti.
- Il `prompt_md` di postura è breve perché il lavoro pesante è nei prompt delle singole colonne — coerente con lo stile dei built-in legali tabular (es. `builtin-nda`, `builtin-spa`).
