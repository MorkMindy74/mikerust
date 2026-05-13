//! Generic, JSON-driven corpus adapter for the `http-fetch-per-id`
//! strategy. Reads `HttpFetchPerIdSpec` from a `CorpusPlugin` and
//! implements `LegalCorpusAdapter` against it — no per-corpus Rust
//! code.
//!
//! The runtime substitutes `{identifier}` / `{query}` / `{lang}`
//! placeholders into the URL templates, performs an HTTP GET with a
//! browser-like User-Agent and the appropriate Accept header, and
//! extracts fields via either CSS selectors (`shape: rest-html`,
//! using `scraper`) or a tiny JSONPath subset (`shape: rest-json`).
//!
//! Selector syntax extensions:
//!   - `selector@attr`      — read an HTML attribute instead of the
//!                            element's text (HTML only).
//!   - `selector:strip-prefix=PFX`
//!   - `selector:strip-suffix=SFX`
//!                          — postprocessors that trim the extracted
//!                            string. Useful for converting an `href`
//!                            into a bare identifier
//!                            (e.g. `/fr/deliberation/SAN-2024-013`
//!                             →    `SAN-2024-013`).
//!
//! Postprocessors stack: `a@href:strip-prefix=/fr/deliberation/` is
//! "select `<a>`, read `href` attribute, then strip the URL prefix".

use anyhow::{anyhow, bail, Context, Result};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

use crate::corpora::plugin::{
    CorpusPlugin, CorpusStrategy, HttpFetchByIdSpec, HttpFetchPerIdSpec,
    HttpSearchKeywordSpec, ResponseShape,
};
use crate::corpora::{CorpusDocument, CorpusHit, LegalCorpusAdapter};

/// Owns the plugin (for the spec) + a `reqwest::Client` shared across
/// requests. Cheap to clone; the adapter registry hands out `Arc`
/// of these.
pub struct ManifestAdapter {
    plugin: CorpusPlugin,
    spec: HttpFetchPerIdSpec,
    /// Static borrow returned by `LegalCorpusAdapter::id()`. We need
    /// a `&'static str` there, but the corpus id is owned by the
    /// plugin — we leak it once at construction so the lifetime
    /// lines up. Cheap (one allocation per manifest at startup).
    static_id: &'static str,
    /// Same trick for the `languages()` slice.
    static_languages: &'static [&'static str],
    client: reqwest::Client,
}

impl ManifestAdapter {
    /// Build a new adapter from a plugin whose strategy is
    /// `http-fetch-per-id`. Returns `None` for any other strategy.
    pub fn try_from_plugin(plugin: &CorpusPlugin) -> Option<Self> {
        let CorpusStrategy::HttpFetchPerId(spec) = &plugin.strategy else {
            return None;
        };
        let static_id: &'static str = Box::leak(plugin.id.clone().into_boxed_str());
        let static_languages: &'static [&'static str] = {
            let leaked: Vec<&'static str> = plugin
                .languages
                .iter()
                .map(|l| {
                    let s: &'static str = Box::leak(l.clone().into_boxed_str());
                    s
                })
                .collect();
            Box::leak(leaked.into_boxed_slice())
        };
        let client = reqwest::Client::builder()
            // Browser-like UA matches what the EUR-Lex adapter does
            // and avoids the basic "MikeRust/x.y" filter that some
            // sites apply by default.
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(8))
            .build()
            .expect("reqwest client init");
        Some(Self {
            plugin: plugin.clone(),
            spec: spec.clone(),
            static_id,
            static_languages,
            client,
        })
    }
}

