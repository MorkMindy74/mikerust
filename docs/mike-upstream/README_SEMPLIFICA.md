# Analisi del progetto Mike e dei fork

## Il progetto originale: `willchen96/mike`

**Mike** è una piattaforma AI open-source per la revisione legale di documenti. La licenza è AGPL-3.0-only.

### Architettura

| Componente | Tecnologia | Scopo |
|---|---|---|
| `frontend/` | Next.js 16 / React 19 / TailwindCSS / shadcn-radix | UI: chat, progetti, tabular review, workflow |
| `backend/` | Express 4 / TypeScript 5 | API REST, elaborazione documenti, accesso Supabase/S3 |
| Database | Supabase (Auth + Postgres) | Utenti, progetti, documenti, review |
| Storage | Cloudflare R2 (S3-compatible) | File caricati dagli utenti |
| LLM | Anthropic Claude + Google Gemini | Modelli AI per chat e analisi |
| Document processing | LibreOffice, Mammoth, PDF.js, docx | Conversione e parsing |
| Deploy frontend | OpenNext (Cloudflare Workers) | Build/deploy serverless |
| Deploy backend | Nixpacks | Containerizzazione |

### Funzionalità principali

- **Chat assistente**: chat agente per analisi, drafting e modifica di documenti legali con citazioni inline
- **Progetti**: spazi collaborativi con documenti condivisi, chat multi-documento, gestione versioni
- **Tabular review**: estrazione strutturata di dati da documenti in forma tabellare (colonne configurabili, export Excel)
- **Workflow**: workflow predefiniti o personalizzati (es. generazione checklist CP, credit agreement summary)
- **Tracked changes DOCX**: creazione e gestione di modifiche tracciate nei file Word (`applyTrackedEdits`, `resolveTrackedChange`)
- **Modelli LLM**: tre fasce (main, mid, low) per Claude e Gemini; selezione per tipo di operazione

### Variabili d'ambiente richieste

