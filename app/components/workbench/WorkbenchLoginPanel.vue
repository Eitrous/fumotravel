<script setup lang="ts">
const props = withDefaults(defineProps<{
  nextPath?: string | null
}>(), {
  nextPath: null
})

const auth = useAuthState()
const { t } = useI18n()
const email = ref('')
const sending = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const fallbackNextPath = computed(() => props.nextPath || '/?panel=submit')

const redirectAfterLogin = async () => {
  if (!auth.ready.value || !auth.user.value) {
    return
  }

  if (!auth.hasUsername.value) {
    await navigateTo(createWorkbenchLocation('onboarding', {
      next: fallbackNextPath.value
    }), { replace: true })
    return
  }

  await navigateTo(fallbackNextPath.value, { replace: true })
}

watch(
  () => [auth.ready.value, auth.user.value?.id, auth.hasUsername.value],
  () => {
    void redirectAfterLogin()
  },
  { immediate: true }
)

const sendMagicLink = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value.trim()) {
    errorMessage.value = t('auth.errors.requiredEmail')
    return
  }

  sending.value = true

  try {
    await auth.sendMagicLink(email.value.trim(), fallbackNextPath.value)
    successMessage.value = t('auth.success')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.errors.sendFailed')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="workbench-panel">
    <span class="eyebrow">{{ t('auth.eyebrow') }}</span>
    <h2 class="workbench-panel__title">{{ t('auth.title') }}</h2>

    <label class="field-label">
      <span>{{ t('auth.emailLabel') }}</span>
      <input
        v-model="email"
        class="field-input"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        @keyup.enter="sendMagicLink"
      >
    </label>

    <div class="workbench-panel__actions">
      <button class="button" type="button" :disabled="sending" @click="sendMagicLink">
        <i class="button-icon fa-solid fa-envelope" aria-hidden="true" />
        <span>{{ sending ? t('auth.sending') : t('auth.sendLink') }}</span>
      </button>
      <button class="ghost-button" type="button" @click="navigateTo(createWorkbenchLocation('info'))">
        <i class="button-icon fa-solid fa-map-location-dot" aria-hidden="true" />
        <span>{{ t('auth.browseFirst') }}</span>
      </button>
    </div>

    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </section>
</template>
