//! Column preset registry — JSON files under `column-presets/<domain>/`.
//!
//! Each file declares ONE tabular-column shortcut: a regex pattern
//! that matches likely column titles, a canonical column `name`, a
//! `prompt` to plug into the new column, and a `format`. Used by the
//! AddColumnModal UI to suggest "common" columns when the user starts
//! typing (e.g. typing "Parties" auto-fills a recall-shaped prompt
//! and `bulleted_list` format).
//!
//! Pattern is stored as a string + flags so the JSON stays portable
//! across languages. The frontend reconstructs `new RegExp(pattern,
//! flags)` at runtime; the backend just ferries it.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// One column shortcut. Mirrors `ColumnPreset` in the frontend
/// (`columnPresets.ts`), with the regex split into pattern + flags so
/// it can travel as JSON.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ColumnPreset {
    /// Visible column name used as the dropdown label.
    pub name: String,
    /// Regex pattern source (no leading/trailing slashes).
    pub match_pattern: String,
    /// Regex flags (e.g. `"i"`). Empty string when no flags.
    #[serde(default)]
    pub match_flags: String,
    /// Per-cell extraction prompt.
    pub prompt: String,
    /// One of: `text` | `bulleted_list` | `number` | `currency` |
    /// `monetary_amount` | `percentage` | `yes_no` | `date` | `tag`.
    pub format: String,
    /// Professional vertical this preset applies to. Matches the
    /// `Domain` enum on the backend so the frontend can filter
    /// suggestions by the user's current domain.
    pub domain: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

/// Walk every JSON file in `dir` (one level of subdirectory recursion
/// for domain folders), parse each as a `ColumnPreset`, validate.
/// Broken files are skipped with a `tracing::warn`.
pub fn load_column_presets(dir: &Path) -> Result<Vec<ColumnPreset>> {
    let mut out: Vec<ColumnPreset> = Vec::new();
    let files = match super::collect_json_files(dir) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!(
                "[column-presets] directory {} not found; no presets loaded",
                dir.display()
            );
            return Ok(out);
        }
        Err(e) => return Err(anyhow::anyhow!("read {}: {}", dir.display(), e)),
    };

    for path in files {
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    "[column-presets] skip {} (read error): {}",
                    path.display(),
                    e
                );
                continue;
            }
        };
        match serde_json::from_slice::<ColumnPreset>(&bytes) {
            Ok(p) => {
                if p.name.is_empty() || p.prompt.is_empty() || p.match_pattern.is_empty() {
                    tracing::warn!(
                        "[column-presets] skip {} (name/prompt/pattern empty)",
                        path.display()
                    );
                    continue;
                }
                if !crate::domain::is_valid(&p.domain) {
                    tracing::warn!(
                        "[column-presets] skip {} (domain {} not in canonical set)",
                        path.display(),
                        p.domain
                    );
                    continue;
                }
                tracing::info!(
                    "[column-presets] loaded {} ({}, domain={})",
                    p.name,
                    p.format,
                    p.domain
                );
                out.push(p);
            }
            Err(e) => {
                tracing::warn!(
                    "[column-presets] skip {} (parse error): {}",
                    path.display(),
                    e
                );
            }
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}