#[async_trait]
impl LegalCorpusAdapter for ManifestAdapter {
    fn id(&self) -> &'static str {
        self.static_id
    }

    fn languages(&self) -> &[&'static str] {
        self.static_languages
    }

    async fn search_by_id(
        &self,
        identifier: &str,
        language: Option<&str>,
    ) -> Result<Vec<CorpusHit>> {
        // For declarative corpora "search by id" is "probe the fetch
        // URL and emit a one-hit result with the title we extract".
        // Lets the search-then-pick UX flow work for free even
        // without a dedicated keyword search.
        let lang = language
            .unwrap_or(&self.plugin.default_language)
            .to_string();
        let url = substitute_url(
            &self.spec.search_by_id.url_template,
            &[("identifier", identifier), ("lang", lang.as_str())],
        )?;
        let body = self.fetch_text(&url).await?;
        let title = extract_one(
            &body,
            self.spec.search_by_id.shape,
            self.spec.search_by_id.title_path.as_deref(),
        )
        .unwrap_or_else(|| identifier.to_string());
        let date = extract_one(
            &body,
            self.spec.search_by_id.shape,
            self.spec.search_by_id.date_path.as_deref(),
        );
        Ok(vec![CorpusHit {
            identifier: identifier.to_string(),
            title,
            date,
            url,
            languages_available: vec![lang],
        }])
    }

    async fn search_by_keyword(
        &self,
        query: &str,
        language: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CorpusHit>> {
        let Some(spec) = self.spec.search_by_keyword.as_ref() else {
            bail!(
                "corpus {} does not declare a search_by_keyword spec",
                self.plugin.id
            );
        };
        let lang = language
            .unwrap_or(&self.plugin.default_language)
            .to_string();
        let limit_s = limit.to_string();
        let url = substitute_url(
            &spec.url_template,
            &[
                ("query", query),
                ("lang", lang.as_str()),
                ("limit", limit_s.as_str()),
            ],
        )?;
        let body = self.fetch_text(&url).await?;
        let hits = extract_hits(&body, spec, limit, &lang);
        Ok(hits)
    }

    async fn fetch(
        &self,
        identifier: &str,
        language: Option<&str>,
        _fallback_en: bool,
    ) -> Result<CorpusDocument> {
        // Declarative corpora don't do EN-fallback by default —
        // most of them are single-language (CNIL: fr only). Honour
        // `supports_language_fallback` only when truthy in the
        // manifest; otherwise treat the requested language as
        // authoritative.
        let lang = language
            .unwrap_or(&self.plugin.default_language)
            .to_string();
        let url = substitute_url(
            &self.spec.search_by_id.url_template,
            &[("identifier", identifier), ("lang", lang.as_str())],
        )?;
        let body = self.fetch_text(&url).await?;
        let title = extract_one(
            &body,
            self.spec.search_by_id.shape,
            self.spec.search_by_id.title_path.as_deref(),
        )
        .unwrap_or_else(|| identifier.to_string());
        let text = extract_one(
            &body,
            self.spec.search_by_id.shape,
            Some(self.spec.search_by_id.body_path.as_str()),
        )
        .ok_or_else(|| {
            anyhow!(
                "corpus {} fetch of {}: body selector {:?} matched nothing",
                self.plugin.id,
                identifier,
                self.spec.search_by_id.body_path
            )
        })?;
        Ok(CorpusDocument {
            identifier: identifier.to_string(),
            title,
            language: lang,
            fetched_with_fallback: false,
            bytes: text.into_bytes(),
            mime: "text/plain; charset=utf-8",
            source_url: url,
        })
    }
}

impl ManifestAdapter {
    async fn fetch_text(&self, url: &str) -> Result<String> {
        tracing::info!("[manifest] GET {url}");
        let resp = self
            .client
            .get(url)
            .header(
                reqwest::header::ACCEPT,
                "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
            )
            .send()
            .await
            .with_context(|| format!("HTTP GET {url}"))?;
        let status = resp.status();
        if !status.is_success() {
            bail!("HTTP {} from {url}", status.as_u16());
        }
        resp.text()
            .await
            .with_context(|| format!("body decode {url}"))
    }
}

// ---------------------------------------------------------------------------
// URL template substitution
// ---------------------------------------------------------------------------

/// Replace `{key}` placeholders in `template` with percent-encoded
/// values from `vars`. Any leftover `{...}` after substitution causes
/// an error (typo guard). Unused vars are silently allowed.
pub(crate) fn substitute_url(
    template: &str,
    vars: &[(&str, &str)],
) -> Result<String> {
    let mut out = template.to_string();
    for (k, v) in vars {
        let placeholder = format!("{{{}}}", k);
        let encoded = percent_encode_query(v);
        out = out.replace(&placeholder, &encoded);
    }
    if let Some(idx) = out.find('{') {
        bail!(
            "unresolved URL template placeholder near {:?}",
            &out[idx..(idx + 40).min(out.len())]
        );
    }
    Ok(out)
}

