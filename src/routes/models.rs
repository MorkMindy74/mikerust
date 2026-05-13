//! `/models` — read-only view onto the LLM provider/model/region
//! catalogue loaded from `config/model.json` at startup.
//!
//! Consumed by the Settings → Modelli LLM page to drive the provider
//! sections, the model dropdowns, and the region dropdowns. The shape
//! is the catalogue JSON verbatim (`{ providers: [...] }`).
//!
//! No write endpoint — to change the catalogue, edit `config/model.json`
//! and restart.

use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{auth::middleware::AuthUser, AppState};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_models))
}

async fn list_models(
    State(state): State<Arc<AppState>>,
    _auth: AuthUser,
) -> ApiResult {
    let payload = serde_json::to_value(state.model_catalogue.as_ref())
        .unwrap_or_else(|_| json!({ "providers": [] }));
    Ok(Json(payload))
}
