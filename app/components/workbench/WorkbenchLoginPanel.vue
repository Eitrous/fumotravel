<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '~~/shared/fumo'

type AuthMode = 'password' | 'link' | 'register'

const props = withDefaults(defineProps<{
  nextPath?: string | null
}>(), {
  nextPath: null
})
const emit = defineEmits<{
  notice: [message: string]
}>()

const auth = useAuthState()
const { t } = useI18n()
const mode = ref<AuthMode>('password')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const fallbackNextPath = computed(() => props.nextPath || '/')
const requiresPassword = computed(() => mode.value !== 'link')
const requiresConfirmPassword = computed(() => mode.value === 'register')

const modeOptions = computed(() => [
  {
    value: 'password' as const,
    label: t('auth.passwordLogin'),
    icon: 'fa-key'
  },
  {
    value: 'link' as const,
    label: t('auth.linkLogin'),
    icon: 'fa-envelope'
  },
  {
    value: 'register' as const,
    label: t('auth.register'),
    icon: 'fa-user-plus'
  }
])

const panelTitle = computed(() => t(`auth.modes.${mode.value}.title`))
const panelDescription = computed(() => t(`auth.modes.${mode.value}.description`))

const primaryActionLabel = computed(() => {
  if (submitting.value) {
    return t('auth.submitting')
  }

  return t(`auth.modes.${mode.value}.submit`)
})

const primaryActionIcon = computed(() => {
  return modeOptions.value.find((option) => option.value === mode.value)?.icon || 'fa-key'
})

const redirectAfterLogin = async () => {
  if (!auth.ready.value || !auth.user.value) {
    return
  }

  if (!auth.viewer.value) {
    await auth.refreshViewer()
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

const setMode = (nextMode: AuthMode) => {
  mode.value = nextMode
  errorMessage.value = ''
  successMessage.value = ''
}

const validateForm = () => {
  if (!email.value.trim()) {
    errorMessage.value = t('auth.errors.requiredEmail')
    return false
  }

  if (requiresPassword.value && password.value.length < MIN_PASSWORD_LENGTH) {
    errorMessage.value = t('auth.errors.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
    return false
  }

  if (requiresConfirmPassword.value && password.value !== confirmPassword.value) {
    errorMessage.value = t('auth.errors.passwordMismatch')
    return false
  }

  return true
}

const submitAuth = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!validateForm()) {
    return
  }

  submitting.value = true

  try {
    const nextEmail = email.value.trim()

    if (mode.value === 'password') {
      await auth.signInWithPassword(nextEmail, password.value)
      await redirectAfterLogin()
      return
    }

    if (mode.value === 'register') {
      const data = await auth.signUpWithPassword(nextEmail, password.value)
      if (data.session) {
        await redirectAfterLogin()
        return
      }

      emit('notice', t('auth.registrationNeedsConfirmation'))
      return
    }

    await auth.sendMagicLink(nextEmail, fallbackNextPath.value)
    successMessage.value = t('auth.magicLinkSuccess')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t(`auth.errors.${mode.value}Failed`)
  } finally {
    submitting.value = false
  }
}

const handleEnter = () => {
  void submitAuth()
}

const submitGitHub = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  submitting.value = true

  try {
    await auth.signInWithGitHub(fallbackNextPath.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.errors.githubFailed')
  } finally {
    submitting.value = false
  }
}

const canSubmit = computed(() => {
  return Boolean(email.value.trim()) && !submitting.value
})

useWorkbenchToolbarAction(computed(() => ({
  label: primaryActionLabel.value,
  icon: primaryActionIcon.value,
  run: submitAuth,
  disabled: !canSubmit.value,
  loading: submitting.value
})))
</script>

<template>
  <section class="workbench-panel workbench-panel--poster">
    <span class="eyebrow">{{ t('auth.eyebrow') }}</span>
    <h2 class="workbench-panel__title workbench-panel__title--poster">{{ panelTitle }}</h2>
    <p class="workbench-panel__copy workbench-panel__copy--poster">{{ panelDescription }}</p>

    <div class="auth-mode-switcher" role="tablist" :aria-label="t('auth.modeLabel')">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        class="workbench-icon-button"
        :class="{ 'is-active': mode === option.value }"
        type="button"
        role="tab"
        :aria-selected="mode === option.value"
        :title="option.label"
        :aria-label="option.label"
        @click="setMode(option.value)"
      >
        <i class="button-icon fa-solid" :class="option.icon" aria-hidden="true" />
        <span class="sr-only">{{ option.label }}</span>
      </button>
    </div>

    <button
      class="auth-oauth-button"
      type="button"
      :disabled="submitting"
      :title="t('auth.githubLogin')"
      :aria-label="t('auth.githubLogin')"
      @click="submitGitHub"
    >
      <i class="fa-brands fa-github" aria-hidden="true" />
      <span>{{ t('auth.githubLogin') }}</span>
    </button>

    <label class="field-label">
      <span>{{ t('auth.emailLabel') }}</span>
      <input
        v-model="email"
        class="field-input"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        @keyup.enter="handleEnter"
      >
    </label>

    <label v-if="requiresPassword" class="field-label">
      <span>{{ t('auth.passwordLabel') }}</span>
      <input
        v-model="password"
        class="field-input"
        type="password"
        :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
        :placeholder="t('auth.passwordPlaceholder', { min: MIN_PASSWORD_LENGTH })"
        @keyup.enter="handleEnter"
      >
    </label>

    <label v-if="requiresConfirmPassword" class="field-label">
      <span>{{ t('auth.confirmPasswordLabel') }}</span>
      <input
        v-model="confirmPassword"
        class="field-input"
        type="password"
        autocomplete="new-password"
        :placeholder="t('auth.confirmPasswordPlaceholder')"
        @keyup.enter="handleEnter"
      >
    </label>

    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </section>
</template>
