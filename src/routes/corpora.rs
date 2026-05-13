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

use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{
    auth::middleware::AuthUser,
    corpora::plugin::{Capabilities, CorpusSource},
    AppState,
};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_corpora))
        .route("/{id}", get(get_corpus))
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
    axum::extract::Path(id): axum::extract::Path<String>,
) -> ApiResult {
    let Some(p) = state.corpus_plugins.iter().find(|p| p.id == id) else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": format!("corpus {:?} not found", id) })),
        ));
    };
    Ok(Json(serde_json::to_value(project(p)).unwrap()))
}
