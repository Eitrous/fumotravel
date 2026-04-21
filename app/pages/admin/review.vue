<script setup lang="ts">
import type { AdminReviewPost } from '~~/shared/fumo'
import { normalizeApiErrorMessage } from '~~/app/composables/normalizeApiErrorMessage'

definePageMeta({
  layout: 'admin',
  middleware: ['require-admin']
})

const auth = useAuthState()
const { formatDateTime, formatLatLng, privacyModeLabel } = useFormatters({ locale: 'zh-CN' })
const { invalidatePostDetail } = usePostDetailCache()
const { invalidateUserPage } = useUserPageCache()
const { invalidateRegionPages } = useRegionPageCache()

const posts = ref<AdminReviewPost[]>([])
const selectedKey = ref<string | null>(null)
const selectedPhotoIndex = ref(0)
const reviewNote = ref('')
const loading = ref(true)
const submitting = ref(false)
const feedbackMessage = ref('')
const errorMessage = ref('')

type MigrationStatsResponse = {
  totals: {
    pendingRows: number
    pendingPaths: number
  }
}

type MigrationCursor = {
  postsAfterId: number
  revisionsAfterId: number
}

type MigrationConvertResponse = {
  wouldUpdate: {
    postCovers: number
    postPhotos: number
    revisionCovers: number
    revisionPhotos: number
  }
  updated: {
    postCovers: number
    postPhotos: number
    revisionCovers: number
    revisionPhotos: number
  }
  conversions: {
    convertedPaths: number
    skippedPaths: number
    failedPaths: number
    failures: Array<{
      sourcePath: string
      message: string
    }>
  }
  updates: {
    failedRows: number
    failures: Array<{
      scope: string
      key: string
      message: string
    }>
  }
  cursor: MigrationCursor
  hasMore: boolean
}

type MigrationFailurePreview = {
  scope: string
  key: string
  message: string
}

type MigrationRunSummary = {
  batchCount: number
  convertedPaths: number
  skippedPaths: number
  updatedRows: number
  failedPaths: number
  failedRows: number
}

type LocationBackfillStatsResponse = {
  totals: {
    posts: number
    revisions: number
    eligibleRows: number
  }
}

type LocationBackfillRunResponse = {
  dryRun: boolean
  batchSize: number
  processed: {
    posts: number
    revisions: number
  }
  wouldUpdate: {
    posts: number
    revisions: number
  }
  updated: {
    posts: number
    revisions: number
  }
  failures: {
    geocode: number
    updates: number
    items: Array<{
      stage: 'geocode' | 'update'
      scope: 'posts' | 'post_revisions'
      key: string
      message: string
    }>
  }
  cursor: MigrationCursor
  hasMore: boolean
}

type LocationBackfillFailurePreview = {
  stage: 'geocode' | 'update'
  scope: 'posts' | 'post_revisions'
  key: string
  message: string
}

type LocationBackfillRunSummary = {
  batchCount: number
  processedRows: number
  wouldUpdateRows: number
  updatedRows: number
  failedGeocode: number
  failedUpdates: number
}

const MIGRATION_BATCH_SIZE = 30
const MIGRATION_FAILURE_PREVIEW_LIMIT = 8
const LOCATION_BACKFILL_BATCH_SIZE = 30

const migrationStats = ref<MigrationStatsResponse | null>(null)
const migrationStatsLoading = ref(false)
const migrationPreparing = ref(false)
const migrationRunning = ref(false)
const migrationProgressMessage = ref('')
const migrationFeedbackMessage = ref('')
const migrationErrorMessage = ref('')
const migrationFailurePreview = ref<MigrationFailurePreview[]>([])
const migrationSummary = ref<MigrationRunSummary | null>(null)
const locationBackfillStats = ref<LocationBackfillStatsResponse | null>(null)
const locationBackfillStatsLoading = ref(false)
const locationBackfillPreparing = ref(false)
const locationBackfillRunning = ref(false)
const locationBackfillProgressMessage = ref('')
const locationBackfillFeedbackMessage = ref('')
const locationBackfillErrorMessage = ref('')
const locationBackfillFailurePreview = ref<LocationBackfillFailurePreview[]>([])
const locationBackfillSummary = ref<LocationBackfillRunSummary | null>(null)

