<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<!-- Modal confirmation dialog for destructive or irreversible actions. -->
<script lang="ts">
  import Modal from './Modal.svelte'
  import Button from './Button.svelte'

  interface Props {
    open?: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    /** Awaited; the dialog shows a spinner until it resolves. */
    onconfirm: () => void | Promise<void>
    oncancel?: () => void
  }

  let {
    open = $bindable(false),
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onconfirm,
    oncancel,
  }: Props = $props()

  let busy = $state(false)

  function cancel() {
    if (busy) return
    open = false
    oncancel?.()
  }

  async function confirm() {
    busy = true
    try {
      await onconfirm()
      open = false
    } finally {
      busy = false
    }
  }
</script>

<Modal bind:open {title} size="sm" closeOnBackdrop={!busy} closeOnEsc={!busy} onclose={oncancel}>
  <p class="text-sm text-(--color-text-secondary)">{message}</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={cancel} disabled={busy}>{cancelLabel}</Button>
    <Button variant={danger ? 'danger' : 'primary'} loading={busy} onclick={confirm}>
      {confirmLabel}
    </Button>
  {/snippet}
</Modal>
