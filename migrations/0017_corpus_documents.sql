-- Generic per-corpus metadata + FTS5 index for any bulk-imported corpus.
--
-- Today's first consumer: the `dila-bulk-xml` strategy that ingests
-- the DILA OPENDATA tar.gz archives (CNIL, LEGI, JORF, CASS, KALI).
-- Designed so future bulk corpora (BOE Spain, GU Italy, Gesetze
-- Germany, …) reuse the same two tables — `corpus_id` is the
-- primary dimension that keeps them separate. NOT used by EUR-Lex
-- or the existing `italian_corpus` legacy table; those keep their
-- own routes and storage during the transition.
--
-- Fields are intentionally a superset that covers the DILA schema;
-- when a future bulk source doesn't have one of them the field is
-- simply NULL. This keeps the migration count down — one table
-- per N corpora, not per corpus.

CREATE TABLE IF NOT EXISTS corpus_documents (
    -- Composite key: (which corpus, what id inside it).
    corpus_id       TEXT NOT NULL,
    identifier      TEXT NOT NULL,

    -- DILA-shaped metadata. NULL where the source doesn't expose it.
    nature          TEXT,
    origine         TEXT,
    titre           TEXT,
    titre_full      TEXT,
    numero          TEXT,
    nor             TEXT,
    nature_delib    TEXT,
    date_texte      TEXT,
    date_publi      TEXT,
    etat            TEXT,   -- VIGUEUR / ABROGE / MODIFIE / ...

    -- Plain-text body (markup stripped at import time). For DILA
    -- this is the BLOC_TEXTUEL/CONTENU content.
    body            TEXT NOT NULL,

    -- Provenance: the archive timestamp the doc was extracted from.
    -- Lets us answer "is this still current?" against the corpus_imports
    -- snapshot. Format: the YYYYMMDD-HHMMSS from the archive filename.
    archive_ts      TEXT,

    indexed_at      TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (corpus_id, identifier)
);

CREATE INDEX IF NOT EXISTS idx_corpus_documents_corpus
    ON corpus_documents (corpus_id);

CREATE INDEX IF NOT EXISTS idx_corpus_documents_nature_delib
    ON corpus_documents (corpus_id, nature_delib);

CREATE INDEX IF NOT EXISTS idx_corpus_documents_etat
    ON corpus_documents (corpus_id, etat);

-- FTS5 over the searchable text fields. Unicode tokenizer + diacritic
-- removal so a query for "delibération" matches "Délibération" and
-- a query for "sécurité" matches "securite". `body` carries the main
-- recall; titles boost precision when a user types a short query
-- ("RGPD article 35" should match by title too).
CREATE VIRTUAL TABLE IF NOT EXISTS corpus_documents_fts USING fts5(
    corpus_id    UNINDEXED,
    titre,
    titre_full,
    numero,
    body,
    tokenize = 'unicode61 remove_diacritics 1'
);

-- Per-corpus import snapshot tracking. Lets the UI show
-- "Snapshot du YYYY-MM-DD" (Etalab 2.0 freshness disclosure) and
-- the importer skip work when the latest archive is already imported.
CREATE TABLE IF NOT EXISTS corpus_imports (
    corpus_id           TEXT NOT NULL PRIMARY KEY,
    -- The full URL of the archive we last successfully imported.
    last_archive_url    TEXT,
    -- YYYYMMDD-HHMMSS extracted from the archive filename. This is
    -- the authoritative "as of" date for downstream attribution.
    last_archive_ts     TEXT,
    last_imported_at    TEXT NOT NULL DEFAULT (datetime('now')),
    -- Total doc count after the last import. UI surfaces this in the
    -- corpus panel ("12 458 documents indicizzati").
    doc_count           INTEGER NOT NULL DEFAULT 0
);
