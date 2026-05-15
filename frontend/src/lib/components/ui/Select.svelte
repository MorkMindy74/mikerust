<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts" module>
  export interface SelectOption<V extends string | number = string | number> {
    value: V
    label: string
    disabled?: boolean
  }
</script>

<script lang="ts" generics="T extends string | number">
  import type { HTMLSelectAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLSelectAttributes, 'class' | 'value' | 'size'> {
    value?: T
    options: SelectOption<T>[]
    label?: string
    hint?: string
    error?: string
    size?: 'sm' | 'md' | 'lg'
    placeholder?: string
    class?: string
  }

  let {
    value = $bindable(),
    options,
    label,
    hint,
    error,
    size = 'md',
    placeholder,
    id,
    class: extraClass = '',
    ...rest
  }: Props = $props()

  const autoId = `select-${Math.random().toString(36).slice(2, 9)}`
  const selectId = $derived(id ?? autoId)

  const sizeClass = $derived(
    { sm: 'h-8 text-xs', md: 'h-9 text-sm', lg: 'h-11 text-base' }[size]
  )
</script>

<div class="flex flex-col gap-1 {extraClass}">
  {#if label}
    <label for={selectId} class="text-xs font-medium text-(--color-text-secondary)">
      {label}
    </label>
  {/if}

  <select
    id={selectId}
    bind:value
    class="bg-(--color-surface-0) text-(--color-text-primary)
           border rounded-(--radius-md) px-3 pr-8
           transition-colors duration-(--transition-fast)
           focus:outline-none focus:ring-2 focus:ring-(--color-brand-500) focus:border-(--color-brand-500)
           disabled:opacity-50 disabled:cursor-not-allowed
           appearance-none cursor-pointer
           bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%236b7280%22><path fill-rule=%22evenodd%22 d=%22M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z%22 clip-rule=%22evenodd%22/></svg>')]
           bg-no-repeat bg-[length:16px_16px] bg-[position:right_0.625rem_center]
           {sizeClass}
           {error ? 'border-(--color-danger-500)' : 'border-(--color-surface-200)'}"
    {...rest}
  >
    {#if placeholder}
      <option value="" disabled selected={value === undefined || value === ''}>{placeholder}</option>
    {/if}
    {#each options as opt (opt.value)}
      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
    {/each}
  </select>

  {#if error}
    <p class="text-xs text-(--color-danger-500)">{error}</p>
  {:else if hint}
    <p class="text-xs text-(--color-text-secondary)">{hint}</p>
  {/if}
</div>
