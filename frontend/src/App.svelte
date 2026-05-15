<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!--
  Root dispatcher. The full SPA router (plan §13) lands in a later phase;
  for now this only forks between the boot screen and the dev playground.
-->
<script lang="ts">
  import Boot from './routes/Boot.svelte'
  import Playground from './routes/Playground.svelte'
  import ToastRegion from '$lib/components/ui/ToastRegion.svelte'

  const showPlayground = new URLSearchParams(window.location.search).has('playground')
</script>

{#if showPlayground}
  <Playground />
{:else}
  <Boot />
{/if}

<ToastRegion />
