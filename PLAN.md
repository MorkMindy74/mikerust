# MikeRust — Piano di sviluppo

> **Ultimo aggiornamento:** maggio 2026 — documento consolidato (l'ex `PLAN.md`
> e `PLAN_MISSING.md` sono stati fusi qui).
>
> **Scopo.** MikeRust è una riscrittura clean-room del progetto
> [willchen96/mike](https://github.com/willchen96/mike) orientata all'uso
> **locale e sovrano**: nessun cloud, nessun servizio esterno obbligatorio, un
> singolo eseguibile desktop. Questo documento descrive cosa è MikeRust, come è
> costruito, come si avvia, e tiene la **specifica funzionale** area per area con
> il relativo stato di avanzamento.
>
> **Come leggere le sezioni funzionali (9 in poi).** Ogni sezione descrive il
> *comportamento* atteso — cosa vede l'utente, cosa succede a ogni interazione,
> quali endpoint del backend vengono chiamati e con quale semantica. È una
> specifica: chi implementa riproduce il comportamento scrivendo codice nuovo.
> Il blocco **Stato attuale** di ciascuna sezione è la fotografia di *analisi
> iniziale dei gap*; lo **stato reale e aggiornato** è nella tabella di sintesi
> della sezione 9. I percorsi degli endpoint HTTP e i nomi degli eventi SSE sono
> contratto di rete del backend Rust e vanno citati testualmente.

---

## 1. Cosa è MikeRust

Assistente AI per documenti, desktop-first, completamente locale. Un singolo
eseguibile Tauri racchiude: backend axum, database SQLite, frontend Svelte. Le
chiamate LLM vanno a provider configurati dall'utente (Claude, Gemini, OpenAI,
Mistral, o un endpoint OpenAI-compatibile locale tipo Ollama/vLLM); tutto il
resto — auth, storage, RAG, indici, corpora — vive sulla macchina dell'utente.

Casi d'uso principali: assistente con citazioni verificabili, revisione tabellare
di documenti (estrazione strutturata), generazione di documenti `.docx` da
template, gestione di progetti con basi di conoscenza isolate.

---

## 2. Architettura

```text
mike-tauri.exe  (unico eseguibile)
├── Tauri webview       ← mostra il frontend Svelte (build statica in frontend/dist/)
└── tokio thread        ← axum su 127.0.0.1:<porta dinamica> (solo loopback)
        ├── SQLite   (mike.db — zero setup, migrazioni automatiche all'avvio)
        ├── Auth     (PIN Argon2id + Windows Hello / Touch ID, sessioni opaque-token)
        ├── Storage  (filesystem locale, percorso canonicalizzato)
        ├── RAG      (embeddings ONNX via ort, indici locali)
        ├── PDF/DOCX (pdfium-render per estrazione; docx writer per generazione)
        ├── LLM      (Claude / Gemini / OpenAI / Mistral / OpenAI-compat locale)
        └── MCP      (client JSON-RPC verso qualsiasi server HTTP/SSE MCP)
```

La porta del backend è **dinamica**: il backend fa il bind su `127.0.0.1:0`,
il sistema sceglie una porta libera, il guscio Tauri la riceve e la inietta nel
webview come `api_base_url`. In sviluppo standalone si può fissare via `PORT`.

---

## 3. Struttura del workspace

```text
MikeRust/
├── Cargo.toml          ← workspace (members: "." e "src-tauri"), edition 2024
├── src/                ← crate `mike` (libreria + bin standalone)
│   ├── lib.rs          ← run_server(port); espone l'app axum
│   ├── main.rs         ← bin standalone (cargo run)
│   ├── auth/           ← PIN Argon2id, biometrica, middleware, sessioni, rate-limit
│   ├── db/             ← AppState, pool SQLite, runner migrazioni
│   ├── routes/         ← auth, user, chat, projects, documents, workflows,
│   │                     tabular_reviews, docx_templates, presets, models,
│   │                     corpora, eurlex, italian_legal, sync, health
│   ├── llm/            ← claude, gemini, local (OpenAI-compat), summarize, builtin_tools
│   ├── mcp/            ← client MCP JSON-RPC (HTTP/SSE)
│   ├── pdf/            ← estrazione PDF (pdfium-render) e DOCX (ZIP+XML)
│   ├── docx/           ← generazione .docx (package/document_xml/styles_xml)
│   ├── presets/        ← workflow, column, docx_template (caricati da config/)
│   ├── corpora/        ← EUR-Lex, Legale Italiano, adapter manifest plugin
│   ├── sync/           ← scanner cartelle locali → indice RAG
│   ├── embeddings/     ← modello ONNX, sessioni
│   ├── mikeprj/        ← export/import progetto cifrato (.mikeprj)
│   └── storage/        ← filesystem locale
├── src-tauri/          ← crate `mike-tauri` (guscio desktop; dipende da `mike`)
│   ├── tauri.conf.json ← finestra, bundle, risorse
│   └── src/lib.rs      ← avvia il thread axum + Tauri::Builder
├── frontend/           ← frontend Svelte 5 + Vite 6 + Tailwind v4 (TS strict)
│   └── src/
│       ├── routes/     ← Boot, Unlock, Setup, Shell, Assistant, Workflows,
│       │                 Tabular, Projects, Templates, Settings, Playground
│       ├── lib/components/ ← auth, chat, documents, docx, projects, settings,
│       │                     tabular, workflow, layout, ui, domain
│       ├── lib/stores/  ← runes-based ($state): chat, projects, tabular, ecc.
│       ├── lib/api/     ← wrapper fetch tipati per gli endpoint del backend
│       └── lib/i18n/    ← bundle 6 lingue (it/en/fr/de/es/pt)
├── migrations/         ← 0001 … 0023 (SQL, applicate in ordine all'avvio)
├── config/             ← preset versionati: workflow-presets/, column-presets/,
│                          docx-templates/, corpora-plugins/, model.json
└── libs/pdfium/        ← pdfium.dll / .so / .dylib
```

---

## 4. Avvio e build

### Sviluppo — Tauri (consigliato)

```bash
cargo tauri dev          # compila backend + guscio, avvia Vite, apre la finestra
```

### Sviluppo — backend e frontend separati

```bash
cargo run                # backend axum standalone (usa PORT se impostata)
cd frontend && pnpm dev   # Vite su :5173 — il package manager è pnpm, non npm
```

### Build desktop

```bash
cd frontend && pnpm build   # svelte-check + vite build → frontend/dist/
cargo tauri build           # compila mike-tauri.exe + installer
```

### Verifiche

```bash
cd frontend && pnpm typecheck   # svelte-check (deve dare 0 errori)
cd frontend && pnpm test        # vitest (unit test del frontend)
cargo test --workspace          # test Rust (unit + doc + integration)
```

