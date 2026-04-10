<script setup lang="ts">
import type { WorkbenchPanel } from '~~/shared/fumo'

const { t } = useI18n()
const { isDark, toggleTheme } = useTheme()

useSeoMeta({
  title: () => t('seo.title'),
  description: () => t('seo.description')
})

const route = useRoute()
const router = useRouter()
const auth = useAuthState()

const isMobile = ref(false)
const mobileSheetOpen = ref(false)

let viewportQuery: MediaQueryList | null = null

const workbenchState = computed(() => resolveWorkbenchState(route.query))
const currentPanel = computed(() => workbenchState.value.panel)
const selectedPostId = computed(() => workbenchState.value.postId)
const nextPath = computed(() => workbenchState.value.nextPath)
const submitPath = computed(() => router.resolve(createWorkbenchLocation('submit')).fullPath)
const panelKey = computed(() => {
  return currentPanel.value === 'post'
    ? `post-${selectedPostId.value}`
    : currentPanel.value
})

const syncViewportMode = () => {
  isMobile.value = viewportQuery?.matches ?? false

  if (!isMobile.value) {
    mobileSheetOpen.value = true
  }
}

const openPanel = async (
  panel: WorkbenchPanel,
  options: {
    postId?: number | null
    next?: string | null
    revealMobile?: boolean
  } = {}
) => {
  await navigateTo(createWorkbenchLocation(panel, {
    postId: options.postId,
    next: options.next
  }))

  if (import.meta.client && isMobile.value && options.revealMobile !== false) {
    mobileSheetOpen.value = true
  }
}

const openInfoPanel = async () => {
  await openPanel('info')
}

const openLoginPanel = async (target = submitPath.value) => {
  await openPanel('login', {
    next: target
  })
}

const openSubmitPanel = async () => {
  await auth.init()

  if (!auth.user.value) {
    await openLoginPanel(submitPath.value)
    return
  }

  if (!auth.hasUsername.value) {
    await openPanel('onboarding', {
      next: submitPath.value
    })
    return
  }

  await openPanel('submit')
}

const handleMarkerSelection = async (postId: number) => {
  await openPanel('post', {
    postId
  })
}

const closeMobileSheet = async () => {
  mobileSheetOpen.value = false
  await navigateTo(createWorkbenchLocation('info'))
}

const handleSignOut = async () => {
  await auth.signOut()
  await navigateTo('/')
  mobileSheetOpen.value = false
}

watch(
  () => currentPanel.value,
  (panel) => {
    if (!import.meta.client || !isMobile.value) {
      return
    }

    if (panel !== 'info') {
      mobileSheetOpen.value = true
    }
  },
  { immediate: true }
)

onMounted(() => {
  viewportQuery = window.matchMedia('(max-width: 980px)')
  syncViewportMode()
  viewportQuery.addEventListener('change', syncViewportMode)

  if (isMobile.value && currentPanel.value !== 'info') {
    mobileSheetOpen.value = true
  }
})

onBeforeUnmount(() => {
  viewportQuery?.removeEventListener('change', syncViewportMode)
})
</script>

<template>
  <main class="workbench-page">
    <section class="workbench-map-shell">
      <WorldMap
        :selected-post-id="selectedPostId"
        @select-post="handleMarkerSelection"
      />
    </section>

    <button
      v-if="isMobile && mobileSheetOpen"
      class="workbench-sheet-backdrop"
      type="button"
      :aria-label="t('common.closePanel')"
      @click="closeMobileSheet"
    />

    <aside
      class="workbench-sidebar"
      :class="{ 'is-open': !isMobile || mobileSheetOpen }"
    >
      <div class="workbench-sidebar__surface">
        <div class="workbench-sidebar__chrome">
          <div class="workbench-navbar">
            <button
              class="ghost-button nav-button nav-button--icon-only"
              type="button"
              @click="toggleTheme"
              :aria-label="isDark ? t('common.toggleThemeToLight') : t('common.toggleThemeToDark')"
            >
              <i class="button-icon fa-solid" :class="isDark ? 'fa-sun' : 'fa-moon'" aria-hidden="true" />
              <span class="sr-only">{{ isDark ? t('common.toggleThemeToLight') : t('common.toggleThemeToDark') }}</span>
            </button>
            <LocaleSwitcher class="nav-button" />

            <template v-if="auth.ready.value && auth.viewer.value">
              <span class="author-pill nav-button">
                @{{ auth.viewer.value.profile.username || t('common.authorIdUnset') }}
              </span>

              <NuxtLink
                v-if="auth.isAdmin.value"
                class="ghost-button nav-button"
                to="/admin/review"
              >
                <i class="button-icon fa-solid fa-shield-halved" aria-hidden="true" />
                <span>{{ t('common.review') }}</span>
              </NuxtLink>

              <button class="button nav-button" type="button" @click="openSubmitPanel">
                <i class="button-icon fa-solid fa-paper-plane" aria-hidden="true" />
                <span>{{ t('common.submit') }}</span>
              </button>

              <button class="ghost-button nav-button" type="button" @click="handleSignOut">
                <i class="button-icon fa-solid fa-right-from-bracket" aria-hidden="true" />
                <span>{{ t('common.signOut') }}</span>
              </button>
            </template>

            <template v-else-if="auth.ready.value">
              <button class="ghost-button nav-button" type="button" @click="openLoginPanel()">
                <i class="button-icon fa-solid fa-right-to-bracket" aria-hidden="true" />
                <span>{{ t('common.login') }}</span>
              </button>
              <button class="button nav-button" type="button" @click="openSubmitPanel">
                <i class="button-icon fa-solid fa-paper-plane" aria-hidden="true" />
                <span>{{ t('common.submit') }}</span>
              </button>
            </template>

            <span v-else class="status-inline nav-button">{{ t('common.loadingAuth') }}</span>
          </div>

          <button
            v-if="isMobile"
            class="ghost-button ghost-button--compact"
            type="button"
            @click="closeMobileSheet"
          >
            <i class="button-icon fa-solid fa-xmark" aria-hidden="true" />
            <span>{{ t('common.close') }}</span>
          </button>

          <button
            v-else-if="currentPanel !== 'info'"
            class="text-button"
            type="button"
            @click="openInfoPanel"
          >
            <i class="button-icon fa-solid fa-arrow-left" aria-hidden="true" />
            <span>{{ t('common.backToMapOverview') }}</span>
          </button>
        </div>

        <Transition name="workbench-panel-fade" mode="out-in">
          <div :key="panelKey" class="workbench-sidebar__body">
            <WorkbenchInfoPanel
              v-if="currentPanel === 'info'"
              @login="openLoginPanel()"
              @submit="openSubmitPanel"
              @info="openInfoPanel"
            />

            <WorkbenchLoginPanel
              v-else-if="currentPanel === 'login'"
              :next-path="nextPath"
            />

            <WorkbenchOnboardingPanel
              v-else-if="currentPanel === 'onboarding'"
              :next-path="nextPath"
            />

            <WorkbenchSubmitPanel v-else-if="currentPanel === 'submit'" />

            <WorkbenchPostPanel
              v-else-if="currentPanel === 'post' && selectedPostId"
              :post-id="selectedPostId"
            />

            <WorkbenchInfoPanel
              v-else
              @login="openLoginPanel()"
              @submit="openSubmitPanel"
              @info="openInfoPanel"
            />
          </div>
        </Transition>
      </div>
    </aside>
  </main>
</template>