const getAuthHeadersOrThrow = () => {
  const headers = auth.authHeaders.value
  if (!headers.Authorization) {
    throw new Error('缺少登录令牌，请重新登录管理员账号。')
  }

  return headers
}

const sumMigrationRows = (rows: {
  postCovers: number
  postPhotos: number
  revisionCovers: number
  revisionPhotos: number
}) => {
  return rows.postCovers + rows.postPhotos + rows.revisionCovers + rows.revisionPhotos
}

const sumLocationBackfillRows = (rows: {
  posts: number
  revisions: number
}) => {
  return rows.posts + rows.revisions
}

const shouldRetryMigrationRequest = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const statusCode = Number((error as { statusCode?: unknown }).statusCode)
  if (Number.isFinite(statusCode) && statusCode > 0) {
    return statusCode >= 500
  }

  return true
}

const wait = (ms: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

const requestMigrationConvert = async (
  body: {
    dryRun: boolean
    batchSize: number
    cursor?: MigrationCursor
  },
  maxAttempts = 3
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await $fetch<MigrationConvertResponse>('/api/admin/image-migration/convert', {
        method: 'POST',
        headers: getAuthHeadersOrThrow(),
        body
      })
    } catch (error) {
      const shouldRetry = shouldRetryMigrationRequest(error)
      if (!shouldRetry || attempt >= maxAttempts - 1) {
        throw error
      }

      await wait(500 * (2 ** attempt))
    }
  }

  throw new Error('图片迁移请求失败。')
}

const requestLocationBackfillRun = async (
  body: {
    dryRun: boolean
    batchSize: number
    cursor?: MigrationCursor
  },
  maxAttempts = 3
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await $fetch<LocationBackfillRunResponse>('/api/admin/location-backfill/run', {
        method: 'POST',
        headers: getAuthHeadersOrThrow(),
        body
      })
    } catch (error) {
      const shouldRetry = shouldRetryMigrationRequest(error)
      if (!shouldRetry || attempt >= maxAttempts - 1) {
        throw error
      }

      await wait(500 * (2 ** attempt))
    }
  }

  throw new Error('Location backfill request failed.')
}

const collectFailurePreview = (result: MigrationConvertResponse) => {
  if (migrationFailurePreview.value.length >= MIGRATION_FAILURE_PREVIEW_LIMIT) {
    return
  }

  for (const failure of result.conversions.failures) {
    if (migrationFailurePreview.value.length >= MIGRATION_FAILURE_PREVIEW_LIMIT) {
      break
    }

    migrationFailurePreview.value.push({
      scope: 'storage',
      key: failure.sourcePath,
      message: failure.message
    })
  }

  for (const failure of result.updates.failures) {
    if (migrationFailurePreview.value.length >= MIGRATION_FAILURE_PREVIEW_LIMIT) {
      break
    }

    migrationFailurePreview.value.push({
      scope: failure.scope,
      key: failure.key,
      message: failure.message
    })
  }
}

const collectLocationBackfillFailurePreview = (result: LocationBackfillRunResponse) => {
  if (locationBackfillFailurePreview.value.length >= MIGRATION_FAILURE_PREVIEW_LIMIT) {
    return
  }

  for (const failure of result.failures.items) {
    if (locationBackfillFailurePreview.value.length >= MIGRATION_FAILURE_PREVIEW_LIMIT) {
      break
    }

    locationBackfillFailurePreview.value.push({
      stage: failure.stage,
      scope: failure.scope,
      key: failure.key,
      message: failure.message
    })
  }
}

