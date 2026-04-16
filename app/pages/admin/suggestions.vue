<script setup lang="ts">
import type { AdminSuggestionItem } from '~~/shared/fumo'

definePageMeta({
  layout: 'admin',
  middleware: ['require-admin']
})

const auth = useAuthState()
const { formatDateTime } = useFormatters({ locale: 'zh-CN' })

const suggestions = ref<AdminSuggestionItem[]>([])
const loading = ref(true)
const errorMessage = ref('')

const normalizeApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      statusMessage?: unknown
      data?: { statusMessage?: unknown }
    }

    if (typeof maybeError.statusMessage === 'string' && maybeError.statusMessage.trim()) {
      return maybeError.statusMessage
    }

    if (typeof maybeError.data?.statusMessage === 'string' && maybeError.data.statusMessage.trim()) {
      return maybeError.data.statusMessage
    }
  }

  return fallback
}

const displayAuthor = (item: AdminSuggestionItem) => {
  if (item.author.username) {
    return `@${item.author.username}`
  }

  return `用户 ${item.author.id.slice(0, 8)}`
}

const loadSuggestions = async () => {
  if (!auth.authHeaders.value.Authorization) {
    return
  }

  loading.value = true

  try {
    suggestions.value = await $fetch<AdminSuggestionItem[]>('/api/admin/suggestions', {
      headers: auth.authHeaders.value
    })
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = normalizeApiErrorMessage(error, '建议列表加载失败。')
  } finally {
    loading.value = false
  }
}

watch(
  () => [auth.ready.value, auth.isAdmin.value],
  ([ready, isAdmin]) => {
    if (ready && isAdmin) {
      void loadSuggestions()
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="page-shell">
    <section class="panel panel--page">
      <span class="eyebrow">Admin Suggestions</span>
      <h1 class="page-title">用户建议</h1>
      <p class="lede">仅管理员可见，按提交时间倒序展示。</p>
    </section>

    <section class="panel panel--page admin-suggestion-panel">
      <div class="admin-suggestion-panel__head">
        <p class="status-inline">
          {{ loading ? '正在加载建议…' : `共 ${suggestions.length} 条建议` }}
        </p>

        <button
          class="workbench-icon-button"
          type="button"
          :title="loading ? '正在刷新' : '刷新建议列表'"
          :aria-label="loading ? '正在刷新' : '刷新建议列表'"
          :disabled="loading"
          @click="loadSuggestions"
        >
          <i
            class="button-icon fa-solid"
            :class="loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'"
            aria-hidden="true"
          />
          <span class="sr-only">刷新建议列表</span>
        </button>
      </div>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <ul v-else-if="suggestions.length" class="admin-suggestion-list">
        <li
          v-for="item in suggestions"
          :key="item.id"
          class="admin-suggestion-item"
        >
          <div class="admin-suggestion-item__meta">
            <strong>{{ displayAuthor(item) }}</strong>
            <span>{{ formatDateTime(item.createdAt) }}</span>
          </div>

          <p>{{ item.content }}</p>
        </li>
      </ul>

      <p v-else-if="!loading" class="status-inline">暂无建议。</p>
    </section>
  </main>
</template>