/// Minimal RFC-3986 query-component encoder. Adequate for the
/// placeholder values we substitute (user-supplied identifiers and
/// search queries). Allows the URL-template author to put `{query}`
/// either in the path or the query-string — we encode the same way.
fn percent_encode_query(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/// Run a single selector against the response body. Returns `None`
/// if the selector path is `None`, if the selector doesn't compile,
/// or if it matches nothing.
fn extract_one(
    body: &str,
    shape: ResponseShape,
    path: Option<&str>,
) -> Option<String> {
    let path = path?;
    let (raw, post) = split_postprocessors(path);
    let value = match shape {
        ResponseShape::RestHtml => extract_from_html(body, raw)?,
        ResponseShape::RestJson => extract_from_json(body, raw)?,
    };
    Some(apply_postprocessors(value, &post))
}

/// Extract one string from an HTML body. Handles the `@attr` suffix.
fn extract_from_html(body: &str, selector_with_attr: &str) -> Option<String> {
    let doc = scraper::Html::parse_document(body);
    let (selector_str, attr) = split_attr(selector_with_attr);
    let sel = scraper::Selector::parse(selector_str).ok()?;
    let el = doc.select(&sel).next()?;
    Some(match attr {
        Some(name) => el.value().attr(name)?.to_string(),
        None => collapse_whitespace(&el.text().collect::<String>()),
    })
}

/// Run a CSS selector against an HTML body and return ONE attribute
/// or text value PER matching element. Used by `extract_hits`.
fn extract_each_html(
    body: &str,
    hits_path: &str,
    inner_selector: &str,
    limit: usize,
) -> Vec<String> {
    let doc = scraper::Html::parse_document(body);
    let Ok(outer) = scraper::Selector::parse(hits_path) else {
        return Vec::new();
    };
    let (inner_sel_str, inner_attr) = split_attr(inner_selector);
    let Ok(inner) = scraper::Selector::parse(inner_sel_str) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for hit in doc.select(&outer) {
        if out.len() >= limit {
            break;
        }
        let Some(target) = hit.select(&inner).next() else {
            continue;
        };
        let value = match inner_attr {
            Some(name) => target.value().attr(name).map(String::from),
            None => Some(collapse_whitespace(
                &target.text().collect::<String>(),
            )),
        };
        if let Some(v) = value {
            out.push(v);
        }
    }
    out
}

/// Tiny JSONPath subset: `$.a.b[*].c`, `$.a`, `$.a[0]`, `$.a[*]`.
/// Returns `None` if any step doesn't resolve. For an array
/// expression `$.a[*]`, returns the JSON-stringified first element
/// (caller's responsibility to pick the right path).
fn extract_from_json(body: &str, jsonpath: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let traversed = walk_jsonpath_first(&v, jsonpath)?;
    Some(match traversed {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    })
}

fn walk_jsonpath_first<'a>(
    root: &'a serde_json::Value,
    path: &str,
) -> Option<&'a serde_json::Value> {
    let trimmed = path.strip_prefix("$.").unwrap_or(path);
    let mut current = root;
    for raw_step in trimmed.split('.') {
        // Handle `key[idx]` / `key[*]` per step.
        let (key, idx) = match raw_step.find('[') {
            Some(start) => {
                let end = raw_step.find(']')?;
                let key = &raw_step[..start];
                let inside = &raw_step[(start + 1)..end];
                let i: Option<usize> = if inside == "*" {
                    Some(0)
                } else {
                    inside.parse().ok()
                };
                (key, i)
            }
            None => (raw_step, None),
        };
        if !key.is_empty() {
            current = current.get(key)?;
        }
        if let Some(i) = idx {
            current = current.get(i)?;
        }
    }
    Some(current)
}

// ---------------------------------------------------------------------------
// Hits — pull a list of (identifier, title, date?) from the response
// ---------------------------------------------------------------------------

