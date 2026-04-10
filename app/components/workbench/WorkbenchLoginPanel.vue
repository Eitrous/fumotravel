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

const canSubmit = computed(() => {
  return Boolean(email.value.trim()) && !sending.value
})

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

useWorkbenchToolbarAction(computed(() => ({
  label: sending.value ? t('auth.sending') : t('auth.sendLink'),
  icon: 'fa-envelope',
  run: sendMagicLink,
  disabled: !canSubmit.value,
  loading: sending.value
})))
</script>

<template>
  <section class="workbench-panel workbench-panel--poster">
    <span class="eyebrow">{{ t('auth.eyebrow') }}</span>
    <h2 class="workbench-panel__title workbench-panel__title--poster">{{ t('auth.title') }}</h2>
    <p class="workbench-panel__copy workbench-panel__copy--poster">{{ t('auth.description') }}</p>

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

    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </section>
</template>
