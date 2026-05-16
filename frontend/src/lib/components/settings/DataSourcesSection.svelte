<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  Settings → Data sources. Sub-nav over the document corpora the user
  can index into the RAG knowledge base: local folder sync plus every
  corpus plugin registered in config/corpora-plugins/ (EUR-Lex,
  Italian Legal, CNIL, …).
-->
<script lang="ts">
  import SyncSection from './SyncSection.svelte'
  import EurlexSection from './EurlexSection.svelte'
  import CorpusSection from './CorpusSection.svelte'
  import Spinner from '$lib/components/ui/Spinner.svelte'
  import { corporaApi, type CorpusItem } from '$lib/api/data-sources'
  import { i18n } from '$lib/stores/i18n.svelte'
  import { ChevronLeft, ChevronRight } from 'lucide-svelte'

  let corpora = $state<CorpusItem[]>([])
  let loading = $state(true)
  /** 'sync' or a corpus id. */
  let active = $state<string>('sync')

  $effect(() => {
    corporaApi
      .list()
      .then((r) => (corpora = r.corpora))
      .catch(() => (corpora = []))
      .finally(() => (loading = false))
  })

  const activeCorpus = $derived(corpora.find((c) => c.id === active))

  // ── horizontally-scrollable tab strip ────────────────────────────
  let strip = $state<HTMLDivElement>()
  let overflowing = $state(false)

  function measure() {
    if (strip) overflowing = strip.scrollWidth > strip.clientWidth + 4
  }
  $effect(() => {
    void corpora.length
    queueMicrotask(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  function scrollStrip(dir: -1 | 1) {
    strip?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }
</script>

<div class="space-y-4">
  <div class="flex items-center border-b border-(--color-surface-200)">
    {#if overflowing}
      <button
        type="button"
        class="shrink-0 px-1 h-9 text-(--color-text-secondary) hover:text-(--color-text-primary)"
        aria-label={i18n.t('Common.previous')}
        onclick={() => scrollStrip(-1)}
      >
        <ChevronLeft size={16} />
      </button>
    {/if}
    <div bind:this={strip} class="flex gap-1 overflow-x-auto no-scrollbar flex-1">
      <button
        type="button"
        onclick={() => (active = 'sync')}
        class="px-3 h-9 text-sm border-b-2 -mb-px whitespace-nowrap
               {active === 'sync'
                 ? 'border-(--color-brand-500) text-(--color-text-primary) font-medium'
                 : 'border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'}"
      >
        {i18n.t('Account.localDocsLink')}
      </button>
      {#each corpora as c (c.id)}
        <button
          type="button"
          onclick={() => (active = c.id)}
          class="px-3 h-9 text-sm border-b-2 -mb-px whitespace-nowrap
                 {active === c.id
                   ? 'border-(--color-brand-500) text-(--color-text-primary) font-medium'
                   : 'border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'}"
        >
          {c.display_name}
        </button>
      {/each}
      {#if loading}
        <span class="flex items-center px-2"><Spinner size="sm" /></span>
      {/if}
    </div>
    {#if overflowing}
      <button
        type="button"
        class="shrink-0 px-1 h-9 text-(--color-text-secondary) hover:text-(--color-text-primary)"
        aria-label={i18n.t('Common.next')}
        onclick={() => scrollStrip(1)}
      >
        <ChevronRight size={16} />
      </button>
    {/if}
  </div>

  {#if active === 'sync'}
    <SyncSection />
  {:else if active === 'eurlex'}
    <EurlexSection />
  {:else if activeCorpus}
    {#key activeCorpus.id}
      <CorpusSection corpus={activeCorpus} />
    {/key}
  {/if}
</div>
