//! `/corpora` — list the JSON-manifest-driven corpus plugin registry.
//!
//! Read-only: the manifests live on disk under `corpora-plugins/` and
//! are loaded once at startup into `AppState::corpus_plugins`. This
//! endpoint surfaces the registry to the UI (settings panel can list
//! every available corpus uniformly, regardless of whether it's
//! served by a builtin Rust adapter or — eventually — a declarative
//! HTTP-fetch strategy).
//!
//! Per-user enable/disable state is NOT here; that still lives in
//! `corpus_settings` (see /eurlex/config etc.) keyed per-corpus.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Arc;

use crate::{
    auth::middleware::AuthUser,
    corpora::plugin::{Capabilities, CorpusPlugin, CorpusSource},
    storage::make_storage,
    AppState,
};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({"detail": msg})))
}

fn storage_root() -> PathBuf {
    PathBuf::from(
        std::env::var("STORAGE_PATH").unwrap_or_else(|_| "./data/storage".to_string()),
    )
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_corpora))
        .route("/{id}", get(get_corpus))
        // Generic operations dispatched by corpus id. Each handler
        // looks the corpus up in `state.corpus_plugins`, validates
        // the capability is enabled, then delegates to the adapter
        // in `state.corpus_adapters` (declarative corpora only —
        // builtin ones keep their `/eurlex` `/italian-legal` routes
        // for now).
        .route("/{id}/search", post(generic_search))
        .route("/{id}/fetch", post(generic_fetch))
        .route("/{id}/documents", get(generic_list_documents))
}

/// Public projection of a `CorpusPlugin` for the API. Strips the
/// `strategy` discriminator (an implementation detail) and exposes
/// `runnable` so the UI can dim entries that are declared but not
/// yet wired (e.g. future http-fetch-per-id manifests).
///
/// `capabilities` and `sources` are passed through verbatim because
/// they ARE the public contract the UI consumes.
#[derive(Debug, Serialize)]
struct CorpusItem {
    id: String,
    display_name: String,
    description: Option<String>,
    homepage: Option<String>,
    languages: Vec<String>,
    default_language: String,
    supports_language_fallback: bool,
    fallback_language: Option<String>,
    identifier_label: String,
    identifier_example: Option<String>,
    enabled_by_default: bool,
    runnable: bool,
    capabilities: Capabilities,
    sources: Vec<CorpusSource>,
}

fn project(p: &crate::corpora::plugin::CorpusPlugin) -> CorpusItem {
    CorpusItem {
        id: p.id.clone(),
        display_name: p.display_name.clone(),
        description: p.description.clone(),
        homepage: p.homepage.clone(),
        languages: p.languages.clone(),
        default_language: p.default_language.clone(),
        supports_language_fallback: p.supports_language_fallback,
        fallback_language: p.fallback_language.clone(),
        identifier_label: p.identifier_label.clone(),
        identifier_example: p.identifier_example.clone(),
        enabled_by_default: p.enabled_by_default,
        runnable: p.is_runnable(),
        capabilities: p.capabilities.clone(),
        sources: p.sources.clone(),
    }
}

async fn list_corpora(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
) -> ApiResult {
    let items: Vec<CorpusItem> =
        state.corpus_plugins.iter().map(project).collect();
    Ok(Json(json!({ "corpora": items })))
}

async fn get_corpus(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
    Path(id): Path<String>,
) -> ApiResult {
    let plugin = lookup_plugin(&state, &id)?;
    Ok(Json(serde_json::to_value(project(plugin)).unwrap()))
}

/// Find a corpus plugin by id or 404. Shared helper so the generic
/// handlers all surface the same not-found message.
fn lookup_plugin<'a>(
    state: &'a AppState,
    id: &str,
) -> Result<&'a CorpusPlugin, (StatusCode, Json<Value>)> {
    state
        .corpus_plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| err(StatusCode::NOT_FOUND, &format!("corpus {id:?} not found")))
}

// ---------------------------------------------------------------------------
// POST /corpora/:id/search  — { query, language?, limit? }
// ---------------------------------------------------------------------------
//
// Dispatches to the corpus's declarative adapter (when the manifest
// uses `http-fetch-per-id`). Builtin corpora (EUR-Lex, Italian Legal)
// don't pass through this route yet — they still serve via their own
// `/eurlex/search`, `/italian-legal/search` endpoints. The handler
// returns 501 with a hint so a misconfigured frontend gets a
// readable error instead of a silent miss.

