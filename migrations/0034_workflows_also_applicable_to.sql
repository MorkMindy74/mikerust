-- v0.7.4: cross-domain support for USER-created workflows.
--
-- Built-in workflow presets already carry `also_applicable_to` (a JSON
-- array of extra domains they surface under, beyond the primary
-- `domain`) — it lives in their JSON file and is held in memory. This
-- migration brings the same capability to user-created workflows
-- stored in the DB, so the workflow editor can let the user tag a
-- workflow as applicable to more than one sector (e.g. a workflow
-- useful to both `fiscale` and `finance`).
--
-- Stored as a JSON text array, default '[]' (no extra domains). The
-- route layer validates each entry against the canonical domain set
-- and drops any redundant listing of the primary domain before
-- persisting. The list filter (`GET /workflow?domain=`) matches a row
-- when the target equals the primary `domain` OR appears in this array.
--
-- No backfill needed: existing rows default to '[]' (single-domain),
-- preserving current behaviour exactly.

ALTER TABLE workflows
    ADD COLUMN also_applicable_to TEXT NOT NULL DEFAULT '[]';
