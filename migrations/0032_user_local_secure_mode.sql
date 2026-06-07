-- v0.5.6: per-user "Modalità sicura locale" toggle.
--
-- When ON the local OpenAI-compatible provider in src/llm/local.rs:
--   * Forces base_url to http://localhost:11434 (any other URL is
--     refused with a clear error — no LAN endpoints, no public IPs).
--   * Restricts `local_model` to a curated allowlist of two
--     pre-configured Ollama variants that MikeRust creates on demand
--     from inline Modelfiles (see src/llm/ollama_manager.rs):
--       - `mike-qwen35-4b-fast`   (Qwen 2.5 3B Instruct Q4_K_M
--                                  + /no_think token in the chat
--                                  template — thinking suppressed)
--       - `mike-gemma4-e2b-fast`  (unsloth Gemma 4 E2B IT GGUF
--                                  Q4_K_M + stop sequences on
--                                  <think>/<thinking>/<reasoning>
--                                  + "rispondi direttamente" system
--                                  preamble)
--   * Prepends a "no thinking" preamble to the system prompt so a
--     model that wasn't created via Mike's Modelfile still avoids
--     verbose chain-of-thought output.
--
-- Default OFF on existing installs (retro-compatibility — anyone who
-- already had a custom Ollama URL or a free-form model id keeps it).
-- New installs can toggle ON from Settings → Modelli LLM.

ALTER TABLE user_settings
    ADD COLUMN local_secure_mode INTEGER NOT NULL DEFAULT 0;