const loadMigrationStats = async (options: { preserveErrorMessage?: boolean } = {}) => {
  if (!auth.authHeaders.value.Authorization) {
    return
  }

  migrationStatsLoading.value = true

  try {
    migrationStats.value = await $fetch<MigrationStatsResponse>('/api/admin/image-migration/stats', {
      headers: getAuthHeadersOrThrow()
    })
    if (!options.preserveErrorMessage) {
      migrationErrorMessage.value = ''
    }
  } catch (error) {
    migrationErrorMessage.value = normalizeApiErrorMessage(error, '迁移统计加载失败。')
  } finally {
    migrationStatsLoading.value = false
  }
}

const loadLocationBackfillStats = async (options: { preserveErrorMessage?: boolean } = {}) => {
  if (!auth.authHeaders.value.Authorization) {
    return
  }

  locationBackfillStatsLoading.value = true

  try {
    locationBackfillStats.value = await $fetch<LocationBackfillStatsResponse>('/api/admin/location-backfill/stats', {
      headers: getAuthHeadersOrThrow()
    })
    if (!options.preserveErrorMessage) {
      locationBackfillErrorMessage.value = ''
    }
  } catch (error) {
    locationBackfillErrorMessage.value = normalizeApiErrorMessage(error, '地区字段回填统计加载失败。')
  } finally {
    locationBackfillStatsLoading.value = false
  }
}

const runImageMigration = async () => {
  if (migrationRunning.value || migrationPreparing.value) {
    return
  }

  if (import.meta.server) {
    return
  }

  migrationFeedbackMessage.value = ''
  migrationErrorMessage.value = ''
  migrationProgressMessage.value = ''
  migrationFailurePreview.value = []

  if (!migrationStats.value) {
    await loadMigrationStats()
  }

  const pendingPaths = migrationStats.value?.totals.pendingPaths ?? 0
  if (pendingPaths <= 0) {
    migrationFeedbackMessage.value = '当前没有待迁移的历史图片。'
    return
  }

  migrationPreparing.value = true
  let dryRunResult: MigrationConvertResponse

  try {
    dryRunResult = await requestMigrationConvert({
      dryRun: true,
      batchSize: MIGRATION_BATCH_SIZE
    })
  } catch (error) {
    migrationPreparing.value = false
    migrationErrorMessage.value = normalizeApiErrorMessage(error, '迁移预检查失败。')
    return
  }

  const wouldUpdateRows = sumMigrationRows(dryRunResult.wouldUpdate)
  const dryRunFailureCount = dryRunResult.conversions.failedPaths + dryRunResult.updates.failedRows
  const shouldContinue = window.confirm(
    `预检查完成：预计更新 ${wouldUpdateRows} 条记录，失败 ${dryRunFailureCount} 条。确认开始正式迁移吗？`
  )

  migrationPreparing.value = false

  if (!shouldContinue) {
    migrationFeedbackMessage.value = '已取消迁移执行。'
    return
  }

  const summary: MigrationRunSummary = {
    batchCount: 0,
    convertedPaths: 0,
    skippedPaths: 0,
    updatedRows: 0,
    failedPaths: 0,
    failedRows: 0
  }

  migrationRunning.value = true

  try {
    let nextCursor: MigrationCursor | undefined

    while (true) {
      summary.batchCount += 1
      migrationProgressMessage.value = `正在迁移第 ${summary.batchCount} 批...`

      const result = await requestMigrationConvert({
        dryRun: false,
        batchSize: MIGRATION_BATCH_SIZE,
        cursor: nextCursor
      })

      summary.convertedPaths += result.conversions.convertedPaths
      summary.skippedPaths += result.conversions.skippedPaths
      summary.failedPaths += result.conversions.failedPaths
      summary.updatedRows += sumMigrationRows(result.updated)
      summary.failedRows += result.updates.failedRows

      collectFailurePreview(result)
      nextCursor = result.cursor

      if (!result.hasMore) {
        break
      }
    }

    migrationSummary.value = summary
    migrationFeedbackMessage.value = `迁移完成：共 ${summary.batchCount} 批，更新 ${summary.updatedRows} 条记录，转换 ${summary.convertedPaths} 条图片路径。`
    if (summary.failedPaths > 0 || summary.failedRows > 0) {
      migrationErrorMessage.value = `迁移已完成，但有失败项：转换失败 ${summary.failedPaths} 条，更新失败 ${summary.failedRows} 条。`
    }
  } catch (error) {
    migrationSummary.value = summary
    migrationErrorMessage.value = `${normalizeApiErrorMessage(error, '迁移执行失败。')}（已执行 ${summary.batchCount} 批）`
  } finally {
    migrationRunning.value = false
    migrationProgressMessage.value = ''
    await loadMigrationStats({ preserveErrorMessage: Boolean(migrationErrorMessage.value) })
  }
}

