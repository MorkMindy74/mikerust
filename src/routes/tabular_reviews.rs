use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{auth::middleware::AuthUser, AppState};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({"detail": msg})))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_tabular_reviews).post(create_tabular_review))
        .route("/{id}", get(get_tabular_review).delete(delete_tabular_review))
}

// ---------------------------------------------------------------------------
// GET /tabular-review?project_id=...
// ---------------------------------------------------------------------------
#[derive(Deserialize)]
struct ListQuery {
    project_id: Option<String>,
    /// Optional `?domain=legal|medical|…` filter added with migration 0018.
    domain: Option<String>,
}

type TabularReviewRow = (
    String,         // id
    String,         // title
    Option<String>, // project_id
    Option<String>, // workflow_id
    String,         // columns_config (JSON)
    String,         // created_at
    String,         // updated_at
    String,         // domain (0018, default 'legal')
);

async fn list_tabular_reviews(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ListQuery>,
) -> ApiResult {
    let domain_filter = q
        .domain
        .as_deref()
        .filter(|s| !s.is_empty() && crate::domain::is_valid(s));

    let mut sql = String::from(
        "SELECT id, title, project_id, workflow_id, columns_config, created_at, updated_at, domain \
         FROM tabular_reviews WHERE user_id = ?",
    );
    if q.project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    if domain_filter.is_some() {
        sql.push_str(" AND domain = ?");
    }
    sql.push_str(" ORDER BY updated_at DESC");

    let mut query = sqlx::query_as::<_, TabularReviewRow>(&sql).bind(&auth.user_id);
    if let Some(ref pid) = q.project_id {
        query = query.bind(pid);
    }
    if let Some(d) = domain_filter {
        query = query.bind(d);
    }
    let rows: Vec<TabularReviewRow> = query
        .fetch_all(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let reviews: Vec<Value> = rows
        .into_iter()
        .map(|(id, title, project_id, workflow_id, columns_config, created_at, updated_at, domain)| {
            json!({
                "id": id,
                "title": title,
                "project_id": project_id,
                "workflow_id": workflow_id,
                "columns_config": serde_json::from_str::<Value>(&columns_config).unwrap_or(json!([])),
                "domain": domain,
                "created_at": created_at,
                "updated_at": updated_at
            })
        })
        .collect();

    Ok(Json(json!(reviews)))
}

// ---------------------------------------------------------------------------
// POST /tabular-review
// ---------------------------------------------------------------------------
#[derive(Deserialize)]
struct CreateTabularReviewBody {
    title: Option<String>,
    project_id: Option<String>,
    workflow_id: Option<String>,
    columns_config: Option<Value>,
    /// Domain inherited from the source workflow at creation time;
    /// caller can override to bridge cross-domain reviews. Falls back
    /// to `legal` (schema default) when unset/invalid.
    domain: Option<String>,
}

async fn create_tabular_review(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<CreateTabularReviewBody>,
) -> ApiResult {
    let id = uuid::Uuid::new_v4().to_string();
    let title = body.title.unwrap_or_else(|| "Untitled Review".to_string());
    let columns_config = body.columns_config.unwrap_or(json!([])).to_string();
    let dom = crate::domain::normalise_or_default(body.domain.as_deref());

    sqlx::query(
        "INSERT INTO tabular_reviews (id, user_id, project_id, workflow_id, title, columns_config, domain) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&auth.user_id)
    .bind(&body.project_id)
    .bind(&body.workflow_id)
    .bind(&title)
    .bind(&columns_config)
    .bind(dom)
    .execute(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    Ok(Json(json!({ "id": id, "title": title, "domain": dom })))
}

// ---------------------------------------------------------------------------
// GET /tabular-review/:id
// ---------------------------------------------------------------------------
async fn get_tabular_review(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> ApiResult {
    let row: Option<TabularReviewRow> = sqlx::query_as(
        "SELECT id, title, project_id, workflow_id, columns_config, created_at, updated_at, domain \
         FROM tabular_reviews WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    let (id, title, project_id, workflow_id, columns_config, created_at, updated_at, domain) =
        row.ok_or_else(|| err(StatusCode::NOT_FOUND, "Tabular review not found"))?;

    Ok(Json(json!({
        "id": id,
        "title": title,
        "project_id": project_id,
        "workflow_id": workflow_id,
        "columns_config": serde_json::from_str::<Value>(&columns_config).unwrap_or(json!([])),
        "domain": domain,
        "created_at": created_at,
        "updated_at": updated_at
    })))
}

// ---------------------------------------------------------------------------
// DELETE /tabular-review/:id
// ---------------------------------------------------------------------------
async fn delete_tabular_review(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> ApiResult {
    let result = sqlx::query("DELETE FROM tabular_reviews WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err(err(StatusCode::NOT_FOUND, "Tabular review not found"));
    }
    Ok(Json(json!({ "ok": true })))
}