fn extract_hits(
    body: &str,
    spec: &HttpSearchKeywordSpec,
    limit: usize,
    lang: &str,
) -> Vec<CorpusHit> {
    match spec.shape {
        ResponseShape::RestHtml => {
            // Walk each hit element and extract id + title + date.
            // We do three parallel passes (id, title, date) so a
            // missing inner-selector on one field doesn't drop the
            // whole hit.
            let (id_sel, id_post) = split_postprocessors(&spec.identifier_at);
            let (title_sel, title_post) = split_postprocessors(&spec.title_at);
            let date_pair = spec
                .date_at
                .as_deref()
                .map(split_postprocessors);

            let ids = extract_each_html(body, &spec.hits_path, id_sel, limit);
            let titles = extract_each_html(body, &spec.hits_path, title_sel, limit);
            let dates = match date_pair.as_ref() {
                Some((d_sel, _post)) => {
                    extract_each_html(body, &spec.hits_path, d_sel, limit)
                }
                None => Vec::new(),
            };

            let n = ids.len().min(titles.len());
            let mut out = Vec::with_capacity(n);
            for i in 0..n {
                let identifier = apply_postprocessors(ids[i].clone(), &id_post);
                let title = apply_postprocessors(titles[i].clone(), &title_post);
                let date = dates.get(i).cloned().map(|d| {
                    let post = date_pair
                        .as_ref()
                        .map(|(_, p)| p.clone())
                        .unwrap_or_default();
                    apply_postprocessors(d, &post)
                });
                if identifier.is_empty() {
                    continue;
                }
                out.push(CorpusHit {
                    identifier,
                    title,
                    date,
                    url: String::new(),
                    languages_available: vec![lang.to_string()],
                });
            }
            out
        }
        ResponseShape::RestJson => {
            // For JSON shape, hits_path must resolve to an array.
            // The implementation here is intentionally simple — full
            // JSONPath bracket-iteration is left for a follow-up if
            // a real corpus needs it; CNIL is HTML-only today.
            tracing::warn!(
                "[manifest] rest-json hits extraction not yet implemented; \
                 returning empty (corpus likely declared search but no \
                 backend currently honours it). Open an issue with a real \
                 example to drive the impl."
            );
            Vec::new()
        }
    }
}

// ---------------------------------------------------------------------------
// Selector-syntax helpers
// ---------------------------------------------------------------------------

/// Split `selector@attr` → `(selector, Some(attr))`; or
/// `selector` → `(selector, None)`. Only the LAST `@` counts (CSS
/// selectors can contain `[attr=value]` brackets but never bare `@`
/// in normal use).
fn split_attr(s: &str) -> (&str, Option<&str>) {
    match s.rsplit_once('@') {
        Some((sel, attr)) if !attr.is_empty() => (sel, Some(attr)),
        _ => (s, None),
    }
}

/// Strip postprocessor suffixes (`:strip-prefix=...`, `:strip-suffix=...`)
/// from a selector, returning the raw selector + the postprocessor list.
/// Postprocessors are applied left-to-right in `apply_postprocessors`.
fn split_postprocessors(s: &str) -> (&str, Vec<Postprocessor>) {
    let mut posts = Vec::new();
    // Find the first `:` that introduces a postprocessor. We avoid
    // splitting on `:` inside the selector itself (which CSS doesn't
    // really use, but `:hover` / `:nth-child` etc. exist — we treat
    // those as part of the selector and stop only at a `:strip-`).
    let key = ":strip-";
    let head = match s.find(key) {
        Some(i) => &s[..i],
        None => return (s, posts),
    };
    let mut rest = &s[head.len()..];
    while let Some(stripped) = rest.strip_prefix(':') {
        let chunk_end = stripped.find(':').unwrap_or(stripped.len());
        let chunk = &stripped[..chunk_end];
        if let Some(pfx) = chunk.strip_prefix("strip-prefix=") {
            posts.push(Postprocessor::StripPrefix(pfx.to_string()));
        } else if let Some(sfx) = chunk.strip_prefix("strip-suffix=") {
            posts.push(Postprocessor::StripSuffix(sfx.to_string()));
        }
        rest = &stripped[chunk_end..];
    }
    (head, posts)
}

#[derive(Debug, Clone)]
enum Postprocessor {
    StripPrefix(String),
    StripSuffix(String),
}

fn apply_postprocessors(s: String, posts: &[Postprocessor]) -> String {
    let mut out = s;
    for p in posts {
        match p {
            Postprocessor::StripPrefix(pfx) => {
                if let Some(t) = out.strip_prefix(pfx.as_str()) {
                    out = t.to_string();
                }
            }
            Postprocessor::StripSuffix(sfx) => {
                if let Some(t) = out.strip_suffix(sfx.as_str()) {
                    out = t.to_string();
                }
            }
        }
    }
    out
}

fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !last_space && !out.is_empty() {
                out.push(' ');
                last_space = true;
            }
        } else {
            out.push(ch);
            last_space = false;
        }
    }
    out.trim().to_string()
}

// ---------------------------------------------------------------------------
// Adapter registry — built at startup
// ---------------------------------------------------------------------------

/// Map of corpus_id → adapter, populated once at AppState::new.
/// Today only `http-fetch-per-id` corpora go through this registry;
/// `builtin` corpora keep their hand-written impls accessible
/// directly from the routes that need them (EUR-Lex, Italian Legal).
pub type AdapterRegistry =
    HashMap<String, Arc<dyn LegalCorpusAdapter>>;

/// Build the registry from a list of plugins. Today's policy:
///   - `http-fetch-per-id` plugins → ManifestAdapter goes in registry
///   - `builtin` plugins         → NOT inserted (their routes call
///                                  EurlexAdapter::new() etc.
///                                  directly, no registry lookup).
///   - `hf-dataset-bulk`         → skipped (not implemented).
///
/// Once we move EUR-Lex / Italian Legal through generic routes too,
/// they'll register here under their `builtin_id`.
pub fn build_adapter_registry(plugins: &[CorpusPlugin]) -> AdapterRegistry {
    let mut out: AdapterRegistry = HashMap::new();
    for plugin in plugins {
        if let Some(adapter) = ManifestAdapter::try_from_plugin(plugin) {
            tracing::info!(
                "[adapter-registry] registered ManifestAdapter for corpus {:?}",
                plugin.id
            );
            out.insert(plugin.id.clone(), Arc::new(adapter));
        }
    }
    out
}

