//! `/docx-templates` — read-only view onto the DOCX template registry
//! loaded from `config/docx-templates/<domain>/<slug>.json` at startup.
//!
//! Each entry is a "closing formatter" template — sidecar JSON metadata
//! plus a companion `.dotx` Word file. The frontend consumes this
//! endpoint to populate the Settings → Templates DOCX picker and the
//! "Default output template" combo in the workflow editor.
//!
//! No write endpoint today — to add or modify a template, drop the
//! `.dotx` + sidecar pair into the right folder and restart. Follows
//! the same JSON-driven pattern as workflows / column-presets / models.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{auth::middleware::AuthUser, AppState};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_docx_templates))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    /// Optional domain filter — `?domain=legal` returns only templates
    /// in the canonical-domain "legal" bucket. Omit to get all.
    domain: Option<String>,
    /// Optional locale filter — `?locale=it` returns templates whose
    /// `locale` field starts with `"it"`. Omit to get all.
    locale: Option<String>,
}

async fn list_docx_templates(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
    Query(q): Query<ListQuery>,
) -> ApiResult {
    let items: Vec<Value> = state
        .docx_templates
        .iter()
        .filter(|t| q.domain.as_deref().is_none_or(|d| t.domain == d))
        .filter(|t| {
            q.locale
                .as_deref()
                .is_none_or(|l| t.locale.starts_with(l))
        })
        .map(|t| t.to_api_json())
        .collect();
    Ok(Json(json!({ "docx_templates": items })))
}