#[derive(Deserialize)]
struct SearchPayload {
    query: String,
    language: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

async fn generic_search(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<SearchPayload>,
) -> ApiResult {
    let plugin = lookup_plugin(&state, &id)?;
    if !plugin.capabilities.search {
        return Err(err(
            StatusCode::METHOD_NOT_ALLOWED,
            &format!("corpus {id} does not declare capabilities.search"),
        ));
    }
    let Some(adapter) = state.corpus_adapters.get(&id) else {
        return Err(err(
            StatusCode::NOT_IMPLEMENTED,
            &format!(
                "corpus {id} has no runtime adapter via the generic router \
                 (likely a builtin corpus — use its dedicated /{id} route instead)"
            ),
        ));
    };

    let q = body.query.trim();
    if q.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "query is empty"));
    }
    let lang = body.language.as_deref();
    let limit = body.limit.unwrap_or(20).min(100);

    // Heuristic: if the query looks like the corpus's identifier
    // example (or contains no whitespace and is short), try
    // search_by_id first; otherwise treat as keyword search. The
    // adapter is responsible for returning a useful one-element
    // result for identifier probes.
    let looks_like_identifier = !q.contains(char::is_whitespace) && q.len() < 64;
    let hits = if looks_like_identifier {
        adapter
            .search_by_id(q, lang)
            .await
            .map_err(|e| err(StatusCode::BAD_GATEWAY, &e.to_string()))?
    } else {
        adapter
            .search_by_keyword(q, lang, limit)
            .await
            .map_err(|e| err(StatusCode::BAD_GATEWAY, &e.to_string()))?
    };
    Ok(Json(json!({ "hits": hits })))
}

// ---------------------------------------------------------------------------
// POST /corpora/:id/fetch  — { identifier, language? }
// ---------------------------------------------------------------------------
//
// Fetches one document via the corpus adapter, stores its bytes in
// the shared hash-keyed cache (same layout as EUR-Lex's
// `cache/<sha256>.txt`), and inserts a `documents` row. Indexing is
// kicked off only when the `rag` feature is built in. Returns the
// new document id + chunk count so the UI can refresh the list.

#[derive(Deserialize)]
struct FetchPayload {
    identifier: String,
    language: Option<String>,
}