**Backend** (`backend/.env`):
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`
- `RESEND_API_KEY` (email)

**Frontend** (`frontend/.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_API_BASE_URL`

---

## Fork 1: `jamietso/mike-redline`

**Repo**: https://github.com/jamietso/mike-redline  
**Linguaggi**: TypeScript 98.1%, Other 1.9%  
**Attività**: fork del 29 aprile 2026, con 3 commit aggiuntivi il 5 maggio 2026

### Cosa aggiunge

L'unico scopo di questo fork è **il supporto alle redline** (modifiche tracciate) nei documenti DOCX e PDF. Introduce un sistema di marcatori inline nel testo che l'LLM legge:

| Marcatore | Significato |
|---|---|
| `{++testo++}` | Inserimento |
| `{--testo--}` | Cancellazione |
| `{>>AUTORE: testo<<}` | Commento |

Nessuna modifica allo schema DB, nessuna nuova API surface, nessuna modifica UI.

**File modificati/aggiunti rispetto all'upstream:**

- `backend/src/lib/docxTrackedChanges.ts` — nuovo parser che legge `word/document.xml` e `word/comments.xml` e inietta i marcatori a `w:ins`, `w:del`, `w:commentRangeStart`
- `backend/scripts/redline_extract.py` — script Python con **PyMuPDF** che estrae redline da PDF color-coded (rosso = cancellazione, blu = inserimento, verde = spostato) e produce gli stessi marcatori
- `backend/src/lib/pdfRedlineExtract.ts` — wrapper Node che invoca lo script Python come subprocess, con fallback trasparente a `pdfjs-dist` se Python/PyMuPDF non sono disponibili
- `backend/src/lib/chatTools.ts` e `backend/src/routes/tabular.ts` — system prompt aggiornati per insegnare al modello il significato dei marcatori

**Setup aggiuntivo richiesto:**
```bash
pip install pymupdf
# Opzionale: env var PYTHON_BIN per puntare a uno specifico interprete (default: python3)
```

**Compatibilità**: drop-in sull'upstream, nessuna breaking change.

---

## Fork 2: `Jeroen1991z/mikeNL`

**Repo**: https://github.com/Jeroen1991z/mikeNL  
**Linguaggi**: TypeScript 98.4%, Other 1.6%  
**Attività**: nessun commit aggiuntivo rispetto all'upstream (solo "Add local repo contents" + "Initial empty commit" del 29 aprile 2026)

### Cosa aggiunge

**Nessuna modifica sostanziale al codice.** Il README è identico all'upstream. Il fork è probabilmente un clone per uso personale o per sviluppo futuro (il nome "NL" suggerisce adattamento per contesto olandese/Netherlands), ma al momento non contiene differenze funzionali rispetto a `willchen96/mike`.

---

## Fork 3: `vadi25/patronus`

**Repo**: https://github.com/vadi25/patronus  
**Linguaggi**: TypeScript 96.7%, PLpgSQL 2.3%, Other 1.0%  
**Attività**: 3 commit — 2 dell'upstream (29 aprile 2026) + 1 commit di refactoring sostanziale (30 aprile 2026)

### Cosa aggiunge

Questo è il fork più esteso. Il commit principale (`908aefd`) è descritto come *"refactor: migrate project API to Patronus client, rebrand UI icons, implement Supabase schema, and add comprehensive project documentation"* e introduce cambiamenti strutturali significativi:

**Rebrand completo:**
- Il progetto si chiama **Patronus** (non più Mike)
- Nuovi componenti UI: `patronus-icon.tsx`, `site-logo.tsx`
- Nuova API client: `patronusApi.ts` (sostituisce/affianca `mikeApi.ts`)

**Migrazione DB con Supabase CLI:**
- Aggiunge la cartella `supabase/migrations/` con migrazioni gestite via `supabase db push` (oltre al file SQL one-shot dell'upstream)
- Presenza di codice PLpgSQL (2.3% del repo) conferma migrazioni SQL strutturate
- Il modello LLM di default cambia: richiede **OpenAI API key** (non solo Gemini/Claude come nell'upstream)

**Documentazione tecnica estesa (`docs/`):**
Una cartella `docs/` completamente nuova con struttura a "progressive disclosure" per uso con Claude Code:
```
docs/
├── INDEX.md
├── architecture/     (overview, implementation, troubleshooting)
├── auth-data/
├── projects-documents/
├── assistant-chat/
├── workflows/
├── tabular-reviews/
├── deployment/
└── sop/              (procedure operative standard)
```

**Integrazione Claude Code:**
- `.claude/agents/doc-reader.md` — subagente per leggere la documentazione interna
- `.claude/commands/check-docs.md` — comando per verificare che la documentazione sia aggiornata dopo modifiche
- `CLAUDE.md` — guida completa per Claude Code con stack tecnico, convenzioni, struttura docs

**Semplificazione backend:** il backend Patronus ha meno route rispetto all'upstream (solo `chat.ts`, `projectChat.ts`, `tabular.ts` visibili nel commit), suggerendo una versione ridotta o in fase di refactoring.

---

## Fork 4: `rafal-fryc/mikelocal`

**Repo**: https://github.com/rafal-fryc/mikelocal  
**Linguaggi**: TypeScript 97.0%, JavaScript 1.4%, Other 1.6%  
**Attività**: fork con release v0.x per Windows; progetto maturo con documentazione tecnica dettagliata

### Cosa aggiunge

Il cambiamento più radicale tra tutti i fork: **converte Mike da applicazione web cloud-hosted ad app desktop Electron standalone per Windows**, senza alcuna dipendenza da servizi cloud (niente Supabase, niente R2, niente OpenNext).

**Sostituzione completa dello stack di backend:**

| Upstream | mikelocal |
|---|---|
| Supabase Auth | Password locale con **scrypt** (`auth.json`) + JWT HS256 per-launch |
| Supabase Postgres | **SQLite** via `better-sqlite3` + shim query-builder (`supabaseShim.ts`) |
| Cloudflare R2 | Filesystem locale `<workspace>/files/` con path-traversal guard |
| OpenNext deploy | Next.js `output: 'standalone'` per packaging offline |
| LibreOffice esterno | LibreOffice **bundled** nell'installer (~330 MB estratti) |

**Architettura Electron (3 processi):**
```
Electron main (Node)
  ├── Lock screen (HTML/CSS/JS, sandbox-safe)
  ├── Spawna: backend Express su 127.0.0.1:<porta casuale>
  └── Spawna: frontend Next.js standalone
       └── Renderer (sandboxed) ←→ IPC bridge (contextBridge → window.mike)
