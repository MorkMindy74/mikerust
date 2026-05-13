//! `/column-presets` — read-only view onto the in-memory column-preset
//! registry loaded from `column-presets/<domain>/*.json` at startup.
//!
//! Used by the AddColumnModal in the tabular-review UI to suggest a
//! name/format/prompt triple when the user starts typing a column
//! title. The matching regex is sent over the wire as `match_pattern`
//! + `match_flags`; the frontend reconstructs `new RegExp(...)` at use
//! time so the JSON stays portable.
//!
//! No write endpoint today — to add a new preset, drop a JSON file
//! into the right `column-presets/<domain>/` folder and restart.
//! Workflow presets are served via the existing `/workflow` endpoint
//! (merged into the list response).

use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{auth::middleware::AuthUser, AppState};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_column_presets))
}

async fn list_column_presets(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
) -> ApiResult {
    let items: Vec<Value> = state
        .column_presets
        .iter()
        .map(|p| {
            json!({
                "name": p.name,
                "match_pattern": p.match_pattern,
                "match_flags": p.match_flags,
                "prompt": p.prompt,
                "format": p.format,
                "domain": p.domain,
                "tags": p.tags,
            })
        })
        .collect();
    Ok(Json(json!({ "column_presets": items })))
}
