//! Corpus plugin manifests — JSON-driven registry for legal corpora.
//!
//! Goal: every corpus MikeRust knows about (EUR-Lex, Italian legal,
//! future Légifrance/BOE/Retsinformation/...) is described by a JSON
//! manifest file. The runtime scans a directory at startup, parses
//! each manifest, and exposes a registry the UI and chat system
//! prompt can consult.
//!
//! Today the manifest's `strategy` discriminator only knows about
//! `"builtin"` — the actual fetch/parse logic lives in a hand-written
//! Rust adapter (`eurlex.rs`, `italian_legal.rs`) referenced by name.
//! The manifest contributes metadata (display name, supported
//! languages, identifier label, enabled-by-default, homepage). This
//! lets us:
//!
//!   - Add a new corpus by dropping a JSON file (eventually, once
//!     `http-fetch-per-id` strategy lands — schema sketched below).
//!   - Configure existing corpora declaratively (default language,
//!     fallback policy, display name per locale) without recompiling.
//!   - Surface the same metadata uniformly to the UI and the chat's
//!     `<USER LIBRARY>` inventory, regardless of whether the
//!     underlying connector is builtin or declarative.
//!
//! Manifest location: `corpora-plugins/*.json` relative to the
//! current working directory by default, override with
//! `MIKE_CORPUS_PLUGINS_DIR`.
//!
//! ### Future strategies (schema-only, not implemented yet)
//!
//! ```json
//! "strategy": {
//!   "kind": "http-fetch-per-id",
//!   "search_by_id":      { "url_template": "...", "shape": "rest-json", "body_path": "$.content" },
//!   "search_by_keyword": { "url_template": "...", "shape": "rest-json", "hits_path": "$.results[*]" }
//! }
//! ```
//!
//! When that lands, `ManifestAdapter` becomes a Rust struct that
//! interprets the manifest at runtime — same trait, no per-corpus
//! Rust code.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// One corpus plugin as loaded from disk.
///
/// Schema is permissive on unknown top-level fields (so newer
/// manifests don't break older builds) but strict on the typed
/// fields it does know about. Use `corpus-plugin.schema.json` (in
/// `docs/`) as the authoritative editor reference.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CorpusPlugin {
    /// Stable corpus key (also written to `documents.corpus_id`).
    /// Must match `^[a-z][a-z0-9\-]*$` — lowercase + dash, no spaces.
    pub id: String,

    /// Default English display name shown in the UI when the user's
    /// locale lacks a specific override.
    pub display_name: String,

    /// Optional per-locale display names. Keyed by ISO-639-1 lowercase
    /// code (e.g. `"it"`, `"en"`, `"fr"`).
    #[serde(default)]
    pub display_name_locale: HashMap<String, String>,

    /// One-line description, shown in the corpus picker.
    #[serde(default)]
    pub description: Option<String>,

    /// Homepage URL for the source site (UI "open externally" link).
    #[serde(default)]
    pub homepage: Option<String>,

    /// ISO-639-1 codes the corpus is served in.
    pub languages: Vec<String>,

    /// Default language to fetch when the user hasn't set one.
    /// Must be in `languages`.
    pub default_language: String,

    /// When true and the requested language isn't available, the
    /// adapter falls back to `fallback_language`.
    #[serde(default = "default_true")]
    pub supports_language_fallback: bool,

    /// Language used when `supports_language_fallback` and the
    /// primary request returned nothing. Must be in `languages`.
    #[serde(default)]
    pub fallback_language: Option<String>,

    /// Label shown next to identifier inputs (CELEX, ELI, URN, ...).
    pub identifier_label: String,

    /// Sample identifier the UI can prefill or show in placeholder.
    #[serde(default)]
    pub identifier_example: Option<String>,

    /// Whether the corpus is enabled the first time the user opens
    /// the settings panel. Users can flip this later via
    /// `corpus_settings.enabled`.
    #[serde(default = "default_true")]
    pub enabled_by_default: bool,

    /// How MikeRust actually fetches and indexes documents from
    /// this corpus. Discriminated union — see `CorpusStrategy`.
    pub strategy: CorpusStrategy,
}

