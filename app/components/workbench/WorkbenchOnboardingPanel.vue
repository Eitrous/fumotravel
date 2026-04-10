<script setup lang="ts">
const props = withDefaults(defineProps<{
  nextPath?: string | null
}>(), {
  nextPath: null
})

const auth = useAuthState()
const { t } = useI18n()
const username = ref('')
const saving = ref(false)
const errorMessage = ref('')

const fallbackNextPath = computed(() => props.nextPath || '/?panel=submit')

const suggestUsername = () => {
  const email = auth.viewer.value?.email || ''
  const local = email.split('@')[0]?.toLowerCase() || 'fumo_traveler'
  return local.replace(/[^a-z0-9_-]+/g, '_').slice(0, 24)
}

watch(
  () => [auth.ready.value, auth.user.value?.id, auth.viewer.value?.profile.username],
  () => {
    if (!auth.ready.value) {
      return
    }

    if (!auth.user.value) {
      void navigateTo(createWorkbenchLocation('login', {
        next: fallbackNextPath.value
      }), { replace: true })
      return
    }

    if (auth.hasUsername.value) {
      void navigateTo(fallbackNextPath.value, { replace: true })
      return
    }

    if (!username.value) {
      username.value = suggestUsername()
    }
  },
  { immediate: true }
)

const submitUsername = async () => {
  errorMessage.value = ''

  if (!username.value.trim()) {
    errorMessage.value = t('onboarding.errors.required')
    return
  }

  saving.value = true

  try {
    await $fetch('/api/profile/setup', {
      method: 'POST',
      headers: auth.authHeaders.value,
      body: {
        username: username.value.trim()
      }
    })

    await auth.refreshViewer()
    await navigateTo(fallbackNextPath.value, { replace: true })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('onboarding.errors.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="workbench-panel">
    <span class="eyebrow">{{ t('onboarding.eyebrow') }}</span>
    <h2 class="workbench-panel__title">{{ t('onboarding.title') }}</h2>

    <label class="field-label">
      <span>{{ t('onboarding.label') }}</span>
      <input
        v-model="username"
        class="field-input"
        maxlength="24"
        placeholder="marisa_fumo_trip"
        @keyup.enter="submitUsername"
      >
    </label>

    <div class="workbench-panel__actions">
      <button class="button" type="button" :disabled="saving" @click="submitUsername">
        <i class="button-icon fa-solid fa-id-card" aria-hidden="true" />
        <span>{{ saving ? t('onboarding.saving') : t('onboarding.submit') }}</span>
      </button>
    </div>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </section>
</template>
