<script setup lang="ts">
const auth = useAuthState()
const { t } = useI18n()

const emit = defineEmits<{
  login: []
  submit: []
  info: []
}>()
</script>

<template>
  <section class="workbench-panel">
    <h1 class="workbench-panel__title">{{ t('workbench.title') }}</h1>

    <div class="workbench-panel__actions">
      <button
        v-if="!auth.viewer.value"
        class="button"
        type="button"
        @click="emit('login')"
      >
        <i class="button-icon fa-solid fa-right-to-bracket" aria-hidden="true" />
        <span>{{ t('workbench.actions.login') }}</span>
      </button>
      <button
        v-else
        class="button"
        type="button"
        @click="emit('submit')"
      >
        <i class="button-icon fa-solid fa-paper-plane" aria-hidden="true" />
        <span>{{ t('workbench.actions.submit') }}</span>
      </button>
      <button class="ghost-button" type="button" @click="emit('info')">
        <i class="button-icon fa-solid fa-map-location-dot" aria-hidden="true" />
        <span>{{ t('workbench.actions.overview') }}</span>
      </button>
    </div>

  </section>
</template>
