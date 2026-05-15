<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts">
  import { apiBase } from '$lib/stores/api-base.svelte'
  import type { HealthReport } from '$lib/types/health'
  import Card from '$lib/components/ui/Card.svelte'
  import Badge from '$lib/components/ui/Badge.svelte'
  import Spinner from '$lib/components/ui/Spinner.svelte'
  import Button from '$lib/components/ui/Button.svelte'

  let health = $state<HealthReport | null>(null)
  let bootError = $state<string | null>(null)
  let bootStage = $state<'idle' | 'discovering' | 'probing' | 'ready' | 'error'>('idle')

  async function boot() {
    bootError = null
    health = null
    try {
      bootStage = 'discovering'
      const base = await apiBase.hydrate()

      bootStage = 'probing'
      const res = await fetch(`${base}/healthz`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`healthz returned ${res.status}`)
      health = (await res.json()) as HealthReport

      bootStage = 'ready'
    } catch (err) {
      bootError = (err as Error).message
      bootStage = 'error'
    }
  }

  $effect(() => {
    void boot()
  })
</script>

<div class="min-h-full flex items-center justify-center p-8 bg-(--color-surface-50)">
  <div class="max-w-xl w-full space-y-6">
    <header class="space-y-2">
      <h1 class="text-3xl font-semibold text-(--color-text-primary)">MikeRust</h1>
      <p class="text-sm text-(--color-text-secondary)">
        Clean-room Svelte 5 frontend — Fase 1 design system
      </p>
    </header>

    <Card>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wide text-(--color-text-secondary)">
            Boot status
          </span>
          {#if bootStage === 'ready'}
            <Badge tone="success">ready</Badge>
          {:else if bootStage === 'error'}
            <Badge tone="danger">error</Badge>
          {:else}
            <span class="inline-flex items-center gap-2 text-xs text-(--color-text-secondary)">
              <Spinner size="sm" />
              {bootStage}
            </span>
          {/if}
        </div>

        {#if bootError}
          <div class="text-sm text-(--color-danger-500) font-mono whitespace-pre-wrap">
            {bootError}
          </div>
          <p class="text-xs text-(--color-text-secondary)">
            Backend likely not listening. Start it with
            <code class="font-mono">cargo tauri dev --config src-tauri/tauri.svelte.conf.json</code>
            from the repo root.
          </p>
          <Button size="sm" variant="secondary" onclick={() => boot()}>Retry</Button>
        {/if}

        {#if health}
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-(--color-text-secondary)">Backend version</dt>
            <dd class="font-mono">{health.version}</dd>

            <dt class="text-(--color-text-secondary)">Uptime</dt>
            <dd class="font-mono">{health.uptime_secs}s</dd>

            <dt class="text-(--color-text-secondary)">DB pool</dt>
            <dd class="font-mono">{health.db.size} (idle {health.db.idle})</dd>

            <dt class="text-(--color-text-secondary)">RAG</dt>
            <dd class="font-mono">{health.rag.status}</dd>

            <dt class="text-(--color-text-secondary)">Workflows</dt>
            <dd class="font-mono">{health.presets.workflows}</dd>

            <dt class="text-(--color-text-secondary)">Column presets</dt>
            <dd class="font-mono">{health.presets.columns}</dd>

            <dt class="text-(--color-text-secondary)">DOCX templates</dt>
            <dd class="font-mono">{health.presets.docx_templates}</dd>

            <dt class="text-(--color-text-secondary)">LLM providers</dt>
            <dd class="font-mono">{health.presets.model_providers}</dd>
          </dl>
        {/if}

        <p class="text-xs text-(--color-text-secondary) pt-2 border-t border-(--color-surface-100)">
          API base: <code class="font-mono">{apiBase.url || '—'}</code>
        </p>
      </div>
    </Card>

    <footer class="text-xs text-(--color-text-secondary) text-center">
      Append <code class="font-mono">?playground</code> to the URL for the component gallery.
    </footer>
  </div>
</div>
