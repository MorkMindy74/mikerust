// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

import type { Domain } from './domain'
import type { WorkflowColumn } from './workflow'

/** Types mirroring `src/routes/tabular_reviews.rs`. */

export interface TabularReview {
  id: string
  title: string
  project_id: string | null
  workflow_id: string | null
  /** Column definitions, inherited from the source tabular workflow. */
  columns_config: WorkflowColumn[]
  domain: Domain
  created_at: string
  updated_at: string
}

/** Body for `POST /tabular-review`. */
export interface CreateTabularReviewBody {
  title?: string
  project_id?: string
  workflow_id?: string
  columns_config?: WorkflowColumn[]
  domain?: Domain
}