const runLocationBackfill = async () => {
  if (locationBackfillRunning.value || locationBackfillPreparing.value) {
    return
  }

  if (import.meta.server) {
    return
  }

  locationBackfillFeedbackMessage.value = ''
  locationBackfillErrorMessage.value = ''
  locationBackfillProgressMessage.value = ''
  locationBackfillFailurePreview.value = []
  locationBackfillSummary.value = null

  if (!locationBackfillStats.value) {
    await loadLocationBackfillStats()
  }

  const eligibleRows = locationBackfillStats.value?.totals.eligibleRows ?? 0
  if (eligibleRows <= 0) {
    locationBackfillFeedbackMessage.value = '当前没有可检查的历史地区记录。'
    return
  }

  locationBackfillPreparing.value = true
  let dryRunResult: LocationBackfillRunResponse

  try {
    dryRunResult = await requestLocationBackfillRun({
      dryRun: true,
      batchSize: LOCATION_BACKFILL_BATCH_SIZE
    })
  } catch (error) {
    locationBackfillPreparing.value = false
    locationBackfillErrorMessage.value = normalizeApiErrorMessage(error, '地区字段回填预检查失败。')
    return
  }

  collectLocationBackfillFailurePreview(dryRunResult)

  const processedRows = sumLocationBackfillRows(dryRunResult.processed)
  const wouldUpdateRows = sumLocationBackfillRows(dryRunResult.wouldUpdate)
  const dryRunFailureCount = dryRunResult.failures.geocode + dryRunResult.failures.updates

  if (wouldUpdateRows <= 0) {
    locationBackfillPreparing.value = false

    if (dryRunFailureCount > 0) {
      locationBackfillErrorMessage.value = `预检查完成，但有 ${dryRunFailureCount} 条记录处理失败。`
      return
    }

    locationBackfillFeedbackMessage.value = '预检查完成，当前没有需要更新的地区字段。'
    return
  }

  const shouldContinue = window.confirm(
    `预检查完成：扫描 ${processedRows} 条记录，预计更新 ${wouldUpdateRows} 条，失败 ${dryRunFailureCount} 条。确认开始正式回填吗？`
  )

  locationBackfillPreparing.value = false

  if (!shouldContinue) {
    locationBackfillFeedbackMessage.value = '已取消地区字段回填。'
    return
  }

  const summary: LocationBackfillRunSummary = {
    batchCount: 0,
    processedRows: 0,
    wouldUpdateRows: 0,
    updatedRows: 0,
    failedGeocode: 0,
    failedUpdates: 0
  }

  locationBackfillRunning.value = true

  try {
    let nextCursor: MigrationCursor | undefined

    while (true) {
      summary.batchCount += 1
      locationBackfillProgressMessage.value = `正在回填第 ${summary.batchCount} 批...`

      const result = await requestLocationBackfillRun({
        dryRun: false,
        batchSize: LOCATION_BACKFILL_BATCH_SIZE,
        cursor: nextCursor
      })

      summary.processedRows += sumLocationBackfillRows(result.processed)
      summary.wouldUpdateRows += sumLocationBackfillRows(result.wouldUpdate)
      summary.updatedRows += sumLocationBackfillRows(result.updated)
      summary.failedGeocode += result.failures.geocode
      summary.failedUpdates += result.failures.updates

      collectLocationBackfillFailurePreview(result)
      nextCursor = result.cursor

      if (!result.hasMore) {
        break
      }
    }

    locationBackfillSummary.value = summary
    invalidateRegionPages()
    locationBackfillFeedbackMessage.value = `地区字段回填完成：共 ${summary.batchCount} 批，更新 ${summary.updatedRows} 条记录。`
    if (summary.failedGeocode > 0 || summary.failedUpdates > 0) {
      locationBackfillErrorMessage.value = `回填已完成，但有失败项：解析失败 ${summary.failedGeocode} 条，更新失败 ${summary.failedUpdates} 条。`
    }
  } catch (error) {
    locationBackfillSummary.value = summary
    locationBackfillErrorMessage.value = `${normalizeApiErrorMessage(error, '地区字段回填执行失败。')}（已执行 ${summary.batchCount} 批）`
  } finally {
    locationBackfillRunning.value = false
    locationBackfillProgressMessage.value = ''
    await loadLocationBackfillStats({ preserveErrorMessage: Boolean(locationBackfillErrorMessage.value) })
  }
}

