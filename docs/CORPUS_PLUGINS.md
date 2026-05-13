# Corpus plugin manifests

MikeRust discovers legal-corpus connectors through **JSON manifest
files** in [`corpora-plugins/`](../corpora-plugins). One file per
corpus. The runtime parses them at startup, validates them, and
exposes the registry to the UI (`GET /corpora`) and the chat's
`<USER LIBRARY>` system prompt block.

The manifest is intentionally **declarative and read-only**: it does
not execute code. Today every shipped manifest has
`"strategy": { "kind": "builtin", "builtin_id": "…" }`, which says
"use the named hand-written Rust adapter for this corpus". This
unifies how corpora are listed and configured without forcing the
complex existing adapters (EUR-Lex's multi-URL fallback +
AWS-WAF detection + retry-with-backoff, Italian Legal's parquet bulk
import + HF row fetch) into a JSON DSL.

When `http-fetch-per-id` and `hf-dataset-bulk` strategies land later,
adding a new corpus becomes: drop a JSON file in `corpora-plugins/`.

## Layout

```
corpora-plugins/
├── eurlex.json
├── italian-legal.json
└── …
```

By default the runtime scans `./corpora-plugins/` relative to the
working directory. Override with the `MIKE_CORPUS_PLUGINS_DIR`
environment variable (useful for tests or alternative installations).

## Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Stable corpus key. Matches `^[a-z][a-z0-9\-]*$`. Persisted in `documents.corpus_id`. |
| `display_name` | string | ✅ | Default English name shown in the UI when the user's locale has no override. |
| `display_name_locale` | `{ [locale]: string }` | ❌ | Per-locale override map. Locale keys are ISO-639-1 lowercase. |
| `description` | string | ❌ | One-line description for the corpus picker. |
| `homepage` | string | ❌ | Source-site URL. UI renders "open externally" link. |
| `languages` | `string[]` | ✅ | ISO-639-1 lowercase codes the corpus is served in. |
| `default_language` | string | ✅ | Initial language when the user opens the panel. Must be in `languages`. |
| `supports_language_fallback` | bool | ❌ (default `true`) | When true and primary language returns nothing, the adapter tries `fallback_language`. |
| `fallback_language` | string | ❌ (required if `supports_language_fallback`) | Must be in `languages`. |
| `identifier_label` | string | ✅ | Label shown next to identifier inputs (CELEX, ELI, URN, BOE-A-…). |
| `identifier_example` | string | ❌ | Example for placeholder text or onboarding hints. |
| `enabled_by_default` | bool | ❌ (default `true`) | First-time enabled state in user settings. Users can toggle later. |
| `strategy` | object | ✅ | Discriminated union; see [Strategies](#strategies). |

### Validation rules

The loader rejects a manifest with a `tracing::warn!` and continues
loading the others if any of these fail:

- `id` doesn't match the regex (uppercase, spaces, punctuation forbidden).
- `languages` empty, or contains a non-ISO-639-1 code.
- `default_language` not in `languages`.
- `fallback_language` set but not in `languages`.
- `supports_language_fallback: true` but `fallback_language` missing.
- `strategy.kind == "builtin"` with `builtin_id` not in the known list.

## Strategies

The `strategy` field is a discriminated union keyed on `kind`. Today
only `builtin` is honored by the runtime; the others parse but the
corpus is marked as not-runnable.

### `builtin`

Points to a hand-written Rust adapter compiled into the binary.

```json
"strategy": {
    "kind": "builtin",
    "builtin_id": "eurlex"
}
```

Known `builtin_id` values:

| `builtin_id` | Rust module | What it does |
|---|---|---|
| `eurlex` | [`src/corpora/eurlex.rs`](../src/corpora/eurlex.rs) | CELEX/ELI fetch from public EUR-Lex, 4-URL fallback (TXT/HTML/ALL/Cellar), AWS-WAF detection, retry-with-backoff, HTML longest-match extraction. |
| `italian-legal-hf` | [`src/corpora/italian_legal.rs`](../src/corpora/italian_legal.rs) | Bulk metadata import (parquet projection, pinned commit SHA) + on-demand `/rows` fetch from the `dossier-legal/italian-legal-corpus` HF dataset. Filters Normattiva + Corte Costituzionale. |

Adding a new builtin: implement `LegalCorpusAdapter`, register the
`builtin_id` in `KNOWN_BUILTINS` in
[`src/corpora/plugin.rs`](../src/corpora/plugin.rs), ship a manifest
that points at it.

### `http-fetch-per-id` *(reserved, not yet implemented)*

```json
"strategy": {
    "kind": "http-fetch-per-id",
    "search_by_id": {
        "url_template": "https://api.example.com/doc/{identifier}/{lang}",
        "shape": "rest-json",
        "title_path": "$.title",
        "body_path":  "$.content.text"
    },
    "search_by_keyword": {
        "url_template": "https://api.example.com/search?q={query}",
        "shape": "rest-json",
        "hits_path":     "$.results[*]",
        "identifier_at": "$.cid",
        "title_at":      "$.title"
    }
}
```

Loads fine today; the runtime marks the corpus as not-runnable
(`is_runnable() == false`) until the declarative HTTP adapter
lands. Will cover the 70% case: REST endpoints with JSON / HTML
responses and standard auth.

### `hf-dataset-bulk` *(reserved, not yet implemented)*

Generalises what `italian-legal-hf` does today: bulk metadata import
from a HuggingFace dataset (pinned revision, projected columns) +
on-demand `/rows` fetch.

## End-to-end examples

### EUR-Lex

[`corpora-plugins/eurlex.json`](../corpora-plugins/eurlex.json):

```json
{
    "id": "eurlex",
    "display_name": "EUR-Lex",
    "display_name_locale": { "it": "EUR-Lex", "en": "EUR-Lex" },
    "description": "Official portal for European Union law…",
    "homepage": "https://eur-lex.europa.eu",
    "languages": ["bg", "cs", "da", "…", "sv"],
    "default_language": "en",
    "supports_language_fallback": true,
    "fallback_language": "en",
    "identifier_label": "CELEX",
    "identifier_example": "32016R0679",
    "enabled_by_default": true,
    "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
}
```

### Italian Legal Corpus

[`corpora-plugins/italian-legal.json`](../corpora-plugins/italian-legal.json):

```json
{
    "id": "italian-legal",
    "display_name": "Italian Legal Corpus",
    "display_name_locale": {
        "it": "Italia legale",
        "en": "Italian Legal Corpus"
    },
    "languages": ["it"],
    "default_language": "it",
    "supports_language_fallback": false,
    "identifier_label": "URN",
    "identifier_example": "urn:nir:stato:legge:2023-12-29;213",
    "enabled_by_default": true,
    "strategy": { "kind": "builtin", "builtin_id": "italian-legal-hf" }
}
```

## Adding a new corpus

### Path A — backed by a builtin Rust adapter

1. Implement `LegalCorpusAdapter` for the corpus in `src/corpora/<name>.rs`.
2. Add the builtin id to `KNOWN_BUILTINS` in
   [`src/corpora/plugin.rs`](../src/corpora/plugin.rs).
3. Drop a manifest in `corpora-plugins/<id>.json` with
   `"strategy": { "kind": "builtin", "builtin_id": "<your-id>" }`.
4. Restart MikeRust. `GET /corpora` will include the new entry,
   and the settings panel will list it.

### Path B — pure JSON (when declarative strategies land)

Once `http-fetch-per-id` ships, this is the entire flow:

1. Identify the corpus's public endpoints (no auth or BYOK).
2. Map response paths to `title_path` / `body_path` (JSONPath or CSS
   selector depending on `shape`).
3. Save the JSON, restart. The corpus becomes available without a
   recompile.

## Registry semantics

- **Read-only at runtime**: hot reload is not supported. To pick up
  manifest changes, restart MikeRust. (The hook would be cheap to add
  if needed — file-watcher on the plugins directory — but it changes
  the failure mode of misconfigured manifests, so we're keeping it
  explicit for now.)
- **Failures are isolated**: a broken manifest is logged and skipped;
  it does not stop the rest from loading.
- **Duplicate ids**: last manifest wins, with a `tracing::warn!`. The
  filesystem-scan order is OS-dependent so don't rely on it.
- **Per-user enable state** is NOT in the manifest. `enabled_by_default`
  only sets the initial state; the live state lives in `corpus_settings`
  rows in the DB (see `/eurlex/config`, `/italian-legal/config`).

## Surfacing in chat

When the chat handler builds the `<USER LIBRARY>` block of the system
prompt, it reads documents persisted under each `corpus_id` from the
`documents` table. The corpus plugin registry is the metadata source
for the inventory header (display name, identifier label, source
homepage); the data source is still the `documents` table.

See [`src/routes/chat.rs::build_library_inventory_prompt`](../src/routes/chat.rs).

## See also

- [`docs/CORPORA.md`](CORPORA.md) — high-level plan + API survey per corpus
- [`docs/UPSTREAM_SYNC.md`](UPSTREAM_SYNC.md) — policy for syncing fixes from upstream Mike
- [`src/corpora/mod.rs`](../src/corpora/mod.rs) — `LegalCorpusAdapter` trait
- [`src/corpora/plugin.rs`](../src/corpora/plugin.rs) — manifest parser + registry