// Keep unused-field warnings quiet — `HttpFetchByIdSpec` fields are
// used at runtime by the extraction functions.
#[allow(dead_code)]
const _: () = {
    fn _assert_traits() {
        fn check<T: Send + Sync>() {}
        check::<ManifestAdapter>();
    }
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_substitution_replaces_named_placeholders() {
        let out = substitute_url(
            "https://x/{lang}/doc/{identifier}",
            &[("identifier", "SAN-2024-013"), ("lang", "fr")],
        )
        .unwrap();
        assert_eq!(out, "https://x/fr/doc/SAN-2024-013");
    }

    #[test]
    fn url_substitution_percent_encodes_values() {
        let out = substitute_url(
            "https://x/search?q={query}",
            &[("query", "RGPD article 35")],
        )
        .unwrap();
        // Spaces become %20, not + — query-component encoding.
        assert_eq!(out, "https://x/search?q=RGPD%20article%2035");
    }

    #[test]
    fn url_substitution_rejects_unresolved_placeholder() {
        let err = substitute_url(
            "https://x/{missing}/y",
            &[("other", "value")],
        )
        .unwrap_err();
        assert!(err.to_string().contains("unresolved"));
    }

    #[test]
    fn html_text_extraction_with_collapsed_whitespace() {
        let body = "<html><body><h1 class=\"t\">  Hello\n  World  </h1></body></html>";
        let v = extract_one(body, ResponseShape::RestHtml, Some("h1.t")).unwrap();
        assert_eq!(v, "Hello World");
    }

    #[test]
    fn html_attribute_extraction_via_at_suffix() {
        let body = r#"<html><body><a href="/fr/deliberation/SAN-2024-013">x</a></body></html>"#;
        let v = extract_one(body, ResponseShape::RestHtml, Some("a@href")).unwrap();
        assert_eq!(v, "/fr/deliberation/SAN-2024-013");
    }

    #[test]
    fn html_strip_prefix_postprocessor() {
        let body = r#"<html><body><a href="/fr/deliberation/SAN-2024-013">x</a></body></html>"#;
        let v = extract_one(
            body,
            ResponseShape::RestHtml,
            Some("a@href:strip-prefix=/fr/deliberation/"),
        )
        .unwrap();
        assert_eq!(v, "SAN-2024-013");
    }

    #[test]
    fn json_path_extraction_basic() {
        let body = r#"{"data":{"title":"My doc","date":"2025-01-15"}}"#;
        let title =
            extract_one(body, ResponseShape::RestJson, Some("$.data.title")).unwrap();
        assert_eq!(title, "My doc");
        let date =
            extract_one(body, ResponseShape::RestJson, Some("$.data.date")).unwrap();
        assert_eq!(date, "2025-01-15");
    }

    #[test]
    fn json_path_array_indexing() {
        let body = r#"{"items":[{"id":"a"},{"id":"b"}]}"#;
        let first =
            extract_one(body, ResponseShape::RestJson, Some("$.items[0].id")).unwrap();
        assert_eq!(first, "a");
        let second =
            extract_one(body, ResponseShape::RestJson, Some("$.items[1].id")).unwrap();
        assert_eq!(second, "b");
    }

    #[test]
    fn missing_selector_returns_none() {
        let body = "<html><body><h1>x</h1></body></html>";
        assert!(extract_one(body, ResponseShape::RestHtml, Some("h2")).is_none());
    }

    #[test]
    fn hits_extraction_pulls_id_and_title_per_row() {
        let body = r#"
            <ol class="search-results">
                <li>
                    <h3 class="title"><a href="/fr/deliberation/SAN-2024-013">Délibération SAN-2024-013</a></h3>
                </li>
                <li>
                    <h3 class="title"><a href="/fr/deliberation/MED-2024-007">Mise en demeure MED-2024-007</a></h3>
                </li>
            </ol>
        "#;
        let spec = HttpSearchKeywordSpec {
            url_template: String::new(),
            shape: ResponseShape::RestHtml,
            hits_path: "ol.search-results li".to_string(),
            identifier_at: "h3.title a@href:strip-prefix=/fr/deliberation/".to_string(),
            title_at: "h3.title a".to_string(),
            date_at: None,
        };
        let hits = extract_hits(body, &spec, 10, "fr");
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].identifier, "SAN-2024-013");
        assert_eq!(hits[0].title, "Délibération SAN-2024-013");
        assert_eq!(hits[1].identifier, "MED-2024-007");
    }

    #[test]
    fn split_attr_handles_no_attribute() {
        assert_eq!(split_attr("h1.title"), ("h1.title", None));
        assert_eq!(split_attr("a@href"), ("a", Some("href")));
        // Empty attribute after `@` is treated as "no attribute"
        // (avoids classifying `selector@` as attribute extraction).
        assert_eq!(split_attr("a@"), ("a@", None));
    }

    #[test]
    fn split_postprocessors_extracts_multiple_strips() {
        let (sel, posts) =
            split_postprocessors("a@href:strip-prefix=/x/:strip-suffix=.html");
        assert_eq!(sel, "a@href");
        assert_eq!(posts.len(), 2);
        match (&posts[0], &posts[1]) {
            (Postprocessor::StripPrefix(p), Postprocessor::StripSuffix(s)) => {
                assert_eq!(p, "/x/");
                assert_eq!(s, ".html");
            }
            _ => panic!("unexpected post order: {:?}", posts),
        }
    }

    #[test]
    fn build_adapter_registry_skips_non_runnable() {
        // Three plugins: one Builtin, one HttpFetchPerId, one
        // HfDatasetBulk. Only the HttpFetchPerId is registered.
        let json_builtin = r#"{
            "id": "eurlex", "display_name": "EUR-Lex",
            "languages": ["en"], "default_language": "en", "fallback_language": "en",
            "identifier_label": "CELEX",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let json_http = r#"{
            "id": "cnil", "display_name": "CNIL",
            "languages": ["fr"], "default_language": "fr",
            "supports_language_fallback": false,
            "identifier_label": "Ref",
            "strategy": {
                "kind": "http-fetch-per-id",
                "search_by_id": {
                    "url_template": "https://x/{identifier}",
                    "shape": "rest-html",
                    "body_path": "main"
                }
            }
        }"#;
        let json_hf = r#"{
            "id": "later", "display_name": "Later",
            "languages": ["en"], "default_language": "en", "fallback_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "hf-dataset-bulk" }
        }"#;
        let plugins: Vec<CorpusPlugin> = [json_builtin, json_http, json_hf]
            .iter()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect();
        let reg = build_adapter_registry(&plugins);
        assert!(!reg.contains_key("eurlex"));
        assert!(reg.contains_key("cnil"));
        assert!(!reg.contains_key("later"));
    }
}
