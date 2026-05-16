<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
  import { userApi } from '$lib/api/user'
  import { authStore } from '$lib/stores/auth.svelte'
  import { userStore } from '$lib/stores/user.svelte'
  import { router } from '$lib/stores/router.svelte'
  import { toastStore } from '$lib/stores/toast.svelte'

  let confirmOpen = $state(false)

  async function deleteAccount() {
    try {
      await userApi.deleteAccount()
      authStore.invalidate()
      userStore.reset()
      toastStore.info('Account deleted')
      router.go('setup')
    } catch (e) {
      toastStore.danger('Could not delete account', { detail: (e as Error).message })
    }
  }
</script>

<Card title="Danger zone">
  <div class="flex items-center justify-between gap-4">
    <div class="space-y-0.5">
      <p class="text-sm font-medium text-(--color-text-primary)">Delete account</p>
      <p class="text-xs text-(--color-text-secondary)">
        Permanently removes the profile and all associated data — chats,
        documents, workflows, reviews. This cannot be undone.
      </p>
    </div>
    <Button variant="danger" onclick={() => (confirmOpen = true)}>Delete account</Button>
  </div>
</Card>

<ConfirmDialog
  bind:open={confirmOpen}
  title="Delete account?"
  message="This permanently deletes your profile and every chat, document, workflow and review. There is no recovery."
  confirmLabel="Delete everything"
  danger
  onconfirm={deleteAccount}
/>