---

## 5. Variabili d'ambiente

### Backend

| Variabile | Richiesta | Default | Note |
|---|---|---|---|
| `DATABASE_URL` | No | `sqlite://mike.db` | |
| `STORAGE_PATH` | No | `./data/storage` | canonicalizzato all'avvio |
| `PORT` | No | `0` (dinamica) | fissare solo per dev standalone |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / ecc. | Per LLM | — | normalmente le chiavi si salvano via `/user/llm-settings` |
| `VLLM_BASE_URL` | Per LLM locale | — | endpoint OpenAI-compatibile |
| `MRUST_FORCE_MCP_TOOLS` | No | — | forza l'abilitazione dei tool MCP anche su modelli locali |

### Frontend

In modalità Tauri l'URL del backend è iniettato dal guscio (`api_base_url`). In
dev standalone il frontend punta al backend via la porta nota.

---

## 6. Convenzioni di progetto (da rispettare sempre)

- Ogni stringa visibile all'utente passa dal sistema i18n (6 lingue: it/en/fr/de/es/pt). Mai testo hard-coded.
- Gli identificatori di schema (valori enum, chiavi JSON, parametri di rotta) restano in inglese snake_case; si localizzano solo le etichette visibili.
- Le preferenze utente si salvano lato server tramite gli endpoint `/user/*`, non in `localStorage`.
- Il disclaimer "l'AI può sbagliare / non è consulenza legale" è obbligatorio sotto il compositore della chat.
- I commit vanno su `main` direttamente e non includono trailer `Co-Authored-By`.

---

## 7. Stato dei test

| Suite | Stato |
|---|---|
| `cargo test --workspace` | 358 passed, 0 failed, 14 ignored (3 perf + 11 ONNX che richiedono modelli) |
| Doctests Rust | verdi |
| `svelte-check` | 0 errori, 0 warning (~3500 file) |
| `vite build` | verde |
| `vitest` (frontend) | unit test presenti per le utility pure (`highlight`, `citations`, ecc.) |

---

## 8. Differenze rispetto a Mike originale

| Aspetto | Mike (originale) | MikeRust |
|---|---|---|
| Backend | Express + TypeScript | **Rust axum** |
| Auth | Supabase Auth | **PIN Argon2id + Windows Hello / Touch ID** |
| Database | Supabase Postgres | **SQLite (zero setup)** |
| Storage | Cloudflare R2 | **Filesystem locale** |
| Frontend | Next.js | **Svelte 5 + Vite** |
| Deploy | Web (OpenNext) | **Desktop Tauri (exe singolo)** |
| LLM | Claude + Gemini | Claude + Gemini + **OpenAI + Mistral + locale** |
| MCP | No | **Sì** |
| Dipendenze cloud | Supabase, R2, OpenNext | **Nessuna** |

---

## 9. Stato funzionalità (sintesi aggiornata)

Stato reale a maggio 2026. Build, typecheck e suite di test sono verdi; dove
indicato "Implementato" i componenti esistono e compilano, ma una QA funzionale
completa non è stata rieseguita in questa revisione.

| Area | Stato | Note |
|---|---|---|
| 1. Assistente — citazioni interattive | ✅ Implementato | pillole, tooltip, click → visualizzatore |
| 2. Assistente — eventi tool/documento | ✅ Implementato | coperti tutti gli eventi SSE emessi dal backend (`citations`, `content_delta`, `tool_call_*`, `doc_created`, `error`); gli eventi `reasoning_*`/`doc_read`/`doc_find`/`doc_edited`/`doc_replicate`/`workflow_applied` restano specifica futura, non ancora emessi dal backend |
| 3. Assistente — modello, titolo auto, modifiche tracciate | 🟡 Parziale | selettore modello e generazione titolo presenti; card di modifica tracciata (accetta/rifiuta) ancora da completare |
| 4. Visualizzatore documenti multi-formato | ✅ Implementato | PDF / DOCX / XLSX / testo, pannello a schede |
| 5. Workflow — editor, modifica, eliminazione | ✅ Implementato | editor a pagina intera |
| 6. Tabular review — griglia, esecuzione, celle, chat | ✅ Implementato | `TabularDetail` |
| 7. Progetti — dettaglio, documenti, cartelle, versioni | ✅ Implementato | `ProjectDetail` |
| 8. Template DOCX — dettaglio, generazione, **editor** | ✅ Implementato | dettaglio/describe/render/applica-a-chat + editor a pagina intera (tutti i campi) con persistenza su `config/docx-templates/user/` |
| 9. Documenti — caricamento, stato indicizzazione | ✅ Implementato | |
| 10. Impostazioni — Fonti dati (sync, EUR-Lex, corpora) | ✅ Implementato | `SyncSection`/`EurlexSection`/`CorpusSection` |
| 11. Banner stato embedding | ✅ Implementato | `EmbeddingBanner` |
| 12. Approvazione tool MCP in chat | 🟠 Area aperta | dialogo asincrono ancora non del tutto risolto |
| 13. Regressione i18n nelle Impostazioni | ✅ Risolto | stringhe estratte in chiavi i18n |

> Le sezioni che seguono mantengono la specifica funzionale dettagliata. Il
> blocco **Stato attuale** di ciascuna riflette l'analisi iniziale dei gap;
> la tabella qui sopra è la fonte di verità sullo stato corrente.

---

## 1. Assistente — Citazioni interattive

### Stato attuale
Il flusso SSE della chat riceve già un evento di tipo `citations`, ma il client
non registra alcun gestore per esso: l'evento viene scartato silenziosamente.
I messaggi dell'assistente vengono resi come Markdown senza alcun trattamento
dei marcatori di citazione. Risultato: il blocco grezzo delle citazioni può
comparire come testo nella risposta.

### Comportamento atteso

**Marcatori nel testo.** Il modello inserisce nel testo della risposta dei
marcatori di citazione tra parentesi quadre:
- `[1]`, `[2]`, … → citazione di un documento allegato alla conversazione;
- `[g1]`, `[g2]`, … → frammento proveniente dalla base di conoscenza globale;
- `[p1]`, `[p2]`, … → frammento proveniente dalla base di conoscenza di progetto;
- gruppi separati da virgola sono ammessi: `[1, 2]`, `[g1, p3]`.

Vanno **ignorati** i numeri che non sono citazioni (es. importi, anni a 4 cifre):
riconoscere come citazione solo i token che corrispondono esattamente al pattern
sopra e che hanno una citazione risolvibile nell'elenco ricevuto.