async fn generic_fetch(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<FetchPayload>,
) -> ApiResult {
    let plugin = lookup_plugin(&state, &id)?;
    if !plugin.capabilities.fetch {
        return Err(err(
            StatusCode::METHOD_NOT_ALLOWED,
            &format!("corpus {id} does not declare capabilities.fetch"),
        ));
    }
    let Some(adapter) = state.corpus_adapters.get(&id) else {
        return Err(err(
            StatusCode::NOT_IMPLEMENTED,
            &format!(
                "corpus {id} has no runtime adapter via the generic router \
                 (likely a builtin corpus — use its dedicated /{id} route instead)"
            ),
        ));
    };

    let identifier = body.identifier.trim().to_string();
    if identifier.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "identifier is empty"));
    }
    let lang = body
        .language
        .clone()
        .unwrap_or_else(|| plugin.default_language.clone())
        .to_ascii_lowercase();

    // Dedupe by (corpus_id, identifier, language) — same policy the
    // EUR-Lex route uses.
    let existing: Option<(String, String)> = sqlx::query_as(
        "SELECT id, filename FROM documents \
         WHERE user_id = ? AND corpus_id = ? AND corpus_identifier = ? AND corpus_language = ?",
    )
    .bind(&auth.user_id)
    .bind(&plugin.id)
    .bind(&identifier)
    .bind(&lang)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();
    if let Some((eid, fname)) = existing {
        return Ok(Json(json!({
            "id": eid, "filename": fname, "already_indexed": true,
            "corpus_id": plugin.id, "corpus_identifier": identifier,
            "corpus_language": lang,
        })));
    }

    let fetched = adapter
        .fetch(&identifier, Some(&lang), plugin.supports_language_fallback)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, &e.to_string()))?;

    // Hash-keyed cache (same layout as chat attachments + EUR-Lex).
    let hash = {
        let mut h = Sha256::new();
        h.update(&fetched.bytes);
        format!("{:x}", h.finalize())
    };
    let bin_key = format!("cache/{}.txt", hash);
    let storage = make_storage()
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let bin_abs =
        storage_root().join(bin_key.replace('/', std::path::MAIN_SEPARATOR_STR));
    if !bin_abs.exists() {
        storage
            .put(&bin_key, &fetched.bytes, "text/plain; charset=utf-8")
            .await
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    }

    let doc_id = uuid::Uuid::new_v4().to_string();
    let filename = format!(
        "{} ({}).txt",
        fetched.title,
        fetched.language.to_uppercase()
    );
    let size = fetched.bytes.len() as i64;
    sqlx::query(
        "INSERT INTO documents \
           (id, user_id, project_id, filename, file_type, size_bytes, \
            storage_path, status, content_hash, extracted_text_path, \
            corpus_id, corpus_identifier, corpus_language, fetched_with_fallback) \
         VALUES (?, ?, NULL, ?, 'txt', ?, ?, 'syncing', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&doc_id)
    .bind(&auth.user_id)
    .bind(&filename)
    .bind(size)
    .bind(&bin_key)
    .bind(&hash)
    .bind(&bin_key)
    .bind(&plugin.id)
    .bind(&fetched.identifier)
    .bind(&fetched.language)
    .bind(fetched.fetched_with_fallback as i64)
    .execute(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    // Indexing: when rag is on, kick off chunk+embed via the shared
    // helper. When off, just mark ready (text is on disk).
    let text = String::from_utf8_lossy(&fetched.bytes).into_owned();
    let chunk_source_path = bin_abs.to_string_lossy().to_string();
    let (chunks_indexed, indexing_error, final_status) =
        index_text(&state, &auth.user_id, &doc_id, &chunk_source_path, &text).await;

    sqlx::query("UPDATE documents SET status = ? WHERE id = ?")
        .bind(&final_status)
        .bind(&doc_id)
        .execute(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    Ok(Json(json!({
        "id": doc_id,
        "filename": filename,
        "corpus_id": plugin.id,
        "corpus_identifier": fetched.identifier,
        "corpus_language": fetched.language,
        "fetched_with_fallback": fetched.fetched_with_fallback,
        "source_url": fetched.source_url,
        "size_bytes": size,
        "already_indexed": false,
        "chunks_indexed": chunks_indexed,
        "indexing_error": indexing_error,
        "status": final_status,
    })))
}

/// Run chunking + embedding. Tuple semantics identical to
/// `eurlex.rs::run_indexing` (kept separate to avoid cross-module
/// pub coupling on a 20-line helper).
async fn index_text(
    state: &AppState,
    user_id: &str,
    doc_id: &str,
    source_path: &str,
    text: &str,
) -> (usize, Option<String>, String) {
    #[cfg(feature = "rag")]
    {
        if let Some(emb) = state.embeddings.clone() {
            return match emb
                .index_document(user_id, None, doc_id, source_path, text)
                .await
            {
                Ok(0) => {
                    let msg = format!(
                        "Indicizzazione completata ma 0 chunk creati (testo: {} caratteri).",
                        text.len()
                    );
                    (0, Some(msg), "interrupted".to_string())
                }
                Ok(n) => (n, None, "ready".to_string()),
                Err(e) => (0, Some(e.to_string()), "interrupted".to_string()),
            };
        }
    }
    let _ = (state, user_id, doc_id, source_path, text);
    (0, None, "ready".to_string())
}

// ---------------------------------------------------------------------------
// GET /corpora/:id/documents — list docs the user synced for this corpus
// ---------------------------------------------------------------------------

async fn generic_list_documents(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> ApiResult {
    let plugin = lookup_plugin(&state, &id)?;
    if !plugin.capabilities.documents {
        return Err(err(
            StatusCode::METHOD_NOT_ALLOWED,
            &format!("corpus {id} does not declare capabilities.documents"),
        ));
    }

    let rows: Vec<(
        String,
        String,
        Option<String>,
        Option<String>,
        i64,
        i64,
        String,
        String,
    )> = sqlx::query_as(
        "SELECT id, filename, corpus_identifier, corpus_language, \
                fetched_with_fallback, size_bytes, created_at, status \
         FROM documents \
         WHERE user_id = ? AND corpus_id = ? \
         ORDER BY created_at DESC",
    )
    .bind(&auth.user_id)
    .bind(&id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let docs: Vec<Value> = rows
        .into_iter()
        .map(|(doc_id, filename, ident, lang, fb, size, created, status)| {
            json!({
                "id": doc_id, "filename": filename,
                "corpus_identifier": ident, "corpus_language": lang,
                "fetched_with_fallback": fb != 0,
                "size_bytes": size, "created_at": created, "status": status,
            })
        })
        .collect();
    Ok(Json(json!({ "documents": docs })))
}