const selectedPost = computed(() => {
  return posts.value.find((post) => post.reviewKey === selectedKey.value) || null
})

const selectedReviewPhotos = computed(() => {
  if (!selectedPost.value) {
    return []
  }

  if (selectedPost.value.photos.length) {
    return selectedPost.value.photos
  }

  return selectedPost.value.imageUrl
    ? [{
        imageUrl: selectedPost.value.imageUrl,
        thumbUrl: selectedPost.value.thumbUrl
      }]
    : []
})

const selectedReviewPhoto = computed(() => {
  return selectedReviewPhotos.value[selectedPhotoIndex.value] || selectedReviewPhotos.value[0] || null
})

const selectedReviewTypeLabel = computed(() => {
  return selectedPost.value?.reviewKind === 'revision' ? '修改审核' : '新投稿'
})

watch(selectedPost, (post) => {
  reviewNote.value = post?.reviewNote || ''
  selectedPhotoIndex.value = 0
}, { immediate: true })

const selectPhoto = (index: number) => {
  selectedPhotoIndex.value = index
}

const loadPosts = async () => {
  if (!auth.authHeaders.value.Authorization) {
    return
  }

  loading.value = true

  try {
    posts.value = await $fetch<AdminReviewPost[]>('/api/admin/posts', {
      headers: auth.authHeaders.value,
      query: { status: 'pending' }
    })
    selectedKey.value = posts.value[0]?.reviewKey ?? null
    feedbackMessage.value = ''
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = normalizeApiErrorMessage(error, '待审核列表加载失败。')
  } finally {
    loading.value = false
  }
}

watch(
  () => [auth.ready.value, auth.isAdmin.value],
  ([ready, isAdmin]) => {
    if (ready && isAdmin) {
      void loadPosts()
      void loadMigrationStats()
      void loadLocationBackfillStats()
    }
  },
  { immediate: true }
)