**Blocco macchina.** Alla fine della risposta il modello accoda un blocco
delimitato `<CITATIONS> … </CITATIONS>` (contenuto strutturato leggibile dalla
macchina). Questo blocco **non deve mai essere mostrato**: va rimosso dal testo
prima di renderizzarlo come Markdown. La rimozione deve funzionare anche se la
risposta arriva troncata durante lo streaming (il blocco può essere parziale).

**Evento `citations`.** L'elenco delle citazioni arriva come evento SSE finale.
Ogni voce contiene almeno: un riferimento (l'indice del marcatore, es. `1`,
`g2`), l'identificatore del documento o del frammento, l'etichetta della fonte,
un'eventuale pagina (numero singolo oppure intervallo testuale come `"41-42"`
per citazioni a cavallo di un'interruzione di pagina), e il testo citato.
Il gestore deve memorizzare questo elenco sull'ultimo messaggio dell'assistente.

**Resa visiva.** Ogni marcatore risolvibile diventa un piccolo "pillola"
numerata in apice, cliccabile, con colore diverso secondo l'origine:
- grigio → citazione di documento allegato;
- verde → base di conoscenza globale;
- blu → base di conoscenza di progetto.

Al passaggio del mouse mostra un tooltip con pagina/fonte e il testo citato.

**Click.** Cliccando una pillola si apre il visualizzatore di documenti
(sezione 4) sul documento citato, con il passaggio citato evidenziato e portato
in vista. Se la citazione indica un intervallo di pagine, il testo citato può
contenere un separatore di interruzione di pagina: va diviso in due porzioni
evidenziate, una per pagina.

### Da fare
1. Aggiungere un tipo `Citazione` ai tipi della chat e un campo elenco-citazioni opzionale sul tipo del messaggio.
2. Registrare il gestore dell'evento SSE `citations` nel flusso di invio della chat e salvarlo sull'ultimo messaggio assistente.
3. Funzione di pulizia che rimuove `<CITATIONS>…` (anche parziale) prima del rendering Markdown.
4. Componente "pillola di citazione" con i tre colori, tooltip, e callback di click.
5. Sostituzione dei marcatori nel testo renderizzato con le pillole interattive.

---

## 2. Assistente — Eventi di tool, lettura e creazione documenti

### Stato attuale
Il flusso SSE definisce i callback per `tool_call_start` e `doc_created` ma il
client non li collega: vengono scartati. Nessun indicatore di avanzamento, né
card per i documenti generati.

### Comportamento atteso

Il messaggio dell'assistente non è solo testo: è una **sequenza ordinata di
eventi tipati** che arriva dallo stream SSE. Oltre al testo (`content_delta` /
`content_done`) vanno gestiti:

- **`reasoning_delta` / `reasoning_block_end`** — il "ragionamento" del modello.
  Va reso come blocco comprimibile "processo di pensiero": durante lo streaming
  mostra un indicatore animato con etichetta che ruota ("Sto pensando…",
  "Sto ragionando…", …); a fine blocco resta compresso, espandibile su richiesta.
- **`tool_call_start`** — è iniziata l'invocazione di uno strumento. Mostra una
  riga "Eseguo {strumento}…" con spinner.
- **`tool_call_progress`** — tick periodico (~ogni 5 s) che aggiorna il contatore
  dei secondi trascorsi sulla riga dello strumento in corso. Dopo ~10 s mostra
  un suggerimento "sta impiegando più del previsto" (utile quando uno strumento
  esterno è in attesa di un'approvazione manuale).
- **`doc_read_start` / `doc_read`** — l'assistente sta leggendo un documento:
  "Leggo {file}…" poi "Letto {file}" (con pallino verde). Il nome file di
  "Letto" è cliccabile e apre il documento nel pannello laterale se per esso
  esiste una citazione.
- **`doc_find_start` / `doc_find`** — ricerca testuale dentro un documento:
  "Cerco '{query}'…" poi "Trovato '{query}' (N occorrenze) in {file}".
- **`doc_created_start` / `doc_created` / `doc_download`** — l'assistente ha
  generato un documento; termina con una card scaricabile/apribile.
- **`doc_edited_start` / `doc_edited`** — l'assistente ha modificato un DOCX
  producendo modifiche tracciate; termina con card di modifica + card di download.
- **`doc_replicate_start` / `doc_replicated`** — un documento è stato clonato N volte.
- **`workflow_applied`** — è stato applicato un workflow; "Applicato workflow
  {titolo}", cliccabile per aprire il workflow.
- **`error`** — mostra un blocco di errore rosso nel messaggio.

**Raggruppamento.** Gli eventi non-testuali consecutivi vanno raggruppati in un
unico contenitore "passaggi" comprimibile, che si minimizza quando segue del
testo. Tra un evento reale e l'altro va mostrato un segnaposto transitorio
("Sto pensando…") affinché l'indicatore di attività non sembri mai bloccato.
Sopra ogni messaggio dell'assistente sta un'icona di stato (in corso / inattivo
/ completato / errore).

**Card documento.** I documenti generati o modificati si rendono come card di
download: nome file, etichetta tipo file, eventuale badge di versione, pulsante
di download. Se il documento è persistito come documento di prima classe,
cliccando la card si apre nel pannello laterale. Il download deve avvenire con
il token di autorizzazione e accettare **solo** URL relativi al backend (gli URL
esterni vanno rifiutati per non esporre il token).

**Annullamento.** Interrompere lo stream a metà aggiunge una nota "annullato
dall'utente". Ogni messaggio assistente ha un pulsante "copia" che copia sia
HTML ricco sia testo semplice negli appunti.

### Da fare
1. Estendere il tipo del messaggio assistente a una lista ordinata di "blocchi" tipati.
2. Collegare tutti i callback SSE elencati nello stato del flusso chat.
3. Componenti: blocco-ragionamento comprimibile, riga-evento (tool / lettura / ricerca), card-documento, contenitore "passaggi" comprimibile, icona di stato.
4. Logica di raggruppamento e di segnaposto transitorio.

---

## 3. Assistente — Selettore modello, titolo automatico, modifiche tracciate

### Stato attuale
- Il payload di invio chat accetta un campo `model` opzionale, ma il client non
  lo valorizza mai: nessun selettore di modello per-conversazione.
- Esiste la chiamata di rinomina chat ma non viene mai invocata: nessuna
  generazione automatica del titolo.
- Nessuna gestione delle modifiche tracciate (accetta/rifiuta).

### Comportamento atteso

**Selettore di modello nel compositore.** Un menu a tendina che raggruppa i
modelli per provider. Devono comparire **solo** i modelli dei provider che
l'utente ha configurato (chiave API salvata, oppure URL base impostato per il
provider locale). I modelli senza chiave utilizzabile mostrano un'icona di
allerta rossa e non sono selezionabili per l'invio. Se l'utente prova a inviare
con un modello non disponibile, si apre una finestra "chiave API mancante".
Il modello scelto si **persiste come preferenza utente** lato server. Il modello
scelto viene incluso nel payload di invio della chat.