```

**Sicurezza by design:**
- Password hash con scrypt (N=131072, ~400 ms/derive, ~128 MB working set)
- JWT HS256 hand-rolled con `Node crypto` (no dipendenza `jsonwebtoken`); segreto generato casualmente ad ogni avvio, mai persistito
- Renderer sandboxed: `contextIsolation: true`, `nodeIntegration: false`, CSP restrittiva in build di produzione
- Guard filesystem: ogni path viene verificato con `fs.realpath` per prevenire path traversal
- Nessuna telemetria, nessun analytics, nessun error reporting remoto

**`supabaseShim.ts`** (~600 righe): reimplementa la query-builder API di `supabase-js` (`eq`, `neq`, `in`, `or`, `ilike`, `order`, `limit`, `single`, `rpc`, ecc.) compilandola in SQL su SQLite — permette al frontend di non essere riscritto.

**Nuovo strato `electron/`:**
```
electron/
├── main.ts          lifecycle, IPC, CSP, DevTools gating
├── auth.ts          scrypt hash/verify, lockout state
├── jwt.ts           HS256 token signer
├── secrets.ts       API key read da workspace
├── workspace.ts     selezione workspace, atomic write, install-dir guard
├── backend.ts       spawn/stop Express backend
├── frontend.ts      spawn/stop Next.js server
├── preload.js       contextBridge → window.mike (API minimale)
└── lock/            lock-screen HTML/CSS/JS
```

**Convenzioni di progetto (per contribuitori):**
- Fasi di sviluppo in `.claude/phases/PHASE-NN-{active|done}.md`
- Decisioni tecniche in `DECISIONS.md` (append-only, con motivazioni)
- Pre-ship code review in `CODE-REVIEW-<version>.md`
- Commit con Conventional Commits (es. `feat(security):`, `fix(chat):`)

**Limitazioni note:**
- Solo Windows (macOS/Linux è una config `electron-builder` da aggiungere)
- `.exe` non firmato (Windows SmartScreen avverte al primo avvio)
- No auto-update; utente singolo per installazione

---

## Fork 5: `veronica-builds/emilie`

**Repo**: https://github.com/veronica-builds/emilie  
**Linguaggi**: TypeScript 99.0%, Other 1.0%  
**Nome completo**: *Swiss sovereign legal AI — named after Emilie Kempin-Spyri*  
**Attività**: fork attivo, orientato alla sovranità digitale svizzera

### Cosa aggiunge

Tre estensioni distinte sulla base di Mike, con l'obiettivo di **non far uscire i documenti dall'infrastruttura controllata dall'utente**:

**1. Sovereign auth (niente Supabase)**
- Sostituisce Supabase Auth con **JWT + bcrypt direttamente su Postgres** — nessun servizio di terze parti, nessun dato fuori dall'infrastruttura propria
- Richiede solo una variabile `JWT_SECRET` generata localmente (`openssl rand -base64 48`)
- Migrazione schema via `psql` diretto (no Supabase CLI)

**2. Client MCP (Model Context Protocol)**
- Connette l'assistente a qualsiasi server MCP configurato in `MCP_SERVERS` (env JSON)
- I tool esposti dai server MCP diventano disponibili in ogni conversazione senza modifiche al codice
- Server svizzeri open e gratuiti pre-configurabili:
  - [Entscheidsuche](https://entscheidsuche.ch) — ricerca sentenze
  - [OpenCaseLaw.ch](https://opencaselaw.ch) — giurisprudenza federale/cantonale
  - [Online Kommentar](https://onlinekommentar.ch) — commentari giuridici
  - [Fedlex](https://fedlex.data.admin.ch) — legislazione federale svizzera

**3. Supporto modelli locali (endpoint OpenAI-compatible)**
- Route verso qualsiasi endpoint di inferenza OpenAI-compatible tramite `VLLM_BASE_URL`
- Modello raccomandato: **[Apertus](https://www.swiss-ai.org/apertus)** (ETH Zürich + EPFL + CSCS, Apache 2.0, >1000 lingue incluse le lingue nazionali svizzere)
- Due opzioni di deploy: self-hosted via **vLLM**, oppure **Infomaniak AI Tools** (cloud svizzero)
- Anthropic e Gemini rimangono disponibili come fallback

**Stack "sovrano" raccomandato:**
- Postgres su infrastruttura propria o VPS Infomaniak (Svizzera)
- Object storage: **Infomaniak Object Storage** (Svizzera, S3-compatible)
- LLM: Apertus via vLLM locale o Infomaniak AI Tools
- LibreOffice: locale (nessun dato esce dalla macchina)

**Variabili d'ambiente aggiuntive:**
```bash
JWT_SECRET=<openssl rand -base64 48>
VLLM_BASE_URL=http://localhost:8000/v1      # o endpoint Infomaniak
VLLM_MAIN_MODEL=<apertus-model-id>
VLLM_API_KEY=<opzionale>
MCP_SERVERS=[{"name":"entscheidsuche","url":"https://mcp.entscheidsuche.ch/mcp"}, ...]
```

---

## Fork 6: `legalquant/Mike-KC`

**Repo**: https://github.com/legalquant/Mike-KC  
**Linguaggi**: TypeScript 97.2%, JavaScript 1.3%, Other 1.5%  
**Attribution**: costruito su `willchen96/mike` + `rafal-fryc/mikelocal`  
**Focus**: diritto inglese (UK) e litigation

### Cosa aggiunge

Mike KC è una **versione desktop** (deriva da mikelocal) arricchita con una suite di **tool specializzati per il contenzioso e la pratica legale UK**, esposti come chat card inline e come workflow suddivisi in due categorie (Transactional / Litigation).

**Nuovi tool KC (`backend/src/lib/kc/`):**

| Tool | Funzione |
|---|---|
| **Read Redlines** | Parsing avanzato di tracked changes DOCX: nomi revisori, inserzioni/cancellazioni, ancore commenti, colori revisori, stati paragrafo, conflict flag |
| **Build Chronology** | Estrazione di eventi datati da documenti di contenzioso: attore, evento, fonte, citazione testuale, confidence score, tag issue, gap di disclosure |
| **Find Authorities / Verify Citations** | Estrazione di citazioni UK (neutral + traditional), verifica neutral citation su **BAILII** e **Find Case Law**, report di autorità irrisolte (non inventa sommari) |
| **Check Propositions** | Separa proposizioni legali da fattuali, verifica se sono supportate dal testo e dalle autorità citate |
| **Counsel's Table** | Review multi-ruolo leggero: punti di forza/debolezza, citation risk, emendamenti redazionali, sintesi |
| **Corporate Investigation** | Ricerca su **Companies House** (API key richiesta): ufficiali, PSC, cariche, filing, risk signal, struttura gruppo; legge JSON, XML/XHTML/iXBRL, PDF |

**Architettura locale identica a mikelocal** (Electron + SQLite + filesystem locale), con l'aggiunta di:
- `frontend/src/components/kc/` — chat card UI per i risultati KC
- `backend/src/lib/kc/__tests__/` — test suite dedicata
- `docs/smoke/` — fixture documenti per test manuali (redline DOCX, litigation suite TXT)
- `frontend/src/app/components/workflows` — split Transactional / Litigation

**Suite di test:**
```bash
npx tsx --test "backend/src/lib/kc/__tests__/*.test.ts"
npx tsx --test "frontend/src/app/components/workflows/*.test.ts" \
        "frontend/src/app/lib/mikeApiPortRefresh.test.ts"
