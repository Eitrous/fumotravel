<script setup lang="ts">
const { t } = useI18n()

const emit = defineEmits<{
  openFeedback: []
}>()

const openFeedback = () => {
  emit('openFeedback')
}
</script>

<template>
  <section class="workbench-panel workbench-panel--home workbench-panel--home-quote">
    <p class="workbench-home-quote__lead">And God said,</p>

    <i
      class="workbench-home-quote__mark workbench-home-quote__mark--left fa-solid fa-quote-left"
      aria-hidden="true"
    />

    <h2 class="workbench-home-quote__title">Let there be Fumo</h2>

    <i
      class="workbench-home-quote__mark workbench-home-quote__mark--right fa-solid fa-quote-right"
      aria-hidden="true"
    />

    <a
      class="workbench-home-quote__blog-link"
      href="https://blog.0x-3f.com/2026/04/12/fumospots_manual/"
      target="_blank"
      rel="noopener noreferrer"
      title="Blog"
      aria-label="Blog"
    >
      <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
      <span class="sr-only">Blog</span>
    </a>

    <button
      class="workbench-home-quote__feedback-link"
      type="button"
      :title="t('suggestions.quickAction')"
      :aria-label="t('suggestions.quickAction')"
      @click="openFeedback"
    >
      <i class="fa-regular fa-comment-dots" aria-hidden="true" />
      <span class="sr-only">{{ t('suggestions.quickAction') }}</span>
    </button>
  </section>
</template>
