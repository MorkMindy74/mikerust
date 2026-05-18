<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  DOCX renderer. Renders Word documents to HTML in-browser via
  docx-preview (pure JS, no plugin). Tracked changes are shown with
  coloured insert/delete styling; the cited passage is highlighted.
-->
<script lang="ts">
  import { renderAsync } from 'docx-preview'
  import { highlightCitation } from '$lib/utils/highlight'
  import { PAGE_BREAK_SENTINEL } from '$lib/types/citation'
  import Spinner from '$lib/components/ui/Spinner.svelte'
  import { i18n } from '$lib/stores/i18n.svelte'

  interface Props {
    blob: Blob
    quote?: string
    trackedPolicy?: 'show' | 'accept' | 'reject'
    revision?: number
  }

  let { blob, quote, trackedPolicy = 'show', revision = 0 }: Props = $props()

  let loading = $state(true)
  let err = $state<string | null>(null)
  let host: HTMLDivElement

  function applyHighlight() {
    if (!quote || !host) return
    const mark = highlightCitation(host, quote, PAGE_BREAK_SENTINEL)
    if (mark) {
      mark.classList.add('doc-hl-flash')
      mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  async function render() {
    loading = true
    err = null
    try {
      host.innerHTML = ''
      await renderAsync(blob, host, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderChanges: trackedPolicy !== 'reject',
        experimental: true,
        useBase64URL: true,
      })
      applyHighlight()
    } catch (e) {
      err = (e as Error).message
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void blob
    void trackedPolicy
    void render()
  })

  $effect(() => {
    void revision
    void quote
    if (!loading && !err) applyHighlight()
  })
</script>

<div class="h-full min-h-0 overflow-auto bg-(--color-surface-100) p-4">
  {#if loading}
    <div class="flex items-center justify-center gap-2 py-12 text-sm text-(--color-text-secondary)">
      <Spinner size="sm" />
      {i18n.t('Documents.viewer.loadingDocument')}
    </div>
  {:else if err}
    <p class="text-sm text-(--color-danger-500) py-12 text-center">
      {i18n.t('Documents.viewer.errorLoading')} — {err}
    </p>
  {/if}
  <div bind:this={host} class={`docx-body tracked-${trackedPolicy}`}></div>
</div>

<style>
  :global(.docx-body.tracked-accept del),
  :global(.docx-body.tracked-accept .docx-delete),
  :global(.docx-body.tracked-accept .docx-deletion) {
    display: none !important;
  }

  :global(.docx-body.tracked-reject ins),
  :global(.docx-body.tracked-reject .docx-insert),
  :global(.docx-body.tracked-reject .docx-insertion) {
    display: none !important;
  }

  :global(.docx-body.tracked-reject del),
  :global(.docx-body.tracked-reject .docx-delete),
  :global(.docx-body.tracked-reject .docx-deletion) {
    text-decoration: none !important;
    color: inherit !important;
    background: transparent !important;
  }
</style>
