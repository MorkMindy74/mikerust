-- v0.6.0: per-user Mistral provider options.
--
-- The Mistral cloud provider (api.mistral.ai), now routed through
-- the dedicated src/llm/mistral.rs path (added in v0.6.0 Commit A),
-- accepts two knobs that affect product behaviour and that the user
-- should be able to toggle:
--
--   * `safe_prompt` — Mistral's safety wrapper. Default false (also
--     the upstream default). Some legitimate legal content
--     (criminal-case sentences, sensitive medical reports) trips the
--     filter and the model refuses to answer. The toggle is OFF by
--     default; users who hit refusals on legitimate content can flip
--     it ON to apply Mistral's stricter safety layer — but in this
--     product the more common direction is the reverse: keep it OFF
--     and accept that the model can read legal source material.
--
--   * `parallel_tool_calls` — Mistral defaults to `true`. Legal
--     workflows (tabular cell extraction, citation lookups) benefit
--     from sequential semantics; we hard-coded `false` in Commit A.
--     The toggle exposes the upstream default for power users who
--     want concurrent tool execution (e.g. simple non-ordered
--     lookups).
--
-- Both default to 0 (OFF) on existing installs — retro-compat with
-- the v0.5.6 behaviour and the v0.6.0 Commit A hard-coded defaults.

ALTER TABLE user_settings
    ADD COLUMN mistral_safe_prompt INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_settings
    ADD COLUMN mistral_parallel_tools INTEGER NOT NULL DEFAULT 0;