**Titolo automatico.** Dopo che il **primo** messaggio di una chat nuova è
completato, il client chiama `POST /chat/{id}/generate-title` passando una
sintesi del messaggio (incluso il nome di eventuali workflow/template/file
allegati) e rinomina la chat con il titolo restituito. Le chat restano
rinominabili manualmente (`PATCH /chat/{id}`) ed eliminabili (`DELETE /chat/{id}`).

**Modifiche tracciate (accetta/rifiuta).** Quando l'assistente modifica un DOCX,
ogni modifica diventa una **card di modifica** sotto la risposta. Una sola
modifica → una card singola; più modifiche → una sezione che le raggruppa con
una sintesi ("N modifiche tracciate su M documenti"), pulsanti **Accetta tutte**
/ **Rifiuta tutte** (sequenziali, con contatore di avanzamento) e un elenco
comprimibile di card per-modifica. Ogni card ha un pulsante **Vedi** (apre la
modifica nel pannello laterale) e i pulsanti Accetta/Rifiuta.

Accetta/Rifiuta chiama `POST /single-documents/{docId}/edits/{editId}/accept`
oppure `.../reject`. La UI applica subito la modifica al documento renderizzato
(mostra/nasconde la modifica) per feedback immediato, e fa rollback se la
chiamata fallisce. La risoluzione produce una nuova versione del documento:
l'URL della card di download e il badge di versione si aggiornano. Risolvere una
modifica da una qualsiasi superficie (card, barra di bulk, pulsanti nel pannello
laterale) deve sincronizzare lo stato su tutte le superfici.

### Da fare
1. Selettore modello nel compositore, alimentato dal catalogo modelli e dai provider configurati; persistenza preferenza.
2. Logica di generazione titolo dopo il primo messaggio.
3. Componenti card-modifica singola e sezione modifiche multiple con bulk accetta/rifiuta.
4. Aggiornamento ottimistico del documento renderizzato e sincronizzazione cross-superficie.

---

## 4. Visualizzatore documenti multi-formato (pannello laterale)

### Stato attuale
Assente del tutto. La cartella dei componenti documento è vuota. È una delle
funzionalità più grandi mancanti.

### Comportamento atteso

> **Nota di licenza.** Questa funzionalità è una personalizzazione propria di
> MikeRust. Va realizzata con sole librerie JS di rendering (es. `pdf.js`),
> **senza plugin** di sistema.

**Struttura.** Un pannello ridimensionabile che scorre dal lato destro
(maniglia di trascinamento per il ridimensionamento; "x" per chiudere la singola
scheda e un comando "chiudi tutto"). Ospita **schede in stile browser**, una per
documento aperto; ogni scheda conserva la propria posizione di scorrimento e lo
stato del visualizzatore. Le schede si aprono cliccando: una pillola di
citazione, il "Vedi" di una card di modifica, una card di download, o un evento
"Letto {file}".

**Intestazione della scheda** (varia secondo l'origine dell'apertura):
- *Modalità citazione*: una card "Citazione" col testo citato e l'etichetta di
  pagina, più un pulsante Scarica.
- *Modalità modifica tracciata*: una card "Modifica tracciata" col diff (testo
  inserito in verde, testo eliminato barrato in rosso), eventuale riga di
  motivazione, pulsanti Accetta/Rifiuta, e Scarica.
- *Modalità documento semplice*: solo nome file, badge di versione, Scarica.

**Corpo — selezione del renderer per tipo file:**

- **PDF.** Reso pagina per pagina su canvas, con un **layer di testo
  selezionabile** sovrapposto. In basso a sinistra un contatore pagina
  (`corrente/totale`); in basso a destra controlli di zoom (pulsanti + valore
  percentuale). Devono funzionare lo zoom con pinch del trackpad e con
  ctrl+rotella. La frase citata va cercata nel layer di testo ed evidenziata;
  se non si trova nella pagina suggerita, vanno scandite tutte le pagine. La
  prima evidenziazione va portata al centro verticale della vista.

- **DOCX / DOC.** Reso in-browser. Le modifiche tracciate (inserimenti /
  eliminazioni) si mostrano con stile colorato (barrato / sottolineato). Le
  pagine si scalano automaticamente alla larghezza del pannello. La frase citata
  va cercata nel testo ed evidenziata; un'eventuale modifica tracciata target va
  portata in vista e fatta lampeggiare brevemente. Per errori non bloccanti va
  mostrato un banner di avviso chiudibile in alto a sinistra.

- **Markdown / TXT / RTF.** Resi come testo formattato leggibile, con testo
  selezionabile; la frase citata evidenziata e portata in vista.

- **XLSX / fogli di calcolo.** Resi come tabella/griglia navigabile, testo
  selezionabile.

**Recupero dei byte.** Per i documenti di prima classe si richiede una
rappresentazione visualizzabile tramite `GET /single-documents/{id}/display`
(restituisce byte PDF se esiste una resa PDF, altrimenti byte DOCX → renderer
DOCX). Per le citazioni della base di conoscenza il recupero avviene tramite
`GET /sync/kb-doc?path=…`.

**Selezione e copia.** In tutti i formati il testo reso deve essere
selezionabile e copiabile, così l'utente può incollarlo nella chat
dell'assistente.

**Comportamento di apertura sincrociata.** Aprire lo stesso documento da una
sorgente diversa (citazione, card, evento "Letto") deve riusare la scheda
esistente se già aperta, aggiornandone soltanto l'evidenziazione/posizione.

### Da fare
1. Pannello laterale ridimensionabile con gestore di schede multiple e stato per-scheda.
2. Renderer PDF basato su `pdf.js` con layer di testo, zoom, contatore pagina, evidenziazione e ricerca testo.
3. Renderer DOCX in-browser con resa modifiche tracciate ed evidenziazione.
4. Renderer per Markdown/TXT/RTF e per fogli di calcolo (XLSX).
5. Card di intestazione per le tre modalità (citazione / modifica / documento semplice).
6. Logica di evidenziazione del passaggio citato, incluso il caso intervallo-pagine.
7. Download autenticato con accettazione dei soli URL relativi al backend.

---

## 5. Workflow — Modifica, eliminazione, editor a pagina intera

