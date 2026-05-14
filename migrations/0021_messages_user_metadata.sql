-- Persist user-message metadata so chat reopen reproduces the original
-- composer state: attached files, workflow chip, template chip.
--
-- Today the chat handler reads `files`, `workflow`, `template` from the
-- request body (to stamp chat_id on the documents row, inject markers
-- into the LLM prompt, etc.) but only persists `content` — so reopening
-- the chat on a later day loses all three. The PDF pills disappear
-- from the user message, the workflow chip is gone, and the template
-- pill is gone, even though the underlying `documents` and
-- `workflow_presets` / `docx_templates` rows are all still on disk.
--
-- Mirror the columns the frontend's `MikeMessage` interface exposes
-- (`files?`, `workflow?`, `template?`) as nullable JSON blobs. Same
-- pattern as `messages.annotations` (migration 0012) and
-- `messages.events` (migration 0020) — one JSON column per
-- non-text-content aspect of a message, NULL when absent. Backwards-
-- compatible: existing user rows have NULL in all three and the
-- frontend's `m.files ?? undefined` fallback handles it.

ALTER TABLE messages ADD COLUMN files TEXT;
ALTER TABLE messages ADD COLUMN workflow TEXT;
ALTER TABLE messages ADD COLUMN template TEXT;
