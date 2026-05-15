<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts">
  import { apiBase } from '$lib/stores/api-base.svelte'
  import type { HealthReport } from '$lib/types/health'

  let health = $state<HealthReport | null>(null)
  let bootError = $state<string | null>(null)
  let bootStage = $state<string>('idle')

  async function boot() {
    try {
      bootStage = 'discovering api base url'
      const base = await apiBase.hydrate()

      bootStage = `probing ${base}/healthz`
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

<main class="min-h-full flex items-center justify-center p-8 bg-(--color-surface-50)">
  <div class="max-w-xl w-full space-y-6">
    <header class="space-y-2">
      <h1 class="text-3xl font-semibold text-(--color-text-primary)">MikeRust</h1>
      <p class="text-sm text-(--color-text-secondary)">
        Clean-room Svelte 5 frontend — Fase 0 scaffold
      </p>
    </header>

    <section
      class="rounded-(--radius-lg) shadow-(--shadow-sm) bg-(--color-surface-0) border border-(--color-surface-200) p-6 space-y-4"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wide text-(--color-text-secondary)">
          Boot status
        </span>
        <span
          class="text-xs font-mono px-2 py-0.5 rounded-(--radius-sm)"
          style:background={
            bootStage === 'ready'
              ? 'var(--color-success-500)'
              : bootStage === 'error'
              ? 'var(--color-danger-500)'
              : 'var(--color-warning-500)'
          }
          style:color="var(--color-text-inverse)"
        >
          {bootStage}
        </span>
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
        API base:
        <code class="font-mono">{apiBase.url || '—'}</code>
      </p>
    </section>

    <footer class="text-xs text-(--color-text-secondary) text-center">
      Plan: <code class="font-mono">docs/mikerust-ui-rewrite-plan.md</code> · v2.1
    </footer>
  </div>
</main>
