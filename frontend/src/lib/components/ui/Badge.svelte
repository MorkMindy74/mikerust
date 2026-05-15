<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts" module>
  export type BadgeTone =
    | 'neutral'
    | 'brand'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'assistant'  // blu — workflow type Assistant (brand audit)
    | 'tabular'    // viola — workflow type Tabular (brand audit)
    | 'level'      // arancio — DOCX template levels L1/L2/L3
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    tone?: BadgeTone
    size?: 'xs' | 'sm'
    children: Snippet
    class?: string
  }

  let {
    tone = 'neutral',
    size = 'sm',
    children,
    class: extraClass = '',
  }: Props = $props()

  const sizeClass = $derived(
    size === 'xs' ? 'px-1.5 py-0 text-[10px] h-4' : 'px-2 py-0.5 text-xs h-5'
  )

  const toneClass = $derived(
    {
      neutral:
        'bg-(--color-surface-100) text-(--color-text-secondary)',
      brand:
        'bg-(--color-brand-50) text-(--color-brand-700)',
      success:
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      warning:
        'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      danger:
        'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      info:
        'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      assistant:
        'bg-[var(--badge-assistant-bg)] text-[var(--badge-assistant-fg)]',
      tabular:
        'bg-[var(--badge-tabular-bg)] text-[var(--badge-tabular-fg)]',
      level:
        'bg-[var(--badge-level-bg)] text-[var(--badge-level-fg)]',
    }[tone]
  )
</script>

<span
  class="inline-flex items-center font-medium rounded-(--radius-sm)
         whitespace-nowrap
         {sizeClass} {toneClass} {extraClass}"
>
  {@render children()}
</span>
