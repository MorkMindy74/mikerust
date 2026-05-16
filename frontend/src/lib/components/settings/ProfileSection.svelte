<!-- Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only. -->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import { userStore } from '$lib/stores/user.svelte'
  import { toastStore } from '$lib/stores/toast.svelte'
  import { DOMAINS, domainLabel } from '$lib/types/domain'
  import { LOCALES, type Locale } from '$lib/types/user'
  import type { Domain } from '$lib/types/domain'

  const LOCALE_LABELS: Record<Locale, string> = {
    en: 'English',
    it: 'Italiano',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
    pt: 'Português',
  }

  let displayName = $state(userStore.profile?.display_name ?? '')
  let savingName = $state(false)

  const nameDirty = $derived(
    displayName.trim() !== (userStore.profile?.display_name ?? '')
  )

  const localeOptions = LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))
  const domainOptions = DOMAINS.map((d) => ({ value: d, label: domainLabel(d) }))

  async function saveName() {
    savingName = true
    try {
      await userStore.setDisplayName(displayName.trim() || null)
      toastStore.success('Display name updated')
    } catch (e) {
      toastStore.danger('Could not update name', { detail: (e as Error).message })
    } finally {
      savingName = false
    }
  }

  async function changeLocale(next: Locale) {
    try {
      await userStore.setLocale(next)
      toastStore.success('Language updated')
    } catch (e) {
      toastStore.danger('Could not update language', { detail: (e as Error).message })
    }
  }

  async function changeDomain(next: Domain) {
    try {
      await userStore.setDefaultDomain(next)
      toastStore.success('Default domain updated')
    } catch (e) {
      toastStore.danger('Could not update domain', { detail: (e as Error).message })
    }
  }
</script>

<div class="space-y-4">
  <Card title="Profile">
    <div class="space-y-4">
      <div class="grid grid-cols-[140px_1fr] items-center gap-3">
        <span class="text-sm text-(--color-text-secondary)">Username</span>
        <span class="text-sm font-mono text-(--color-text-primary)">
          {userStore.profile?.username ?? '—'}
        </span>
      </div>

      <div class="flex items-end gap-2">
        <Input
          label="Display name"
          bind:value={displayName}
          placeholder="Shown in the greeting"
          class="flex-1"
        />
        <Button size="md" disabled={!nameDirty} loading={savingName} onclick={saveName}>
          Save
        </Button>
      </div>

      {#if userStore.profile?.created_at}
        <div class="grid grid-cols-[140px_1fr] items-center gap-3">
          <span class="text-sm text-(--color-text-secondary)">Created</span>
          <span class="text-sm text-(--color-text-primary)">
            {new Date(userStore.profile.created_at).toLocaleDateString()}
          </span>
        </div>
      {/if}
    </div>
  </Card>

  <Card title="Preferences">
    <div class="grid grid-cols-2 gap-4">
      <Select
        label="Language"
        options={localeOptions}
        value={userStore.locale}
        onchange={(e) => changeLocale((e.currentTarget as HTMLSelectElement).value as Locale)}
      />
      <Select
        label="Default domain"
        options={domainOptions}
        value={userStore.defaultDomain}
        onchange={(e) => changeDomain((e.currentTarget as HTMLSelectElement).value as Domain)}
      />
    </div>
    <p class="text-xs text-(--color-text-secondary) mt-3">
      The default domain pre-selects the professional vertical in the create
      dialogs for workflows, projects and reviews.
    </p>
  </Card>
</div>
