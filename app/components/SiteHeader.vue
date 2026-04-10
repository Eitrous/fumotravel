<script setup lang="ts">
const route = useRoute()
const auth = useAuthState()

const loginTarget = computed(() => {
  return route.fullPath && route.fullPath !== '/'
    ? route.fullPath
    : '/?panel=submit'
})

const handleSignOut = async () => {
  await auth.signOut()
  await navigateTo('/')
}
</script>

<template>
  <header class="site-header site-header--solid">
    <NuxtLink class="brand-lockup" to="/">
      <span class="brand-mark">F</span>
      <span class="brand-text">
        <span class="brand-name">Fumo Travel Map</span>
        <span class="brand-tagline">给东方众分享遍布世界各地的 fumo 旅照</span>
      </span>
    </NuxtLink>

    <nav class="site-nav" aria-label="管理员导航">
      <NuxtLink class="site-nav__link" to="/">公开地图</NuxtLink>
      <NuxtLink class="site-nav__link" to="/admin/review">审核台</NuxtLink>
    </nav>

    <div class="site-actions">
      <template v-if="auth.ready.value && auth.viewer.value">
        <span class="author-pill">@{{ auth.viewer.value.profile.username || '未设置作者 ID' }}</span>
        <NuxtLink v-if="!auth.hasUsername.value" class="ghost-button" :to="{ path: '/', query: { panel: 'onboarding' } }">
          设置作者 ID
        </NuxtLink>
        <button class="ghost-button" type="button" @click="handleSignOut">
          退出登录
        </button>
      </template>

      <NuxtLink
        v-else-if="auth.ready.value"
        class="ghost-button"
        :to="{ path: '/', query: { panel: 'login', next: loginTarget } }"
      >
        登录
      </NuxtLink>

      <span v-else class="status-inline">正在同步登录状态…</span>
    </div>
  </header>
</template>