const submitReview = async (action: 'approve' | 'reject') => {
  if (!selectedPost.value) {
    return
  }

  submitting.value = true
  const affectedPostId = selectedPost.value.id
  const affectedUsername = selectedPost.value.author.username
  const handledKey = selectedPost.value.reviewKey

  try {
    const endpoint = selectedPost.value.reviewKind === 'revision'
      ? `/api/admin/revisions/${selectedPost.value.revisionId}/${action}`
      : `/api/admin/posts/${selectedPost.value.id}/${action}`

    await $fetch(endpoint, {
      method: 'POST',
      headers: auth.authHeaders.value,
      body: {
        reviewNote: reviewNote.value
      }
    })

    invalidatePostDetail(affectedPostId)
    invalidateUserPage(affectedUsername)
    invalidateRegionPages()
    posts.value = posts.value.filter((post) => post.reviewKey !== handledKey)
    selectedKey.value = posts.value[0]?.reviewKey ?? null
    feedbackMessage.value = action === 'approve'
      ? '已通过，公开内容会按当前审核项更新。'
      : '已驳回，公开内容不会被修改。'
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = normalizeApiErrorMessage(error, '审核操作失败。')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <section class="panel panel--page">
      <span class="eyebrow">Admin Review</span>
      <h1 class="page-title">审核待发布内容</h1>
      <p class="lede">左侧选择项目，右侧查看原图、位置、作者和备注。</p>
    </section>

    <section class="panel panel--page admin-migration-tool">
      <div class="admin-migration-tool__head">
        <div class="admin-migration-tool__copy">
          <span class="eyebrow">Maintenance</span>
          <h2 class="admin-migration-tool__title">历史图片 WebP 迁移（临时）</h2>
          <p class="support-copy">先预检查再执行，执行后会自动分批迁移到完成。</p>
        </div>

        <div class="inline-actions">
          <button
            class="workbench-icon-button"
            type="button"
            :disabled="migrationStatsLoading || migrationPreparing || migrationRunning"
            title="刷新迁移统计"
            aria-label="刷新迁移统计"
            @click="loadMigrationStats"
          >
            <i
              class="button-icon fa-solid"
              :class="migrationStatsLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'"
              aria-hidden="true"
            />
            <span class="sr-only">刷新迁移统计</span>
          </button>

          <button
            class="workbench-icon-button workbench-icon-button--primary"
            type="button"
            :disabled="migrationPreparing || migrationRunning || migrationStatsLoading"
            title="开始迁移历史图片"
            aria-label="开始迁移历史图片"
            @click="runImageMigration"
          >
            <i
              class="button-icon fa-solid"
              :class="migrationPreparing || migrationRunning ? 'fa-spinner fa-spin' : 'fa-file-image'"
              aria-hidden="true"
            />
            <span class="sr-only">开始迁移历史图片</span>
          </button>
        </div>
      </div>

      <div class="admin-migration-tool__stats" aria-live="polite">
        <p>
          <span>待迁移路径</span>
          <strong>{{ migrationStatsLoading ? '...' : (migrationStats?.totals.pendingPaths ?? '-') }}</strong>
        </p>
        <p>
          <span>待迁移记录</span>
          <strong>{{ migrationStatsLoading ? '...' : (migrationStats?.totals.pendingRows ?? '-') }}</strong>
        </p>
        <p>
          <span>上次执行</span>
          <strong>{{ migrationSummary ? `${migrationSummary.batchCount} 批` : '未执行' }}</strong>
        </p>
      </div>

      <p v-if="migrationProgressMessage" class="status-inline">{{ migrationProgressMessage }}</p>
      <p v-if="migrationSummary" class="admin-migration-tool__summary">
        最近执行：转换 {{ migrationSummary.convertedPaths }}，跳过 {{ migrationSummary.skippedPaths }}，
        更新 {{ migrationSummary.updatedRows }}，失败 {{ migrationSummary.failedPaths + migrationSummary.failedRows }}。
      </p>

      <details v-if="migrationFailurePreview.length" class="admin-migration-tool__failures">
        <summary>查看失败明细（展示前 {{ migrationFailurePreview.length }} 条）</summary>
        <ul>
          <li v-for="(failure, index) in migrationFailurePreview" :key="`${failure.scope}-${failure.key}-${index}`">
            <strong>{{ failure.scope }}</strong>
            <span>{{ failure.key }}</span>
            <p>{{ failure.message }}</p>
          </li>
        </ul>
      </details>

      <p v-if="migrationFeedbackMessage" class="success-banner">{{ migrationFeedbackMessage }}</p>
      <p v-if="migrationErrorMessage" class="error-banner">{{ migrationErrorMessage }}</p>
    </section>

    <section class="panel panel--page admin-migration-tool">
      <div class="admin-migration-tool__head">
        <div class="admin-migration-tool__copy">
          <span class="eyebrow">Maintenance</span>
          <h2 class="admin-migration-tool__title">地区字段回填（临时）</h2>
          <p class="support-copy">先全量预检查，再按批次回填 posts 与 post_revisions 的 country / region / city。</p>
        </div>

        <div class="inline-actions">
          <button
            class="workbench-icon-button"
            type="button"
            :disabled="locationBackfillStatsLoading || locationBackfillPreparing || locationBackfillRunning"
            title="刷新地区字段回填统计"
            aria-label="刷新地区字段回填统计"
            @click="loadLocationBackfillStats"
          >
            <i
              class="button-icon fa-solid"
              :class="locationBackfillStatsLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'"
              aria-hidden="true"
            />
            <span class="sr-only">刷新地区字段回填统计</span>
          </button>

          <button
            class="workbench-icon-button workbench-icon-button--primary"
            type="button"
            :disabled="locationBackfillPreparing || locationBackfillRunning || locationBackfillStatsLoading"
            title="开始地区字段回填"
            aria-label="开始地区字段回填"
            @click="runLocationBackfill"
          >
            <i
              class="button-icon fa-solid"
              :class="locationBackfillPreparing || locationBackfillRunning ? 'fa-spinner fa-spin' : 'fa-location-dot'"
              aria-hidden="true"
            />
            <span class="sr-only">开始地区字段回填</span>
          </button>
        </div>
      </div>

      <div class="admin-migration-tool__stats" aria-live="polite">
        <p>
          <span>可检查 posts</span>
          <strong>{{ locationBackfillStatsLoading ? '...' : (locationBackfillStats?.totals.posts ?? '-') }}</strong>
        </p>
        <p>
          <span>可检查 revisions</span>
          <strong>{{ locationBackfillStatsLoading ? '...' : (locationBackfillStats?.totals.revisions ?? '-') }}</strong>
        </p>
        <p>
          <span>上次执行</span>
          <strong>{{ locationBackfillSummary ? `${locationBackfillSummary.batchCount} 批` : '未执行' }}</strong>
        </p>
      </div>

      <p v-if="locationBackfillProgressMessage" class="status-inline">{{ locationBackfillProgressMessage }}</p>
      <p v-if="locationBackfillSummary" class="admin-migration-tool__summary">
        最近执行：扫描 {{ locationBackfillSummary.processedRows }}，预计更新 {{ locationBackfillSummary.wouldUpdateRows }}，
        实际更新 {{ locationBackfillSummary.updatedRows }}，失败 {{ locationBackfillSummary.failedGeocode + locationBackfillSummary.failedUpdates }}。
      </p>

      <details v-if="locationBackfillFailurePreview.length" class="admin-migration-tool__failures">
        <summary>查看失败明细（展示前 {{ locationBackfillFailurePreview.length }} 条）</summary>
        <ul>
          <li v-for="(failure, index) in locationBackfillFailurePreview" :key="`${failure.stage}-${failure.scope}-${failure.key}-${index}`">
            <strong>{{ failure.stage }} / {{ failure.scope }}</strong>
            <span>{{ failure.key }}</span>
            <p>{{ failure.message }}</p>
          </li>
        </ul>
      </details>

      <p v-if="locationBackfillFeedbackMessage" class="success-banner">{{ locationBackfillFeedbackMessage }}</p>
      <p v-if="locationBackfillErrorMessage" class="error-banner">{{ locationBackfillErrorMessage }}</p>
    </section>

    <section class="review-layout">
      <aside class="panel panel--page review-list">
        <template v-if="loading">
          <span class="status-inline">正在加载待审核内容</span>
        </template>

        <template v-else-if="posts.length">
          <button
            v-for="post in posts"
            :key="post.reviewKey"
            :class="{ 'is-active': selectedKey === post.reviewKey }"
            type="button"
            @click="selectedKey = post.reviewKey"
          >
            <strong>{{ post.title }}</strong>
            <p>@{{ post.author.username }}</p>
            <p>{{ post.reviewKind === 'revision' ? '修改审核' : '新投稿' }}</p>
            <p>{{ post.placeName || '未填写地点' }}</p>
            <p>{{ formatDateTime(post.createdAt) }}</p>
          </button>
        </template>

        <div v-else class="empty-state">
          <h2>现在没有待审核内容</h2>
          <p>新投稿或作品修改进入队列后会出现在这里。</p>
        </div>
      </aside>

      <section class="panel panel--page review-detail">
        <template v-if="selectedPost">
          <div v-if="selectedReviewPhoto?.imageUrl" class="review-detail__hero">
            <img :src="selectedReviewPhoto.imageUrl" :alt="selectedPost.title">
          </div>

          <div v-if="selectedReviewPhotos.length > 1" class="photo-strip photo-strip--review" aria-label="Review photos">
            <button
              v-for="(photo, index) in selectedReviewPhotos"
              :key="`${selectedPost.reviewKey}-${index}`"
              class="photo-strip__button"
              :class="{ 'is-active': selectedPhotoIndex === index }"
              type="button"
              :aria-label="`查看第 ${index + 1} 张照片`"
              @click="selectPhoto(index)"
            >
              <img v-if="photo.thumbUrl || photo.imageUrl" :src="photo.thumbUrl || photo.imageUrl || ''" :alt="selectedPost.title">
              <i v-else class="fa-solid fa-image" aria-hidden="true" />
            </button>
          </div>

          <span class="eyebrow">{{ selectedReviewTypeLabel }} #{{ selectedPost.id }}</span>
          <h2>{{ selectedPost.title }}</h2>
          <div class="detail-meta">
            <span class="status-inline">@{{ selectedPost.author.username }}</span>
            <span class="status-inline">{{ selectedPost.placeName || '未命名地点' }}</span>
            <span class="status-inline">{{ privacyModeLabel(selectedPost.privacyMode) }}</span>
          </div>

          <p class="support-copy">{{ selectedPost.body || '作者没有留下额外留言。' }}</p>

          <div class="field-grid field-grid--two">
            <div class="review-info-block">
              <strong>坐标</strong>
              <p class="support-copy">精确位置：{{ formatLatLng(selectedPost.exactLocation) }}</p>
              <p class="support-copy">公开位置：{{ formatLatLng(selectedPost.publicLocation) }}</p>
              <p class="support-copy">拍摄时间：{{ formatDateTime(selectedPost.capturedAt) }}</p>
            </div>

            <div class="review-info-block">
              <strong>位置预览</strong>
              <LocationPreviewMap
                :exact-location="selectedPost.exactLocation"
                :public-location="selectedPost.publicLocation"
                :show-exact="true"
                :compact="true"
              />
            </div>
          </div>

          <label class="field-label">
            <span>审核备注</span>
            <textarea
              v-model="reviewNote"
              class="field-textarea"
              placeholder="写给作者或管理员内部查看的备注"
            />
          </label>

          <div class="inline-actions">
            <button
              class="workbench-icon-button workbench-icon-button--primary"
              type="button"
              :disabled="submitting"
              title="通过"
              aria-label="通过"
              @click="submitReview('approve')"
            >
              <i class="button-icon fa-solid" :class="submitting ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true" />
              <span class="sr-only">通过</span>
            </button>
            <button
              class="workbench-icon-button workbench-icon-button--danger"
              type="button"
              :disabled="submitting"
              title="驳回"
              aria-label="驳回"
              @click="submitReview('reject')"
            >
              <i class="button-icon fa-solid fa-xmark" aria-hidden="true" />
              <span class="sr-only">驳回</span>
            </button>
          </div>
        </template>

        <div v-else class="empty-state">
          <h2>从左侧选择一条内容</h2>
          <p>通过后进入公开地图；驳回则保留在后台记录。</p>
        </div>

        <p v-if="feedbackMessage" class="success-banner">{{ feedbackMessage }}</p>
        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
      </section>
    </section>
  </main>
</template>