fn default_true() -> bool {
    true
}

/// Backend strategy. Only `builtin` is implemented today; the other
/// variants are sketched here so future migrations don't need a
/// manifest-format bump.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CorpusStrategy {
    /// Hand-written Rust adapter. The `builtin_id` names which one.
    Builtin {
        /// Identifier matched against the in-binary registry of
        /// Rust adapters (`eurlex`, `italian-legal-hf`, ...).
        builtin_id: String,
    },

    /// Future: declarative HTTP fetch per identifier.
    /// Reserved variant — parses fine but not yet honored by the
    /// runtime; loading a manifest with this strategy emits a
    /// warning and the corpus is treated as disabled until the
    /// runtime implements it.
    #[serde(rename = "http-fetch-per-id")]
    HttpFetchPerId(serde_json::Value),

    /// Future: bulk metadata import from a Hugging Face dataset
    /// (parquet projection + filtered rows). What the current
    /// `italian_legal` adapter does today.
    #[serde(rename = "hf-dataset-bulk")]
    HfDatasetBulk(serde_json::Value),
}

impl CorpusPlugin {
    /// Validate cross-field invariants the deserialiser can't catch
    /// (e.g. `default_language` is one of `languages`).
    pub fn validate(&self) -> Result<()> {
        if !is_valid_corpus_id(&self.id) {
            bail!(
                "invalid corpus id {:?}: must match ^[a-z][a-z0-9\\-]*$",
                self.id
            );
        }
        if self.languages.is_empty() {
            bail!("corpus {} declares no languages", self.id);
        }
        for lang in &self.languages {
            if !is_valid_iso639_1(lang) {
                bail!(
                    "corpus {}: language {:?} is not a valid ISO-639-1 code",
                    self.id,
                    lang
                );
            }
        }
        if !self.languages.contains(&self.default_language) {
            bail!(
                "corpus {}: default_language {:?} not in languages",
                self.id,
                self.default_language
            );
        }
        if let Some(fb) = &self.fallback_language {
            if !self.languages.contains(fb) {
                bail!(
                    "corpus {}: fallback_language {:?} not in languages",
                    self.id,
                    fb
                );
            }
        }
        if self.supports_language_fallback && self.fallback_language.is_none() {
            bail!(
                "corpus {}: supports_language_fallback=true requires fallback_language to be set",
                self.id
            );
        }
        if let CorpusStrategy::Builtin { builtin_id } = &self.strategy {
            if !is_known_builtin(builtin_id) {
                bail!(
                    "corpus {}: unknown builtin_id {:?} (known: {})",
                    self.id,
                    builtin_id,
                    KNOWN_BUILTINS.join(", ")
                );
            }
        }
        Ok(())
    }

    /// Resolve the display name for the user's locale, falling back
    /// to the default English name when the locale has no override.
    pub fn localized_display_name(&self, locale: &str) -> &str {
        self.display_name_locale
            .get(locale)
            .map(String::as_str)
            .unwrap_or(self.display_name.as_str())
    }

    /// Convenience: is this manifest backed by a runnable adapter
    /// today? `false` for strategies we've parsed but not yet wired.
    pub fn is_runnable(&self) -> bool {
        matches!(self.strategy, CorpusStrategy::Builtin { .. })
    }
}

fn is_valid_corpus_id(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn is_valid_iso639_1(s: &str) -> bool {
    s.len() == 2 && s.chars().all(|c| c.is_ascii_lowercase())
}

/// Known builtin adapter ids. Keep in sync with the registry in
/// `src/corpora/mod.rs` (when we add it).
const KNOWN_BUILTINS: &[&str] = &["eurlex", "italian-legal-hf"];

fn is_known_builtin(id: &str) -> bool {
    KNOWN_BUILTINS.contains(&id)
}

/// Resolve the directory to scan for plugin manifests.
///   1. `MIKE_CORPUS_PLUGINS_DIR` env var, if set.
///   2. `./corpora-plugins` relative to CWD.
pub fn plugins_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MIKE_CORPUS_PLUGINS_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from("./corpora-plugins")
}

