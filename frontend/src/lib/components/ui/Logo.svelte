<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  MikeRust mark — a 16-ray sunburst. Inherits `currentColor`, so the
  caller sets the colour. `spin` drives the ambient animation:
    · idle   — a slow, quiet rotation (default)
    · active — a faster spin, for "the assistant is working" states
    · none   — static
  Honours prefers-reduced-motion (animation disabled).
-->
<script lang="ts">
  interface Props {
    size?: number
    spin?: 'idle' | 'active' | 'none'
    class?: string
  }

  let { size = 40, spin = 'idle', class: extraClass = '' }: Props = $props()

  const RAYS = 16
  const rays = Array.from({ length: RAYS }, (_, i) => (i * 360) / RAYS)
</script>

<svg
  class="mike-logo mike-logo-{spin} {extraClass}"
  width={size}
  height={size}
  viewBox="0 0 100 100"
  fill="currentColor"
  aria-hidden="true"
>
  {#each rays as angle (angle)}
    <rect x="47.4" y="7" width="5.2" height="30" rx="2.6" transform="rotate({angle} 50 50)" />
  {/each}
</svg>
