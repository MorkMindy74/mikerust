<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  Tabular reviews screen. List + create + delete over /tabular-review.
  A review inherits its column definitions and domain from a chosen
  tabular workflow. The per-document cell grid is a later phase — the
  backend endpoint here carries only review metadata, not cells.
-->
<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Spinner from '$lib/components/ui/Spinner.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Modal from '$lib/components/ui/Modal.svelte'
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
  import { tabularStore } from '$lib/stores/tabular.svelte'
  import { workflowsApi } from '$lib/api/workflows'
  import { toastStore } from '$lib/stores/toast.svelte'
  import { userStore } from '$lib/stores/user.svelte'
  import { DOMAINS, domainLabel, DEFAULT_DOMAIN, type Domain } from '$lib/types/domain'
  import type { Workflow } from '$lib/types/workflow'
  import { ApiError } from '$lib/types/error'
  import { Trash2 } from 'lucide-svelte'

  let domainFilter = $state<string>('')
  let tabularWorkflows = $state<Workflow[]>([])

  $effect(() => {
    void tabularStore.refresh()
  })
  $effect(() => {
    workflowsApi
      .list({ type: 'tabular' })
      .then((r) => (tabularWorkflows = r.workflows))
      .catch(() => {
        /* the create modal just shows an empty workflow list */
      })
  })

  const domainOptions = [
    { value: '', label: 'All domains' },
    ...DOMAINS.map((d) => ({ value: d, label: domainLabel(d) })),
  ]

  const rows = $derived(
    domainFilter
      ? tabularStore.items.filter((r) => r.domain === domainFilter)
      : tabularStore.items
  )

  // ── create modal ────────────────────────────────────────────────────
  let modalOpen = $state(false)
  let fTitle = $state('')
  let fWorkflowId = $state('')
  let fDomain = $state<Domain>(DEFAULT_DOMAIN)
  let creating = $state(false)
  let formError = $state<string | null>(null)

  const domainFormOptions = DOMAINS.map((d) => ({ value: d, label: domainLabel(d) }))
  // Domain is chosen first; it scopes the tabular-workflow list.
  const workflowOptions = $derived([
    { value: '', label: '— select a tabular workflow —' },
    ...tabularWorkflows
      .filter((w) => w.domain === fDomain)
      .map((w) => ({ value: w.id, label: w.title })),
  ])
  const selectedWorkflow = $derived(tabularWorkflows.find((w) => w.id === fWorkflowId))

  // Changing the domain re-scopes the workflow list — drop a selection
  // that no longer belongs to the chosen domain.
  $effect(() => {
    if (selectedWorkflow && selectedWorkflow.domain !== fDomain) fWorkflowId = ''
  })

  function openCreate() {
    fTitle = ''
    fWorkflowId = ''
    fDomain = userStore.defaultDomain
    formError = null
    modalOpen = true
  }

  async function create() {
    if (!fWorkflowId) {
      formError = 'Pick a tabular workflow.'
      return
    }
    creating = true
    formError = null
    try {
      await tabularStore.create({
        title: fTitle.trim() || undefined,
        workflow_id: fWorkflowId,
        columns_config: selectedWorkflow?.columns_config,
        domain: fDomain,
      })
      toastStore.success('Review created')
      modalOpen = false
    } catch (e) {
      formError = e instanceof ApiError ? e.detail : (e as Error).message
    } finally {
      creating = false
    }
  }

  // ── delete ──────────────────────────────────────────────────────────
  let deleteTarget = $state<{ id: string; title: string } | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await tabularStore.remove(deleteTarget.id)
      toastStore.info('Review deleted')
    } catch (e) {
      toastStore.danger('Could not delete review', { detail: (e as Error).message })
    } finally {
      deleteTarget = null
    }
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
  }
</script>

<div class="max-w-4xl mx-auto p-8 space-y-5">
  <header class="flex items-end justify-between gap-4">
    <div class="space-y-1">
      <h2 class="text-2xl font-semibold text-(--color-text-primary)">Tabular reviews</h2>
      <p class="text-sm text-(--color-text-secondary)">
        Multi-document reviews driven by a tabular workflow's columns.
      </p>
    </div>
    <Button onclick={openCreate}>New review</Button>
  </header>

  <div class="flex justify-end">
    <Select options={domainOptions} bind:value={domainFilter} size="sm" class="w-44" />
  </div>

  {#if tabularStore.loading}
    <div class="flex items-center gap-2 text-sm text-(--color-text-secondary) py-12 justify-center">
      <Spinner size="sm" />
      Loading reviews…
    </div>
  {:else if tabularStore.error}
    <EmptyState title="Could not load reviews" description={tabularStore.error}>
      {#snippet action()}
        <Button size="sm" variant="secondary" onclick={() => tabularStore.refresh()}>Retry</Button>
      {/snippet}
    </EmptyState>
  {:else if rows.length === 0}
    <EmptyState
      title="No tabular reviews"
      description={domainFilter
        ? `No reviews in the ${domainLabel(domainFilter)} domain.`
        : 'Create a review from a tabular workflow to get started.'}
    >
      {#snippet action()}
        <Button size="sm" onclick={openCreate}>New review</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each rows as r (r.id)}
        <li class="flex items-center gap-3 px-4 py-3 bg-(--color-surface-0) border border-(--color-surface-200) rounded-(--radius-md)">
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium text-(--color-text-primary) truncate">{r.title}</span>
            <p class="text-xs text-(--color-text-secondary)">
              {r.columns_config.length} column{r.columns_config.length === 1 ? '' : 's'}
              · created {fmtDate(r.created_at)}
            </p>
          </div>
          <Badge tone="brand">{domainLabel(r.domain)}</Badge>
          <IconButton
            label="Delete review"
            size="sm"
            variant="danger"
            onclick={() => (deleteTarget = { id: r.id, title: r.title })}
          >
            <Trash2 size={14} />
          </IconButton>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Modal bind:open={modalOpen} title="New tabular review" size="md">
  <div class="space-y-3">
    <Input label="Title" bind:value={fTitle} placeholder="Untitled Review" />
    <Select label="Domain" options={domainFormOptions} bind:value={fDomain} />
    <Select label="Tabular workflow" options={workflowOptions} bind:value={fWorkflowId} />
    {#if selectedWorkflow}
      <p class="text-xs text-(--color-text-secondary)">
        Inherits {selectedWorkflow.columns_config.length} column{selectedWorkflow.columns_config.length === 1 ? '' : 's'}
        from this workflow.
      </p>
    {:else}
      <p class="text-xs text-(--color-text-secondary)">
        Showing tabular workflows in the {domainLabel(fDomain)} domain.
      </p>
    {/if}
    {#if formError}
      <p class="text-sm text-(--color-danger-500)">{formError}</p>
    {/if}
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (modalOpen = false)}>Cancel</Button>
    <Button loading={creating} onclick={create}>Create review</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete review?"
  message={`"${deleteTarget?.title ?? ''}" will be permanently deleted.`}
  confirmLabel="Delete"
  danger
  onconfirm={confirmDelete}
  oncancel={() => (deleteTarget = null)}
/>
