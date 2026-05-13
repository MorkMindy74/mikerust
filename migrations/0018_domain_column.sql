-- Add a `domain` column to the configuration + content tables so the
-- UI can categorise artefacts by professional vertical (legal, medical,
-- finance, …) and filter list views accordingly.
--
-- Every existing row defaults to `legal` — MikeRust is forked from
-- `willchen96/mike`, which was built around a law-firm workflow, so all
-- prior data is implicitly legal-domain. New rows passed through the
-- create endpoints can choose any of the canonical domains; the value
-- is also stored without a hard CHECK constraint so future domains can
-- be added without a schema migration (validation lives at the API
-- boundary, see src/routes/*).
--
-- Canonical domain set (matches frontend `Domain` type):
--   legal | medical | finance | real_estate | hr | insurance | ip
--   | compliance | others
--
-- Per-table notes:
--   workflows         — what the template applies to.
--   tabular_reviews   — instances inherit from their workflow but can
--                       be re-tagged for one-off cross-domain reviews.
--   projects          — a project's vertical (case folder vs medical
--                       cohort vs claims batch …).
--   documents         — useful especially for global documents
--                       (project_id IS NULL); project-scoped docs can
--                       inherit from their project at upload time.

ALTER TABLE workflows
    ADD COLUMN domain TEXT NOT NULL DEFAULT 'legal';

ALTER TABLE tabular_reviews
    ADD COLUMN domain TEXT NOT NULL DEFAULT 'legal';

ALTER TABLE projects
    ADD COLUMN domain TEXT NOT NULL DEFAULT 'legal';

ALTER TABLE documents
    ADD COLUMN domain TEXT NOT NULL DEFAULT 'legal';

CREATE INDEX IF NOT EXISTS idx_workflows_domain
    ON workflows (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_tabular_reviews_domain
    ON tabular_reviews (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_projects_domain
    ON projects (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_documents_domain
    ON documents (user_id, domain);
