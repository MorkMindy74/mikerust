// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

import { api } from './client'
import type { Domain } from '$lib/types/domain'
import type { CreateTabularReviewBody, TabularReview } from '$lib/types/tabular'

// `type` (not interface) — assignable to the client's query Record.
export type TabularFilter = {
  project_id?: string
  domain?: Domain
}

/** Wrappers for `src/routes/tabular_reviews.rs`. All require auth. */
export const tabularApi = {
  /** GET /tabular-review — returns a bare array. */
  list: (filter?: TabularFilter) =>
    api<TabularReview[]>('/tabular-review', { query: filter }),

  get: (id: string) => api<TabularReview>(`/tabular-review/${encodeURIComponent(id)}`),

  create: (body: CreateTabularReviewBody) =>
    api<{ id: string; title: string; domain: Domain }>('/tabular-review', {
      method: 'POST',
      body,
    }),

  remove: (id: string) =>
    api<{ ok: boolean }>(`/tabular-review/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
