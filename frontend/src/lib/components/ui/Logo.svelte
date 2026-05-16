<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  MikeRust mark — the 3×3 rust-gradient grid (src/assets/mikerust_logo_3x3.svg).
  `activity` pulses the bottom-right square and recolours the grid:
    · idle     — static, native rust palette
    · thinking — pulsing, rust (an LLM call is in flight)
    · docx     — pulsing, blue (generating a .docx from a template)
    · upload   — pulsing, green (extracting text from an uploaded file)
  Honours prefers-reduced-motion (no pulse).
-->
<script lang="ts">
  interface Props {
    size?: number
    activity?: 'idle' | 'thinking' | 'docx' | 'upload'
    class?: string
  }

  let { size = 40, activity = 'idle', class: extraClass = '' }: Props = $props()

  // Grid geometry mirrors mikerust_logo_3x3.svg (group translated to 250,250).
  const COORD = [-135, -45, 45]
  const FILLS = [
    ['#431407', '#7C2D0A', '#9A3412'],
    ['#7C2D0A', '#C2410C', '#EA580C'],
    ['#9A3412', '#EA580C', '#F97316'],
  ]
  const cells = COORD.flatMap((y, row) =>
    COORD.map((x, col) => ({
      x,
      y,
      fill: FILLS[row][col],
      // The bright bottom-right square is the one that pulses.
      corner: row === 2 && col === 2,
    })),
  )
</script>

<svg
  class="mike-logo mike-logo-{activity} {extraClass}"
  width={size}
  height={size}
  viewBox="105 105 280 280"
  role="img"
  aria-label="MikeRust"
>
  <g transform="translate(250,250)">
    {#each cells as c (`${c.x},${c.y}`)}
      <rect
        x={c.x}
        y={c.y}
        width="80"
        height="80"
        fill={c.fill}
        class={c.corner ? 'mike-logo-cell mike-logo-corner' : 'mike-logo-cell'}
      />
    {/each}
  </g>
</svg>