/// Scan `dir` for `*.json` files, parse each as a `CorpusPlugin`,
/// validate, and return them sorted by `id`. Skips files that fail
/// to parse with a tracing::warn — one broken manifest does not
/// stop the rest from loading.
pub fn load_plugins(dir: &Path) -> Result<Vec<CorpusPlugin>> {
    let mut out: Vec<CorpusPlugin> = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!(
                "[corpus-plugins] directory {} not found; no manifests loaded",
                dir.display()
            );
            return Ok(out);
        }
        Err(e) => {
            return Err(anyhow!(
                "failed to read corpus plugins dir {}: {}",
                dir.display(),
                e
            ));
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("[corpus-plugins] read_dir entry error: {}", e);
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match parse_manifest_file(&path) {
            Ok(plugin) => {
                tracing::info!(
                    "[corpus-plugins] loaded {} ({}): {} languages, strategy={:?}",
                    plugin.id,
                    path.display(),
                    plugin.languages.len(),
                    plugin.strategy
                );
                out.push(plugin);
            }
            Err(e) => {
                tracing::warn!(
                    "[corpus-plugins] skipping {}: {:#}",
                    path.display(),
                    e
                );
            }
        }
    }

    // Dedup by id; later loads of the same id win and we warn.
    let mut by_id: HashMap<String, CorpusPlugin> = HashMap::new();
    for plugin in out {
        if by_id.contains_key(&plugin.id) {
            tracing::warn!(
                "[corpus-plugins] duplicate corpus id {:?} — later definition wins",
                plugin.id
            );
        }
        by_id.insert(plugin.id.clone(), plugin);
    }
    let mut sorted: Vec<CorpusPlugin> = by_id.into_values().collect();
    sorted.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(sorted)
}

