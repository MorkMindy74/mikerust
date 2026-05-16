// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

import { api } from './client'
import type { Domain } from '$lib/types/domain'
import type { DocumentMeta } from '$lib/types/document'

// `type` (not interface) — assignable to the client's query Record.
export type DocumentFilter = {
  project_id?: string
  domain?: Domain
}

/** Wrappers for `src/routes/documents.rs`. All require auth. */
export const documentsApi = {
  list: (filter?: DocumentFilter) =>
    api<{ documents: DocumentMeta[] }>('/document', { query: filter }),

  get: (id: string) => api<DocumentMeta>(`/document/${encodeURIComponent(id)}`),

  remove: (id: string) =>
    api<{ ok: boolean }>(`/document/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Fetch the displayable bytes of a document. The backend returns a
   * PDF rendition when one exists, otherwise the original bytes — the
   * caller inspects the resulting Blob's MIME type to pick a renderer.
   */
  displayBytes: (id: string) =>
    api<Blob>(`/document/${encodeURIComponent(id)}/display`, { asBlob: true }),

  /** Fetch the original document bytes for download. */
  downloadBytes: (id: string) =>
    api<Blob>(`/document/${encodeURIComponent(id)}/download`, { asBlob: true }),
}
