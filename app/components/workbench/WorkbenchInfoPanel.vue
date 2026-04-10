<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <section class="workbench-panel workbench-panel--poster workbench-panel--home">
    <p class="workbench-poster__hello">{{ t('workbench.posterGreeting') }}</p>

    <div class="workbench-poster__block">
      <p class="workbench-poster__lead">{{ t('workbench.posterIntro') }}</p>
      <h2 class="workbench-panel__title workbench-panel__title--poster">
        {{ t('workbench.posterExplore') }}
      </h2>
    </div>

    <div class="workbench-poster__block">
      <p class="workbench-poster__lead">{{ t('workbench.posterShareLead') }}</p>
      <h2 class="workbench-panel__title workbench-panel__title--poster">
        {{ t('workbench.posterShare') }}
      </h2>
    </div>

    <p class="workbench-poster__closing">{{ t('workbench.posterClosing') }}</p>
  </section>
</template>