### Stato attuale
Funzionano: lista (DB + preset), filtri a schede (Tutti / Integrati / Personali
/ Nascosti), filtro per dominio, nascondi/mostra preset, modale di **creazione**
(tipo assistente con editor di prompt Markdown, tipo tabellare con editor di
colonne). Mancano: **modifica**, **eliminazione** dall'interfaccia, l'editor a
pagina intera, la vista di dettaglio, la condivisione.

### Comportamento atteso

**Editor a pagina intera** (`/workflows/{id}` concettualmente). Intestazione con
percorso a briciole e titolo rinominabile in linea. Un indicatore di stato di
salvataggio ("Salvataggio…" / "Salvato"). I workflow integrati / non
modificabili mostrano un badge "Sola lettura".

- **Workflow di tipo assistente.** Un editor di testo ricco WYSIWYG che produce
  Markdown — barra con H1/H2/H3, grassetto, corsivo, elenchi puntati e numerati.
  Le modifiche si **salvano automaticamente** con debounce ~800 ms
  (`PATCH /workflow/{id}` aggiornando il prompt).
- **Workflow di tipo tabellare.** Una tabella di colonne. Ogni riga è una colonna
  con Titolo, Formato (testo libero, elenco puntato, numero, percentuale,
  importo monetario, valuta, sì/no, data, tag — ognuno con un'icona), e Prompt
  di estrazione. Un pulsante "Aggiungi colonna" apre la modale di colonna;
  cliccando una riga si modifica la colonna; checkbox + menu azioni per
  l'eliminazione multipla; "x" per eliminare una singola colonna. Le modifiche
  alle colonne si salvano subito. I workflow tabellari integrati sono in sola
  lettura (cliccando una riga si apre la modale di colonna in sola lettura).

**Eliminazione.** I workflow personali si possono eliminare
(`DELETE /workflow/{id}`); l'eliminazione multipla elimina i personali e
nasconde gli integrati. Va esposto un comando di eliminazione sulle righe della
lista (oggi manca, esiste solo nascondi/mostra).

**Vista di dettaglio.** Cliccando una riga della lista si apre una modale di
visualizzazione del workflow (solo lettura per gli integrati).

**Condivisione** (solo workflow personali). Una modale che consente al
proprietario di aggiungere email destinatarie (con flag "consenti modifica") e
di elencare/revocare le condivisioni esistenti
(`POST /workflows/{id}/share`, `GET /workflows/{id}/shares`,
`DELETE /workflows/{id}/shares/{shareId}`). I workflow condivisi compaiono nelle
liste dei destinatari; quelli con "consenti modifica" sono modificabili, gli
altri in sola lettura. La colonna "Origine" della lista mostra il nome di chi
ha condiviso.

### Da fare
1. Rotta/editor a pagina intera con titolo rinominabile e indicatore di salvataggio.
2. Editor WYSIWYG → Markdown con autosalvataggio debounced per i workflow assistente.
3. Editor colonne con salvataggio immediato per i workflow tabellari.
4. Comando di eliminazione (singola e multipla) sulla lista.
5. Modale di dettaglio in sola lettura.
6. Modale di condivisione e gestione delle condivisioni.

---

## 6. Tabular review — Griglia, esecuzione, celle, chat di review

### Stato attuale
Funzionano solo: lista, modale di creazione (titolo, dominio scelto per primo,
selezione di un workflow tabellare di quel dominio da cui eredita le colonne),
eliminazione con conferma. **Manca tutto il cuore della funzionalità**: nessuna
griglia, nessuna esecuzione, nessuna gestione celle, nessuna vista di dettaglio.

### Comportamento atteso

**Vista di dettaglio della review.** Intestazione con briciole + titolo
rinominabile, una casella di ricerca (filtra le righe-documento), un pulsante di
condivisione (review standalone), un pulsante **Esporta** (scarica la griglia
come file Excel) e un pulsante **Esegui**. Una barra strumenti con: un
interruttore "Assistente nella review" (apre il pannello di chat della review),
un menu Azioni (quando ci sono righe selezionate: Cancella risultati, Elimina
documenti), Aggiungi documenti, Aggiungi colonne.

**La griglia.** Le righe sono documenti, le colonne sono le domande di
estrazione; la prima colonna è il nome file del documento. Sia la colonna
checkbox sia la colonna documento restano "appiccicate" durante lo scorrimento
orizzontale. Le intestazioni di colonna hanno un menu di modifica in linea.
Una cella di intestazione "+" e un pulsante "+" nella barra aggiungono colonne.

**Le celle.** Ogni cella mostra la risposta dell'IA per quella coppia
(documento, colonna):
- `pending` → vuota; `generating` → uno scheletro animato (shimmer);
  `error` → un'icona di allerta rossa.
- `done` → la prima riga della risposta, troncata. Un piccolo pallino-bandiera
  colorato nell'angolo (verde / grigio / giallo / rosso) segnala una valutazione
  della cella. Cliccando la cella si apre una sovrapposizione in linea con la
  risposta completa; la sovrapposizione ha un'azione "Vedi dettagli".
- Le risposte sono Markdown con due elementi inline speciali: **pillole di
  citazione** (apici numerati; cliccandole la griglia scorre alla cella citata e
  la evidenzia) e **pillole-tag** (chip colorati).

**Esecuzione della review.** "Esegui" apre uno stream `POST /tabular-review/{id}/generate`.
Le celle vengono poste in modo ottimistico a `generating` (saltando quelle già
`done`), poi un evento SSE `cell_update` per cella ne aggiorna contenuto e stato
in tempo reale. Richiede ≥ 1 colonna e ≥ 1 documento, e un modello disponibile
(il "modello per review" salvato dall'utente); altrimenti si apre la finestra
"chiave API mancante".

**Pannello di dettaglio cella.** Aprendo una cella (o cliccando una citazione in
una cella) scorre in vista un pannello. Ha una colonna informativa col nome
colonna, nome documento, il badge-bandiera, i **Risultati** formattati e il
**Ragionamento**, con navigazione precedente/successivo tra colonne e un
pulsante **Rigenera** (`POST /tabular-review/{id}/regenerate-cell`). Quando si
clicca una citazione, sul lato sinistro appare anche il visualizzatore di
documenti (sezione 4) con la frase evidenziata.

**Gestione documenti e colonne.** Aggiungi documenti (`PATCH` con i nuovi
identificatori documento); colonne aggiunte/modificate/eliminate dalla modale di
colonna con salvataggio immediato (`PATCH` con la configurazione colonne);
"Cancella risultati" (`POST .../clear-cells`) riporta le celle delle righe
selezionate a `pending`.

**Modale "Aggiungi colonna".** Permette di aggiungere una o più colonne insieme.
Ogni bozza ha: un campo nome (digitando un nome viene auto-suggerita una
configurazione preset quando combacia per espressione regolare con un **preset
di colonna** noto), un menu a tendina di preset (filtrabile per dominio,
recuperato da `/column-presets`), un selettore di Formato, un editor di tag
(quando il formato è "tag" — chip aggiunti con Invio / virgola), e un prompt
multi-riga con un pulsante **Genera prompt automaticamente**
(`POST /tabular-review/prompt`, che restituisce un prompt da preset / LLM /
fallback). In modalità modifica agisce su una sola colonna e può eliminarla.

**Modale di creazione review.** Da estendere rispetto all'attuale: oltre a
titolo e workflow-template, deve avere un interruttore "crea sotto un progetto"
(poi un menu progetto) e un **selettore documenti** (un elenco a directory di
documenti standalone e progetti con le loro cartelle; in modalità progetto solo
i documenti pronti di quel progetto). Un pulsante di caricamento aggiunge nuovi
documenti in linea.

**Pannello chat della review.** Un pannello ridimensionabile a sinistra dentro
la review. L'utente pone domande libere sulla review; l'IA risponde con
contenuto in streaming, blocchi di ragionamento e passi "Letto {file}". Le
risposte portano **citazioni tabellari** — pillole numerate che, cliccate, fanno
scorrere la griglia alla cella riferita. Un'icona "orologio" elenca le chat di
review precedenti (ricercabili); un "+" avvia una nuova chat; un cestino elimina
quella corrente; il pannello ha un proprio selettore di modello. Streaming su
`POST /tabular-review/{id}/chat`; eventi SSE inclusi `chat_id`, `chat_title`,
`reasoning_delta`/`reasoning_block_end`, `content_delta`, `doc_read_start`/`doc_read`,
`citations`. Le chat persistono (`GET /tabular-review/{id}/chats`,
`.../chats/{chatId}/messages`, `DELETE …`).

### Da fare
1. Vista di dettaglio della review con intestazione, barra strumenti, ricerca.
2. Componente griglia con colonne/celle, colonne appiccicate, intestazioni modificabili.
3. Stati cella (pending/generating/error/done), pallino-bandiera, sovrapposizione in linea.
4. Esecuzione via stream `generate` con aggiornamento ottimistico e gestione `cell_update`.
5. Pannello di dettaglio cella con navigazione, rigenerazione, e aggancio al visualizzatore documenti.
6. Modale "Aggiungi colonna" con preset, auto-suggerimento, generazione prompt, editor tag.
7. Estensione della modale di creazione (progetto + selettore documenti + upload in linea).
8. Pannello chat della review con storico, modello, citazioni tabellari.
9. Esportazione griglia in Excel.

---

## 7. Progetti — Dettaglio, documenti, cartelle, versioni, export/import

### Stato attuale
Funzionano: lista con ricerca e filtro dominio, creazione/modifica/eliminazione
(nome, descrizione, dominio). **Manca**: vista di dettaglio (cliccare una riga
non fa nulla), gestione documenti, modalità di isolamento, export/import
`.mikeprj`, chat di progetto, review di progetto.

### Comportamento atteso

**Vista di dettaglio del progetto.** Intestazione: briciole + titolo
rinominabile (con eventuale numero pratica come suffisso), ricerca, un pulsante
membri/persone, un **interruttore di isolamento RAG** (solo proprietario —
commuta tra modalità "condivisa", in cui le chat del progetto vedono documenti
globali + di progetto, e modalità "rigorosa", in cui vedono solo i documenti di
progetto), un pulsante di **esportazione** (apre la modale di export), e i
pulsanti "+ Chat" / "+ Tabular review".

Tre schede (collegabili via parametro di query):

**Scheda Documenti.** Un albero a cartelle: sottocartelle e documenti annidati
liberamente. Ogni riga-documento mostra un'icona di tipo file (o uno spinner
mentre è `pending`/`processing`, o un'allerta rossa su `error`), il nome file
(rinominabile in linea), e una sezione espandibile per lo storico versioni.
Trascinamento e rilascio per spostare documenti nelle cartelle e riordinare
sottocartelle in altre cartelle (con protezione dai cicli). Menu contestuale
(tasto destro) e barra strumenti offrono: Aggiungi sottocartella, Aggiungi
documenti (caricamento o modale di sfoglia), rinomina/elimina cartella (a
cascata). Azioni multiple sui documenti selezionati: Scarica (file singolo o un
archivio zip via `POST /single-documents/download-zip`), Rimuovi dalla
sottocartella, Elimina (riservato al proprietario). Cliccando un documento si
apre nella modale/pannello di visualizzazione.

**Versioni dei documenti.** Ogni documento può avere più versioni. Espandendo lo
storico (`GET /single-documents/{id}/versions`) si elencano le versioni con
numero, origine e nome visualizzato rinominabile. L'utente può caricare una
nuova versione (`POST .../versions`, tramite modale) e rinominare le versioni
(`PATCH .../versions/{vid}`).

**Scheda Assistente.** Elenca le chat del progetto (`GET /projects/{id}/chats`),
ognuna rinominabile/eliminabile. "+ Chat" crea una chat con ambito progetto e la
apre. La chat di progetto si comporta esattamente come l'Assistente globale ma
il suo ambito RAG è il progetto (secondo la modalità di isolamento).

**Scheda Review.** Elenca le tabular review del progetto; "+ Tabular review" ne
crea una con ambito progetto (richiede ≥ 1 documento pronto).

**Esportazione progetto.** Una modale che chiede un'email destinataria e una
casella "includi le chat". `POST /project/{id}/export` restituisce il binario
`.mikeprj` cifrato, che viene scaricato. Il file è legato crittograficamente
all'email del destinatario — solo quella persona potrà importarlo.

**Importazione progetto via drag & drop.** Trascinando un file `.mikeprj` sulla
pagina dei progetti compare un overlay di rilascio; al rilascio, una finestra di
conferma chiede l'email destinataria (il file è cifrato, legato a quell'email).
`POST /project/import` lo importa e si naviga al nuovo progetto.

**Modale di creazione/modifica progetto.** Da estendere con il numero pratica e
con l'editabilità della modalità di isolamento (oggi assente dalla modale).

### Da fare
1. Rotta/vista di dettaglio del progetto con intestazione e tre schede.
2. Albero documenti a cartelle con drag & drop, protezione cicli, menu contestuale, azioni multiple.
3. Storico versioni: elenco, caricamento nuova versione, rinomina.
4. Scheda Assistente con chat di progetto ad ambito RAG di progetto.
5. Scheda Review con review ad ambito progetto.
6. Interruttore di isolamento RAG (solo proprietario).
7. Modale di esportazione `.mikeprj` e flusso di importazione via drag & drop con conferma email.
8. Estensione della modale progetto (numero pratica, modalità di isolamento).

---

## 8. Template DOCX — Dettaglio, generazione, applica-a-chat, **editor**

### Stato attuale
Lista, modale di dettaglio (`describe`), applica-a-chat e finestra di resa
(`render`) sono implementati. **In sviluppo**: l'editor dei template, che
permette di creare e modificare template DOCX dell'utente.

### Comportamento atteso

**Modale di dettaglio.** Cliccando una riga si apre una modale che recupera la
definizione completa del template e il suo prompt di authoring auto-generato
(`POST /docx-templates/describe`). La modale mostra: nome localizzato, id,
badge dominio (più i domini "applicabile anche a"), badge di livello di
automazione, marcatore "di sistema", l'elenco dei campi di metadati richiesti.

**Applica a chat.** La modale di dettaglio ha un'azione "Applica alla chat" che
apre una nuova chat dell'Assistente con il template già allegato come chip.
Deve essere possibile anche un collegamento diretto dalla pagina Template che
apre l'Assistente con il template pre-allegato.

**Generazione/resa.** Il backend espone `POST /docx-templates/render` (restituisce
un blob `.docx`) e `POST /docx-templates/describe`. Va costruita una finestra di
resa che raccoglie i valori dei campi di metadati richiesti e produce il
documento; va gestita l'intestazione di risposta che segnala i segnaposto non
risolti, mostrandoli all'utente.

### Editor dei template DOCX

**Modello di persistenza.** I template di sistema vivono in
`config/docx-templates/` come file JSON di sola lettura. I template dell'utente
vivono in `config/docx-templates/user/` come file JSON **scrivibili**: creare o
modificare un template significa scrivere un file JSON in quella cartella. Gli
endpoint di lettura (`list`, `describe`, `render`) uniscono le due sorgenti; i
template di sistema non sono mai modificabili né eliminabili dall'interfaccia.

**Endpoint di scrittura del backend.**
- `POST /docx-templates` — crea un nuovo template utente; il corpo è la
  definizione JSON completa; il backend assegna un id sotto `user/`, valida e
  scrive il file. Restituisce la definizione salvata.
- `PUT /docx-templates/{id}` — aggiorna un template utente esistente; rifiuta
  con errore se l'id appartiene a un template di sistema.
- `DELETE /docx-templates/{id}` — elimina un template utente; rifiuta i
  template di sistema.
Dopo ogni scrittura lo stato in memoria dei template (`state.docx_templates`)
va riallineato in modo che `list`/`describe`/`render` vedano subito le modifiche.

**Editor a pagina intera (scope "core + layout completo").** Copre **tutti** i
campi del modello `DocxTemplate`, non solo quelli di authoring:
- *Anagrafica*: nome localizzato (per le 6 lingue), categoria, dominio e domini
  "applicabile anche a", locale, livello di automazione, sintassi dei segnaposto,
  riferimento di origine.
- *Layout e tipografia*: formato carta, uso bollo, margini, tipografia/font,
  note a piè di pagina, style map (baseline + override), direttive supportate,
  blocco intestazione e piè di pagina, numerazione delle sezioni.
- *Contenuto*: scheletro delle sezioni, prompt per campo, metadati richiesti,
  limiti di caratteri, esempi few-shot, testo extra del prompt.
I template di sistema si aprono nell'editor in sola lettura, con possibilità di
**duplicarli** in un nuovo template utente modificabile.

### Da fare
1. ✅ Modale di dettaglio con `describe` e campi metadati.
2. ✅ Azione "Applica alla chat" e collegamento diretto template → Assistente.
3. ✅ Finestra di resa che raccoglie i metadati, chiama `render`, scarica il `.docx`.
4. ✅ Endpoint di scrittura del backend (`POST /docx-templates/save` e `/delete`) su `config/docx-templates/user/` con merge in lettura.
5. ✅ Editor a pagina intera con copertura completa dei campi e duplica-da-sistema.

---

## 9. Documenti — Caricamento, stato indicizzazione, conversione

### Stato attuale
Nessuna schermata dedicata. I documenti sono raggiungibili solo come allegati
della chat. Non esiste caricamento, né elenco, né visualizzazione dello stato di
indicizzazione.

### Comportamento atteso

**Caricamento.** I caricamenti accettano pdf/docx/doc/rtf/xlsx/xls/xlsb/ods/csv/txt/md
e immagini. Un caricamento standalone va a `POST /single-documents`; i
caricamenti di progetto a `POST /projects/{id}/documents`.

**Stato del documento.** Dopo il caricamento un documento ha uno stato
(`pending` → `processing` → `ready`, oppure `error`): il backend converte i
formati e costruisce embedding/indici. Lo stato va mostrato visivamente
(spinner durante l'elaborazione, allerta su errore, pronto a elaborazione finita).

**Risoluzione URL e byte.** Gli URL dei documenti si risolvono via
`GET /single-documents/{id}/url`; i byte per la visualizzazione via gli endpoint
`/display` e `/docx` (vedi sezione 4).

### Da fare
1. Componente di caricamento file (selettore nativo) usato dalla chat, dai progetti e dalle review.
2. Indicatore di stato del documento (pending/processing/ready/error) riutilizzabile.
3. Eventuale schermata/elenco documenti standalone se richiesto in seguito.

---

## 10. Impostazioni — Fonti dati (sync locale, EUR-Lex, corpora)

### Stato attuale
La sezione "Fonti dati" è una voce disabilitata che rende un segnaposto
"prossimamente". Nessuna UI per sync locale, EUR-Lex, corpus legale italiano.
Funzionano invece bene: Profilo, Sicurezza, Modelli, MCP.

### Comportamento atteso

La sotto-navigazione delle Impostazioni include un gruppo "Documenti e fonti"
con: Documenti locali/sync, più una voce per ogni corpus registrato dal backend
(es. EUR-Lex, Legale Italiano). L'elenco dei corpora si ottiene da `GET /corpora`;
i corpora non ancora collegati compaiono attenuati con un suffisso "prossimamente".

### 10.1 Sync documenti locali
Indicizza cartelle del filesystem locale nella base di conoscenza RAG.
Un modulo "aggiungi cartella" (percorso, etichetta, casella ricorsivo, e un
selettore di ambito — globale o uno specifico progetto). L'elenco cartelle
mostra per ognuna l'ambito, l'ora dell'ultima scansione, un pulsante **Scansiona**
e un pulsante di rimozione. Durante una scansione, una sezione di avanzamento
live mostra elaborati/totali, conteggi indicizzati/saltati/falliti, una barra di
avanzamento, e il file corrente con la fase della pipeline (`extracting`/`embedding`).
In cima alla pagina un banner mostra l'avanzamento di download/caricamento del
modello di embedding. Espandendo una cartella si elencano i file sincronizzati
con stato per-file (pronto/saltato/fallito) e numero di frammenti.
Polling: `GET /sync/folders/{id}/status` (~1,5 s mentre scansiona) e
`GET /sync/model-status` (~0,7 s).
API: `GET/POST /sync/folders`, `POST /sync/folders/{id}/scan`, `DELETE`, `GET .../files`.

### 10.2 Corpus EUR-Lex
Cerca e indicizza documenti legali UE nella base di conoscenza RAG.
Un interruttore "abilitato", un selettore di lingua (24 lingue UE) con
opzione "fallback inglese"; la configurazione si auto-salva (debounced) via
`PUT /eurlex/config`. Una casella di **ricerca intelligente** accetta un
identificatore CELEX, un riferimento naturale, o parole chiave;
`POST /eurlex/search` restituisce i risultati. Ogni risultato mostra titolo,
identificatore CELEX, lingue disponibili, un link "apri su EUR-Lex" (apre il
browser di sistema), e un pulsante **Sincronizza** che recupera e indicizza il
documento (`POST /eurlex/fetch`). Una sezione "documenti indicizzati" elenca i
documenti già sincronizzati con badge di stato (indicizzato / in sincronia con %
live / in coda / interrotto / "nessun frammento"), un comando di **resync** per
quelli falliti (`POST .../resync`) e l'eliminazione. Durante la sincronizzazione
fa polling di `GET /eurlex/embed-progress` e mostra una barra di avanzamento
embedding per-documento.
API: `GET /eurlex/config`, `GET /eurlex/documents`, `DELETE /eurlex/documents/{id}`.

### 10.3 Corpus Legale Italiano (e corpora generici)
Una pagina specifica del corpus che segue lo stesso schema di EUR-Lex/sync: un
flusso di importazione massiva con avanzamento a fasi (`POST /corpora/{id}/import`,
`GET .../import-status`, `GET .../import-progress`), ricerca/fetch, e gestione
documenti — pilotato dalle capacità dichiarate dal corpus. I corpora non
collegati ricadono su una pagina-corpus generica resa dai metadati di
`GET /corpora/{id}`.

### Da fare
1. Abilitare la sezione "Fonti dati" con sotto-navigazione alimentata da `GET /corpora`.
2. Pagina Sync locale: aggiungi cartella, elenco, scansione, avanzamento live, polling, elenco file.
3. Pagina EUR-Lex: config auto-salvata, ricerca, sincronizzazione, documenti indicizzati, resync, polling embedding.
4. Pagina corpus Legale Italiano e pagina-corpus generica.
5. Moduli API e store dedicati per sync ed eurlex/corpora (oggi assenti).

---

## 11. Banner stato embedding (Assistente)

### Stato attuale
Assente.

### Comportamento atteso
Sopra il compositore della chat, un banner compare **solo** quando la chat è in
attesa di una risposta **e** il sottosistema di embedding è occupato:
"download del modello" (una tantum, con avanzamento in MB), "caricamento del
modello" (build di sessione di 5–10 s dopo un riavvio), oppure "calcolo
embedding N/M" durante l'indicizzazione massiva. È invisibile a regime. Fa
polling di `GET /sync/model-status` e `GET /eurlex/embed-progress` (~500 ms,
con auto-throttling a riposo). Non blocca mai la digitazione.

### Da fare
1. Componente banner con i tre stati, polling auto-limitato, visibile solo a sottosistema occupato.

---

## 12. Approvazione tool MCP in chat

### Stato attuale
Assente. (Vedi anche la nota di memoria sul dialogo asincrono MCP ancora
irrisolto: pattern richiesta/recupero con auto-concatenazione + timeout 300 s +
ticker di avanzamento già spediti, ma restano modalità di fallimento residue.)

### Comportamento atteso
Quando uno strumento esterno/MCP richiede un'approvazione manuale durante una
risposta, la riga dello strumento in corso deve mostrare il suggerimento "sta
impiegando più del previsto" dopo ~10 s (vedi sezione 2, `tool_call_progress`).
L'eventuale dialogo di approvazione va integrato con prudenza: **non modificare
il prompt di sistema** del modello.

### Da fare
1. Allineare la riga-evento dello strumento al ticker di avanzamento.
2. Valutare con l'utente se/come esporre un dialogo di approvazione esplicito (area ancora aperta).

---

## 13. Regressione i18n nelle Impostazioni *(difetto da correggere)*

### Stato attuale
Le sezioni Profilo, Sicurezza, Modelli, MCP e Zona pericolosa contengono
**stringhe hard-coded in inglese** (etichette, messaggi toast). Anche l'overlay
di verifica biometrica ha stringhe hard-coded. Questo viola la regola di
progetto per cui ogni stringa visibile passa dal sistema i18n.

### Da fare
1. Estrarre tutte le stringhe visibili delle sezioni Impostazioni e dell'overlay biometrico in chiavi i18n.
2. Aggiungere le chiavi in tutte e 6 le lingue (it/en/fr/de/es/pt) mantenendo la parità del bundle.
3. Verificare a build che la parità delle chiavi sia mantenuta.

---

## Ordine consigliato di realizzazione

Le funzionalità sono interdipendenti. Sequenza suggerita:

1. **Correzione i18n Impostazioni (sez. 13)** — difetto, veloce, sblocca conformità.
2. **Visualizzatore documenti multi-formato (sez. 4)** — fondamento di citazioni e celle.
3. **Citazioni assistente (sez. 1)** + **eventi tool/documento (sez. 2)** — completano la chat e dipendono dal visualizzatore.
4. **Selettore modello + titolo automatico + modifiche tracciate (sez. 3)**.
5. **Documenti: caricamento e stato (sez. 9)** — prerequisito per review e progetti.
6. **Tabular review completa (sez. 6)** — grande, dipende da visualizzatore e documenti.
7. **Progetti: dettaglio e schede (sez. 7)** — grande, dipende da documenti, chat e review.
8. **Workflow: editor a pagina intera + modifica/eliminazione/condivisione (sez. 5)**.
9. **Template DOCX: dettaglio e generazione (sez. 8)**.
10. **Impostazioni → Fonti dati (sez. 10)** + **banner embedding (sez. 11)**.
11. **Approvazione tool MCP (sez. 12)** — da discutere, area aperta.

Le cartelle dei componenti `documents/`, `domain/`, `tabular/` sono attualmente
vuote: andranno popolate rispettivamente dalle sezioni 9, dai selettori di
dominio già usati altrove, e dalla sezione 6.
