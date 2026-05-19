-- Per-project document folders — a tree.
--
-- `parent_id` NULL is a root-level folder. `documents.project_folder_id`
-- NULL means the document sits at the project root (in no folder).
--
-- Deleting a folder cascades to its subfolders (parent_id FK CASCADE);
-- its documents fall back to the project root (project_folder_id FK
-- SET NULL) rather than being destroyed.

CREATE TABLE IF NOT EXISTS project_folders (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES project_folders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_folders_project ON project_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_folders_parent  ON project_folders(parent_id);

-- A document's folder within its project. NULL = project root.
ALTER TABLE documents
    ADD COLUMN project_folder_id TEXT REFERENCES project_folders(id) ON DELETE SET NULL;