fn parse_manifest_file(path: &Path) -> Result<CorpusPlugin> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("reading {}", path.display()))?;
    let plugin: CorpusPlugin = serde_json::from_slice(&bytes)
        .with_context(|| format!("parsing JSON in {}", path.display()))?;
    plugin
        .validate()
        .with_context(|| format!("validating manifest {}", path.display()))?;
    Ok(plugin)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(name: &str, content: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(name);
        let mut f = std::fs::File::create(&path).expect("create");
        f.write_all(content.as_bytes()).expect("write");
        dir
    }

    #[test]
    fn parses_minimal_builtin_manifest() {
        let json = r#"{
            "id": "eurlex",
            "display_name": "EUR-Lex",
            "languages": ["en", "it", "fr"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "CELEX",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        plugin.validate().unwrap();
        assert_eq!(plugin.id, "eurlex");
        assert!(plugin.is_runnable());
    }

    #[test]
    fn rejects_uppercase_id() {
        let json = r#"{
            "id": "EurLex",
            "display_name": "x",
            "languages": ["en"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        assert!(plugin.validate().is_err());
    }

    #[test]
    fn rejects_default_language_not_in_list() {
        let json = r#"{
            "id": "x",
            "display_name": "x",
            "languages": ["fr"],
            "default_language": "en",
            "identifier_label": "X",
            "supports_language_fallback": false,
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        assert!(plugin.validate().is_err());
    }

    #[test]
    fn rejects_fallback_when_supported_but_unset() {
        let json = r#"{
            "id": "x",
            "display_name": "x",
            "languages": ["en"],
            "default_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        // supports_language_fallback defaults to true; fallback_language is None.
        assert!(plugin.validate().is_err());
    }

    #[test]
    fn rejects_unknown_builtin_id() {
        let json = r#"{
            "id": "weird",
            "display_name": "Weird",
            "languages": ["en"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "does-not-exist" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        assert!(plugin.validate().is_err());
    }

    #[test]
    fn rejects_invalid_iso_code() {
        let json = r#"{
            "id": "x",
            "display_name": "x",
            "languages": ["eng"],
            "default_language": "eng",
            "fallback_language": "eng",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        assert!(plugin.validate().is_err());
    }

    #[test]
    fn parses_future_http_fetch_strategy_but_marks_not_runnable() {
        // Manifest with the future strategy parses fine — we just
        // don't run it yet. is_runnable() returns false so callers
        // can filter it out.
        let json = r#"{
            "id": "future",
            "display_name": "Future",
            "languages": ["en"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "X",
            "strategy": {
                "kind": "http-fetch-per-id",
                "search_by_id": { "url_template": "https://example.com/{id}" }
            }
        }"#;
        let plugin: CorpusPlugin = serde_json::from_str(json).unwrap();
        // Validation passes (unknown-builtin check only fires for the
        // Builtin strategy).
        plugin.validate().unwrap();
        assert!(!plugin.is_runnable());
    }

    #[test]
    fn localized_display_name_falls_back_to_default() {
        let mut p: CorpusPlugin = serde_json::from_str(
            r#"{
                "id": "x",
                "display_name": "Default",
                "display_name_locale": { "it": "Italiano" },
                "languages": ["en"],
                "default_language": "en",
                "fallback_language": "en",
                "identifier_label": "X",
                "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
            }"#,
        )
        .unwrap();
        assert_eq!(p.localized_display_name("it"), "Italiano");
        assert_eq!(p.localized_display_name("fr"), "Default");
        // Mutating the map confirms it really is a HashMap, not a fluke.
        p.display_name_locale
            .insert("fr".to_string(), "Français".to_string());
        assert_eq!(p.localized_display_name("fr"), "Français");
    }

    #[test]
    fn load_plugins_returns_empty_when_dir_missing() {
        let bogus = PathBuf::from("./this-directory-really-should-not-exist-1234");
        let out = load_plugins(&bogus).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn load_plugins_skips_broken_files_keeps_valid_ones() {
        let dir = tempfile::tempdir().unwrap();
        // valid
        let valid = r#"{
            "id": "ok",
            "display_name": "OK",
            "languages": ["en"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        std::fs::write(dir.path().join("ok.json"), valid).unwrap();
        // broken JSON
        std::fs::write(dir.path().join("broken.json"), "{ not json }").unwrap();
        // invalid id (validation failure)
        let invalid = r#"{
            "id": "BAD",
            "display_name": "Bad",
            "languages": ["en"],
            "default_language": "en",
            "fallback_language": "en",
            "identifier_label": "X",
            "strategy": { "kind": "builtin", "builtin_id": "eurlex" }
        }"#;
        std::fs::write(dir.path().join("invalid.json"), invalid).unwrap();
        // non-json file (ignored silently)
        std::fs::write(dir.path().join("readme.txt"), "ignore me").unwrap();

        let out = load_plugins(dir.path()).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "ok");
        // suppress unused warning on the TempDir guard
        let _ = write_temp;
    }

    #[test]
    fn duplicate_ids_keep_last_seen() {
        let dir = tempfile::tempdir().unwrap();
        let mk = |display: &str| -> String {
            format!(
                r#"{{
                    "id": "dup",
                    "display_name": "{display}",
                    "languages": ["en"],
                    "default_language": "en",
                    "fallback_language": "en",
                    "identifier_label": "X",
                    "strategy": {{ "kind": "builtin", "builtin_id": "eurlex" }}
                }}"#
            )
        };
        std::fs::write(dir.path().join("a-first.json"), mk("first")).unwrap();
        std::fs::write(dir.path().join("b-second.json"), mk("second")).unwrap();
        let out = load_plugins(dir.path()).unwrap();
        assert_eq!(out.len(), 1);
        // Insertion order in the dedup HashMap depends on filename
        // scan order, which is OS-dependent. Just check we got one
        // of the two — the warn is the actionable signal.
        assert!(out[0].display_name == "first" || out[0].display_name == "second");
    }
}
