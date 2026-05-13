-- Persist the user's preferred default professional vertical so the
-- workflow / project / document create dialogs pre-select that domain
-- instead of always falling back to the schema default ('legal').
--
-- NULL means "no explicit preference" — call sites then fall back to
-- the canonical default `legal` (matching the `domain` column default
-- on every per-row table from migration 0018). Set via
-- `PUT /user/default-domain` from the Account → Generali page.

ALTER TABLE user_settings ADD COLUMN default_domain TEXT;