npx tsx --test "electron/backendPort.test.ts"
```

**Limitazioni note:**
- Citazioni traditional law-report estratte ma verifica ancora manuale
- Counsel's Table è ausilio di lavoro, non consulenza formale
- Companies House richiede API key dedicata
- PDF scansionati: OCR rilevato ma non bundled
- Il contesto selezionato viene comunque inviato al provider LLM configurato (non è un modello locale)

---

## Riepilogo comparativo (tutti i fork)

| Aspetto | `willchen96/mike` | `jamietso/mike-redline` | `Jeroen1991z/mikeNL` | `vadi25/patronus` | `rafal-fryc/mikelocal` | `veronica-builds/emilie` | `legalquant/Mike-KC` |
|---|---|---|---|---|---|---|---|
| **Scopo** | Piattaforma web AI legale | Redline DOCX/PDF | Clone senza modifiche | Rebrand + docs + OpenAI | Desktop Electron locale | Sovranità digitale svizzera | Desktop UK litigation |
| **Deployment** | Web (OpenNext/Nixpacks) | Web | Web | Web | **Electron Windows** | Web | **Electron (da mikelocal)** |
| **Auth** | Supabase Auth | Supabase Auth | Supabase Auth | **JWT+bcrypt su Postgres** | **scrypt locale + JWT** | **JWT+bcrypt su Postgres** | **scrypt locale + JWT** |
| **Database** | Supabase Postgres | Supabase Postgres | Supabase Postgres | Supabase Postgres | **SQLite** | Postgres diretto | **SQLite** |
| **Storage** | Cloudflare R2 | Cloudflare R2 | Cloudflare R2 | Cloudflare R2 | **Filesystem locale** | Infomaniak / S3 | **Filesystem locale** |
| **LLM** | Gemini + Claude | Gemini + Claude | Gemini + Claude | + **OpenAI** | Gemini + Claude | + **Apertus/vLLM (locale)** | Gemini + Claude |
| **MCP** | No | No | No | No | No | **Sì (qualsiasi server)** | No |
| **Redline avanzato** | Base (tracked changes) | **{++/--} DOCX+PDF** | Base | Base | Base | Base | **Reviewer/color/conflict** |
| **Tool specializzati** | No | No | No | No | No | Ricerca giurisprudenza CH | **KC suite (UK law)** |
| **Dipendenze extra** | — | `pymupdf` | — | Supabase CLI | Electron, SQLite | `JWT_SECRET`, `VLLM_BASE_URL` | Companies House API key |
| **Attività** | Principale | Attivo (mag 2026) | Inattivo | Attivo (apr 2026) | Attivo (release v0.x) | Attivo | Attivo |
