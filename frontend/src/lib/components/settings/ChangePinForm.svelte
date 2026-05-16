<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts">
  import Input from '$lib/components/ui/Input.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import { authApi } from '$lib/api/auth'
  import { isValidPinFormat, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '$lib/types/auth'
  import { ApiError } from '$lib/types/error'
  import { toastStore } from '$lib/stores/toast.svelte'

  let currentPin = $state('')
  let newPin = $state('')
  let confirmPin = $state('')
  let submitting = $state(false)
  let formError = $state<string | null>(null)

  const newPinError = $derived.by(() => {
    if (newPin.length === 0) return undefined
    if (!isValidPinFormat(newPin)) return `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`
    return undefined
  })
  const confirmError = $derived.by(() => {
    if (confirmPin.length === 0) return undefined
    if (confirmPin !== newPin) return 'PINs do not match'
    return undefined
  })
  const canSubmit = $derived(
    currentPin.length > 0 &&
      isValidPinFormat(newPin) &&
      newPin === confirmPin &&
      !submitting
  )

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!canSubmit) return
    submitting = true
    formError = null
    try {
      await authApi.changePin(currentPin, newPin)
      toastStore.success('PIN changed')
      currentPin = ''
      newPin = ''
      confirmPin = ''
    } catch (err) {
      formError = err instanceof ApiError ? err.detail : (err as Error).message
    } finally {
      submitting = false
    }
  }
</script>

<form class="space-y-4 max-w-sm" onsubmit={submit}>
  <Input
    label="Current PIN"
    type="password"
    bind:value={currentPin}
    inputmode="numeric"
    maxlength={PIN_MAX_LENGTH}
    autocomplete="current-password"
  />
  <Input
    label="New PIN"
    type="password"
    bind:value={newPin}
    inputmode="numeric"
    maxlength={PIN_MAX_LENGTH}
    error={newPinError}
    autocomplete="new-password"
  />
  <Input
    label="Confirm new PIN"
    type="password"
    bind:value={confirmPin}
    inputmode="numeric"
    maxlength={PIN_MAX_LENGTH}
    error={confirmError}
    autocomplete="new-password"
  />
  {#if formError}
    <p class="text-sm text-(--color-danger-500)">{formError}</p>
  {/if}
  <Button type="submit" loading={submitting} disabled={!canSubmit}>Change PIN</Button>
</form>
