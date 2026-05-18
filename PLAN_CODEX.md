# PLAN_CODEX - Gap analysis, suggerimenti, mancanze

## 0. Scopo e fonti
Questo documento annota i disallineamenti tra codice e documentazione e sintetizza le mancanze effettive. Fonti: README root, PLAN.md, TODO.md, frontend README, docs/mikerust-ui-rewrite-plan.md, e codice backend/frontend (axum + Svelte).

## 1. Disallineamenti documentazione <-> codice

### 1.1 PLAN.md risulta obsoleto rispetto al codice attuale
- **Nota metodologica**: `PLAN.md` dichiara esplicitamente che i blocchi "Current state" nelle sezioni dettagliate sono fotografia storica iniziale, mentre la tabella in sezione 9 e lo stato aggiornato. Quindi non e completamente "obsoleto": e misto (spec + snapshot iniziale + summary corrente). (PLAN: @PLAN.md#13-20, @PLAN.md#194-219)
- **Document viewer**: il piano indica che e assente, ma la UI include pannello con tab, render PDF/DOCX/sheet/text, highlight e download. Aggiornare lo stato e rimuovere il "missing". (PLAN: @PLAN.md#390-459, codice: @frontend/src/lib/components/documents/DocViewerPanel.svelte#1-287, @frontend/src/lib/components/documents/PdfView.svelte#1-299, @frontend/src/lib/components/documents/DocxView.svelte#1-83)
- **Model selector + auto title**: il piano dice non implementati; il composer ha il selector e lo store invoca /generate-title al primo turn. (PLAN: @PLAN.md#342-387, codice: @frontend/src/lib/components/chat/ChatInput.svelte#209-399, @frontend/src/lib/stores/chat.svelte.ts#167-255)
- **Workflows editor**: il piano segnala assenza; esiste WorkflowEditor con autosave e duplicazione. (PLAN: @PLAN.md#462-510, codice: @frontend/src/lib/components/workflow/WorkflowEditor.svelte#1-398)
- **Tabular review**: il piano dice "core missing", ma e presente una tabella base con run/clear, dettaglio cella, doc open. Serve riallineare lo stato (pur restando mancanze avanzate). (PLAN: @PLAN.md#514-604, codice: @frontend/src/lib/components/tabular/TabularDetail.svelte#1-352)
- **Projects detail**: il piano indica assenza, ma esiste ProjectDetail con tabs, upload, isolamento, export e chat/review list. (PLAN: @PLAN.md#608-673, codice: @frontend/src/lib/components/projects/ProjectDetail.svelte#1-439)
- **Settings > Data sources**: il piano dice disabilitato, ma esistono DataSourcesSection, Sync/Eurlex/Corpus. (PLAN: @PLAN.md#773-829, codice: @frontend/src/lib/components/settings/DataSourcesSection.svelte#1-112, @frontend/src/lib/components/settings/SyncSection.svelte#1-292)

### 1.2 Frontend README non riflette lo stato reale
- La sezione "Status" parla di "Fase 0 scaffold" e /healthz, ma nel codice sono presenti workflow editor, document viewer, project detail, tabular detail, ecc. (README: @frontend/README.md#10-15, codice: @frontend/src/lib/components/workflow/WorkflowEditor.svelte#1-398, @frontend/src/lib/components/documents/DocViewerPanel.svelte#1-287)
- Il README indica solo 2 comandi Tauri, ma esiste anche `pick_folder`. (README: @frontend/README.md#80-85, codice: @frontend/src/lib/tauri/commands.ts#1-46, @src-tauri/src/lib.rs#97-103)

### 1.3 README root e frontend README hanno dichiarazioni da riallineare
- README root afferma che il frontend React e stato rimosso: claim sostanzialmente vero (non ci sono sorgenti React), ma in workspace restano artefatti legacy in `frontendMike/` (`.next`, `node_modules`, `.env.local`). Conviene chiarire/ripulire per evitare ambiguita operative. (README root: @README.md#44-50, workspace: @frontendMike)

### 1.4 docs/mikerust-ui-rewrite-plan.md non allineato
- Il piano UI menziona solo due comandi Tauri; ora c'e `pick_folder` per Sync. Aggiornare la sezione comandi. (doc: @docs/mikerust-ui-rewrite-plan.md#547-571, codice: @frontend/src/lib/tauri/commands.ts#1-46)

## 2. Mancanze funzionali reali (dal codice)

### 2.1 Chat SSE: copertura eventi incompleta
- Gestiti: `tool_call_*`, `doc_created`, `citations`, `content_delta`. Gli eventi `reasoning_*`, `doc_read`, `doc_find`, `doc_edited`, `doc_replicate`, `workflow_applied` non risultano oggi emessi dal backend: sono roadmap/spec futura piu che regressione del frontend. (backend: @src/routes/chat.rs#2234-2360, @src/routes/chat.rs#2838-2841; frontend: @frontend/src/lib/api/chat.ts#71-109; PLAN summary: @PLAN.md#203-204)
- Non esiste UI per approvazione MCP o per step multi-hop. (chat store + steps: @frontend/src/lib/stores/chat.svelte.ts#176-255)
- Efficientamento payload chat aggiornato (2026-05-18, quality-first): compaction frontend applicata solo in condizioni estreme (`emergency-only`), lasciando al backend la summarization model-aware su soglia 80% della context window. In emergenza preserva: anchor iniziale + finestra recente + turni user strutturati (attachments/workflow/template).
- Soglie emergency ora model-aware: uso `context_window` dal catalogo modelli frontend; fallback dedicato per endpoint locali (`local:`, pattern Ollama/vLLM) con budget piu ampi rispetto al default conservativo. (codice: @frontend/src/lib/stores/chat.svelte.ts, backend summary: @src/llm/summarize.rs)
- Catalogo modelli `local` riallineato a vincolo hardware 24GB VRAM (`config/model.json`): shortlist professionale quantizzata 24B/27B/32B (Qwen 3.6 27B, Qwen 3.5 27B, Qwen 2.5 32B, Mistral Small 3.1 24B), rimosse le varianti 70B.
- Script operativo aggiunto per tuning locale context window: `scripts/recommend-context-window.ps1` legge modelli disponibili via `ollama list`, rileva `context length` massima via `ollama show`, profila RAM/VRAM host e propone `recommended_context` da riportare in `config/model.json`.
- Script operativi aggiunti per applicare/verificare profili context window per modello locale: `scripts/ollama-context-profiles.json` (profili), `scripts/apply-ollama-context-profiles.ps1` (dry-run default, `-Apply` per creare alias Ollama con `PARAMETER num_ctx`), `scripts/verify-ollama-context-profiles.ps1` (verifica `context length` effettiva).
- `config/model.json` aggiornato con alias tuned per portatili a memoria limitata: `mikerust-qwen35-4b:ctx16k`, `mikerust-qwen35-9b:ctx8k`, `mikerust-gemma4-e2b:ctx8k`.
- Correzione configurazione avvio MikeRust (Tauri Svelte): in `src-tauri/tauri.svelte.conf.json` i comandi build sono stati riallineati a path root-repo (`pnpm --dir ./frontend dev|build`) per evitare risoluzione errata su `C:\Progetti\frontend`.
- Correzione Settings → Model roles: la tendina ora include il provider `local` quando e configurato `local_base_url` (prima il filtro considerava solo provider con API key e quindi i modelli locali non comparivano nella lista ruoli).
- Correzione coerenza provider/modello in Settings per prevenire errori cross-provider (`Gemini 404` su modelli locali):
  - chip provider resi toggle multi-selezione (non esclusivi), disabilitati se il provider non e configurato;
  - combo ruoli filtrata su provider configurati + toggle attivi;
  - modelli `local` nella combo ruoli salvati con prefisso `local:`;
  - per provider `local`, la combo ruoli usa la lista runtime di `/models` dell'endpoint OpenAI-compatible (quando disponibile), mostrando solo modelli realmente disponibili;
  - in salvataggio, normalizzazione ID modello ruolo + persistenza `active_provider` coerente con i toggle.
- `README.md` (Quick start) aggiornato con comando corretto per avvio MikeRust su Windows usando Tauri CLI locale del repo: `.\frontend\node_modules\.bin\tauri.cmd dev --config src-tauri/tauri.svelte.conf.json`; comando `cargo tauri dev ...` mantenuto come alternativa opzionale solo con `cargo-tauri` globale.
- `config/model.json` aggiornato per scenario server GPU remoto (Ollama OpenAI-compatible): aggiunti profili `*balanced` (`rtx4090-qwen36:balanced`, `rtx4090-qwen35-9b:balanced`, `rtx4090-gemma4-26b:balanced`, `rtx4090-gemma4-e4b:balanced`, `rtx4090-gemma4-e2b:balanced`) e nota qualita locale allineata a endpoint self-hosted.
- Fix backend `llm/local` per modelli `*balanced` che emettono solo `reasoning`: fallback parser su `reasoning`/`reasoning_content` sia in streaming (delta SSE) sia in complete non-stream, evitando turni assistant vuoti in chat.
- Fix backend `build_local_config`: con modello esplicito prefissato (`local:...`), usa l'id richiesto invece del `local_model` salvato nel provider; elimina mismatch cross-model e i `502` su `/chat/:id/generate-title` quando il ruolo Main punta a un alias specifico server.
- Refinement backend `llm/local` su output utente: i campi `reasoning` non vengono piu mostrati in chat come testo assistant; viene esposto solo `content` (stream/non-stream) per evitare leak del thinking nella UI.
- Logging diagnostico backend `llm/local` aggiunto per payload in arrivo da Ollama/OpenAI-compatible: stampa in console delle linee SSE `data:` (`[llm/local] upstream_sse ...`) e del body raw in non-stream (`[llm/local] upstream_complete_body ...`), con preview troncata.
- Fix backend `llm/local` per output monocarattere (`"S"`) con modelli balanced: richieste stream/non-stream ora inviano `think: false` verso endpoint OpenAI-compatible, cosi il budget completion resta sul `content` utente invece che sul reasoning.
- Fix backend parser SSE `llm/local`: risolto drop di chunk quando piu linee `data:` arrivano nello stesso buffer (ora queue/drain completo degli eventi parseabili), evitando risposte troncate a 1 carattere in chat.
- Fix backend `generate_title`: se il modello restituisce `content` vuoto, titolo di fallback deterministico dai primi 5 token del primo messaggio utente; fallback finale `New chat` per evitare chat `Untitled`.
- Settings UI Local provider aggiornata secondo UX richiesta:
  - ordine campi invertito (`API key opzionale` prima di `Model`);
  - bottone refresh accanto a `Base URL` per interrogare manualmente `<base>/models`;
  - `Main`/`Title`/`Tabular` per provider `local` vincolati ai soli id runtime restituiti da `/models` (niente id locali non disponibili sul server).
- Correzione finale UX Local provider: campo `Model` locale convertito da input libero a dropdown runtime-only popolato da `<base>/models` (dopo refresh), quindi non e piu possibile inserire id arbitrari.
- Correzione ulteriore UX Local provider su richiesta utente: rimosso del tutto il campo `Model` dalla card Local; la scelta modelli avviene solo in `Model roles` (`Main` default) con id runtime da refresh `<base>/models`.
- Hardening prompt globale (`MRUST_SYSTEM_PROMPT`) per qualita formattazione risposta: stessa lingua dell'utente, output conciso/strutturato, no ripetizioni filename/liste duplicate, no meta-ragionamento verboso non richiesto.
- Feature sidebar chat list: aggiunto rename chat con icona matita a sinistra del cestino, editing inline titolo (Enter/blur salva, Esc annulla), persistenza via `PATCH /chat/:id` e aggiornamento stato locale chat list.
- UX nuova chat: su `chatStore.newChat()` il pannello documenti destro viene chiuso automaticamente (`docViewer.closeAll()`), cosi una nuova conversazione parte pulita.
- UX rename chat rifinita: entrando in edit inline il textbox riceve focus automatico e cursore posizionato a fine titolo corrente.
- Persistenza provider attivi in Settings: selezione multi-chip (`Google + Local`, ecc.) salvata e ripristinata alla riapertura (localStorage, filtrata sui provider configurati); disattivando `Local` resta solo `Google` dopo save/reopen.
- Fix timing persistenza provider attivi: i toggle chip scrivono subito in localStorage al click (non solo al Save), eliminando il caso in cui `Locale` risultava spento alla riapertura.
- Test formale eseguito: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale backend/config eseguito dopo riallineamento 24GB (incl. update Qwen 27B): `cargo check -p mike` -> compilazione OK (warning non bloccanti preesistenti).
- Test formale script eseguito: `pwsh -File .\scripts\recommend-context-window.ps1 -Format json` -> exit code `0`, report JSON con `max_context` e `recommended_context` per modello locale.
- Test formale script profili eseguito: `pwsh -File .\scripts\apply-ollama-context-profiles.ps1` -> exit code `0` (dry-run, comandi `ollama create` generati correttamente).
- Test formale verifica profili eseguito: `pwsh -File .\scripts\verify-ollama-context-profiles.ps1` -> exit code `0` (alias attualmente missing finche non si esegue apply).
- Test formale backend/config dopo update catalogo alias tuned: `cargo check -p mike` -> compilazione OK (warning non bloccanti preesistenti).
- Test formale avvio MikeRust dopo fix config: `.\frontend\node_modules\.bin\tauri.cmd dev --config src-tauri/tauri.svelte.conf.json` -> Vite su `http://127.0.0.1:5173/` + Tauri DevCommand avviato correttamente (processo in esecuzione).
- Test formale frontend dopo fix tendina modelli locali: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo fix coerenza provider/modello: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo update README comandi avvio: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale backend/config dopo update profili balanced server GPU: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Verifica runtime dopo update profili balanced: `.\frontend\node_modules\.bin\tauri.cmd dev --config src-tauri/tauri.svelte.conf.json` -> Vite su `http://127.0.0.1:5173/` + Tauri DevCommand in esecuzione.
- Test formale backend/config dopo fix runtime modelli balanced: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale backend/config dopo refinement visibilita thinking: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale backend/config dopo logging payload upstream Ollama: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale backend/config dopo enforce `think: false`: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale backend/config dopo fix parser SSE buffering: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale backend/config dopo fix fallback titolo non-vuoto: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale frontend dopo update UX Local provider + binding runtime models: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo lock dropdown runtime su `Model` locale: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo rimozione selector `Model` Local + auto-default `Main` da refresh runtime: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale backend dopo hardening prompt stile-risposta: `cargo check -p mike` -> compilazione OK (`Finished dev profile`; warning non bloccanti preesistenti).
- Test formale frontend dopo feature rename chat sidebar: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo auto-close doc viewer su nuova chat: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo polish focus/caret rename chat: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo persistenza provider attivi: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test formale frontend dopo persistenza immediata toggle provider: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.

### 2.2 Citazioni KB: viewer non gestisce path (RISOLTO 2026-05-18)
- Implementato supporto completo KB citations: parsing `path` -> `kbPath`, tab viewer `source: kb`, fetch bytes via `/sync/kb-doc` per open/download. (codice: @frontend/src/lib/types/citation.ts, @frontend/src/lib/stores/doc-viewer.svelte.ts, @frontend/src/lib/components/documents/DocViewerPanel.svelte, @frontend/src/lib/api/documents.ts)
- Test formale eseguito: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.
- Test di mapping aggiunto: `@frontend/src/lib/types/citation.test.ts` (caso `path` backend -> `kbPath`).

### 2.3 Doc viewer: modalita "tracked change" (RISOLTO 2026-05-18)
- Estesa la modalita viewer a `tracked` con policy `show|accept|reject` nello store tab per DOCX. (codice: @frontend/src/lib/stores/doc-viewer.svelte.ts)
- Aggiunti controlli header nel viewer per `Tracked Change`, `Accept`, `Reject` su tab DOCX. (codice: @frontend/src/lib/components/documents/DocViewerPanel.svelte)
- `DocxView` ora applica la policy di rendering tracked (`renderChanges` + filtri visuali su insertion/deletion) mantenendo highlight citazioni. (codice: @frontend/src/lib/components/documents/DocxView.svelte)
- Nota: in questa fase `Accept/Reject` e una vista applicata nel renderer (non persiste il file sul backend).
- Test formale eseguito: `pnpm --dir frontend typecheck` -> `svelte-check found 0 errors and 0 warnings`.

### 2.4 Tabular review: feature avanzate assenti
- Mancano export Excel, rating flag, citation pills, add column, column presets, assistant chat panel, overlay ricca (solo modal base). (tabular: @frontend/src/lib/components/tabular/TabularDetail.svelte#105-351)

### 2.5 Projects: manca struttura documentale avanzata
- Nessun folder tree, drag&drop, versioning e multi-azioni (download zip, rename versioni). La lista e piatta. (project detail: @frontend/src/lib/components/projects/ProjectDetail.svelte#296-405)

### 2.6 Workflows: sharing e detail modal
- Non esiste sharing per workflow e non c'e un detail modal read-only separato (l'editor e riusato). (workflows: @frontend/src/routes/Workflows.svelte#91-213)

### 2.7 Correzione: embedding banner in chat gia presente
- Il banner embedding e gia mostrato nella route Assistant durante lo streaming (`EmbeddingBanner`). Questa voce va rimossa dai gap aperti. (codice: @frontend/src/routes/Assistant.svelte#9-105, @frontend/src/lib/components/chat/EmbeddingBanner.svelte#1-61)

## 3. Debito tecnico e sicurezza (gia in TODO o evidenziato dal codice)
- **Biometria macOS** non implementata (TODO). (@src/auth/biometric.rs#3-121)
- **Correzione**: il token auth nel frontend Svelte e in-memory (non in `localStorage`). La voce TODO sui cookie HttpOnly va reinterpretata come hardening opzionale per sessioni persistenti, non come bug corrente. (@frontend/src/lib/stores/auth.svelte.ts#7-13, @TODO.md#294-296)
- **Document loader pluggable** non implementato (TODO) per evitare duplicazione estrazione. (@TODO.md#95-134)

## 4. Roadmap suggerita (alta priorita)

### Fase 1 - Allineamento documentazione
1. Aggiornare PLAN.md con lo stato reale (doc viewer, workflows editor, projects, tabular base, data sources). (ref: @PLAN.md#390-829)
2. Aggiornare frontend README (status, comandi Tauri). (ref: @frontend/README.md#10-15, @frontend/README.md#80-85)
3. Aggiornare docs/mikerust-ui-rewrite-plan.md su comandi Tauri. (ref: @docs/mikerust-ui-rewrite-plan.md#547-571)
4. Chiarire `frontendMike/` nel README root (rimuovere o documentare). (ref: @README.md#44-49)

### Fase 2 - Funzionalita core mancanti
1. [DONE 2026-05-18] Supporto citazioni KB nel doc viewer (passare kbPath e usare `/sync/kb-doc`). Verifica formale: `pnpm --dir frontend typecheck` green.
2. [IN PROGRESS] Chat stream/UI: eventi futuri (`reasoning_*`, `doc_read`, `doc_find`, `doc_edited`, `workflow_applied`) restano dipendenti da emissione backend; completata strategia quality-first su riduzione token (compaction frontend solo emergency, summarizer backend 80% come meccanismo principale). Verifica formale: `pnpm --dir frontend typecheck` green.
3. [DONE 2026-05-18] Tracked-change mode nel viewer e azioni Accept/Reject (vista renderer DOCX). Verifica formale: `pnpm --dir frontend typecheck` green.
4. Tabular review: export Excel, add column, citation pills, assistant panel. (ref: @frontend/src/lib/components/tabular/TabularDetail.svelte#105-351)

## 6. Regola operativa di verifica (richiesta utente)
- Per ogni sviluppo applicato al codice, eseguire sempre almeno un test formale di validazione tecnica (typecheck/build/test mirato), registrando comando e risultato.
- Annotare in `HISTORY.md` e in questo file le attivita svolte e il relativo esito, cosi da consentire riverifica manuale puntuale.

### Fase 3 - Hardening
1. Valutare cookie HttpOnly solo se si introduce persistenza sessione; oggi token in-memory e gia minimizza esposizione XSS.
2. Document loader pluggable per formati futuri. (ref: @TODO.md#95-134)
3. Biometria macOS. (ref: @src/auth/biometric.rs#3-121)

## 5. Note finali
Questo file non propone modifiche dirette al codice; e un inventario delle mancanze e suggerimenti emersi dall'analisi del codice e della documentazione.
