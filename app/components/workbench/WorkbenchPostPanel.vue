<script setup lang="ts">
import type { PublicPostDetail } from '~~/shared/fumo'

const props = defineProps<{
  postId: number
}>()

const auth = useAuthState()
const { t } = useI18n()
const { formatDateTime, formatLatLng, privacyModeLabel } = useFormatters()

const loading = ref(true)
const errorMessage = ref('')
const post = ref<PublicPostDetail | null>(null)

const loadPost = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    post.value = await $fetch<PublicPostDetail>(`/api/posts/${props.postId}`)
  } catch (error) {
    post.value = null
    errorMessage.value = error instanceof Error ? error.message : t('post.errors.loadFailed')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.postId,
  () => {
    void loadPost()
  },
  { immediate: true }
)

const openSubmit = async () => {
  await auth.init()

  if (!auth.user.value) {
    await navigateTo(createWorkbenchLocation('login', {
      next: '/?panel=submit'
    }))
    return
  }

  if (!auth.hasUsername.value) {
    await navigateTo(createWorkbenchLocation('onboarding', {
      next: '/?panel=submit'
    }))
    return
  }

  await navigateTo(createWorkbenchLocation('submit'))
}
</script>

<template>
  <section class="workbench-panel workbench-panel--detail">
    <template v-if="loading">
      <div class="empty-state empty-state--inline">
        <h2>{{ t('post.loadingTitle') }}</h2>
      </div>
    </template>

    <template v-else-if="post">
      <span class="eyebrow">{{ t('post.eyebrow') }}</span>
      <h2 class="workbench-panel__title">{{ post.title }}</h2>

      <div class="detail-meta">
        <span class="status-inline">@{{ post.author.username }}</span>
        <span class="status-inline">{{ post.placeName || t('post.unnamedPlaceName') }}</span>
        <span class="status-inline">{{ privacyModeLabel(post.privacyMode) }}</span>
      </div>

      <div v-if="post.imageUrl" class="workbench-detail-media">
        <img :src="post.imageUrl" :alt="post.title">
      </div>

      <div class="workbench-detail-grid">
        <div v-if="post.body" class="field-grid">
          <strong>{{ t('post.authorNote') }}</strong>
          <p class="support-copy">{{ post.body }}</p>
        </div>

        <div class="field-grid">
          <strong>{{ t('post.locationInfo') }}</strong>
          <p v-if="post.placeName" class="support-copy">{{ post.placeName }}</p>
          <p v-if="[post.cityName, post.regionName, post.countryName].filter(Boolean).length" class="support-copy">
            {{ [post.cityName, post.regionName, post.countryName].filter(Boolean).join(' / ') }}
          </p>
          <p class="support-copy">{{ t('post.publicCoordinates', { value: formatLatLng(post.publicLocation) }) }}</p>
          <p class="support-copy">{{ t('post.capturedAt', { value: formatDateTime(post.capturedAt) }) }}</p>
        </div>
      </div>

      <div class="field-grid">
        <strong>{{ t('post.preview') }}</strong>
        <LocationPreviewMap :public-location="post.publicLocation" :compact="true" />
      </div>

      <div class="workbench-panel__actions">
        <button class="ghost-button" type="button" @click="navigateTo(createWorkbenchLocation('info'))">
          <i class="button-icon fa-solid fa-arrow-left" aria-hidden="true" />
          <span>{{ t('common.backToMapOverview') }}</span>
        </button>
        <button class="button" type="button" @click="openSubmit">
          <i class="button-icon fa-solid fa-paper-plane" aria-hidden="true" />
          <span>{{ t('post.openSubmit') }}</span>
        </button>
      </div>
    </template>

    <div v-else class="empty-state empty-state--inline">
      <h2>{{ t('post.unavailableTitle') }}</h2>
      <p v-if="errorMessage">{{ errorMessage }}</p>
      <button class="button" type="button" @click="navigateTo(createWorkbenchLocation('info'))">
        <i class="button-icon fa-solid fa-arrow-left" aria-hidden="true" />
        <span>{{ t('common.backToMapOverview') }}</span>
      </button>
    </div>
  </section>
</template>
