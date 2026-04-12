<script setup lang="ts">
const props = defineProps<{
  ready: boolean
  signedIn: boolean
  label: string
  username?: string | null
}>()

const emit = defineEmits<{
  login: []
  menuOpen: []
  signOut: []
}>()

const { t } = useI18n()
const rootEl = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const menuLabel = computed(() => props.signedIn ? props.label : t('common.login'))

const closeMenu = () => {
  isOpen.value = false
}

const toggleMenu = () => {
  if (!props.ready) {
    return
  }

  const nextOpen = !isOpen.value

  if (nextOpen) {
    emit('menuOpen')
  }

  isOpen.value = nextOpen
}

const handleLogin = () => {
  closeMenu()
  emit('login')
}

const handleSignOut = () => {
  closeMenu()
  emit('signOut')
}

const handlePointerDown = (event: MouseEvent) => {
  if (!rootEl.value?.contains(event.target as Node)) {
    closeMenu()
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="rootEl" class="user-menu">
    <button
      class="workbench-icon-button"
      type="button"
      :title="menuLabel"
      :aria-label="menuLabel"
      :aria-expanded="isOpen"
      :disabled="!ready"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <i class="button-icon fa-solid fa-user" aria-hidden="true" />
      <span class="sr-only">{{ menuLabel }}</span>
    </button>

    <Transition name="locale-menu">
      <div
        v-if="isOpen"
        class="locale-switcher__menu user-menu__menu"
        role="menu"
        :aria-label="menuLabel"
      >
        <p
          v-if="signedIn"
          class="user-menu__identity"
        >
          {{ label }}
        </p>

        <NuxtLink
          v-if="signedIn && username"
          class="locale-switcher__option user-menu__option user-menu__link"
          role="menuitem"
          :to="createWorkbenchLocation('user', { username })"
          @click="closeMenu"
        >
          <span>{{ t('user.eyebrow') }}</span>
          <i class="fa-solid fa-address-card" aria-hidden="true" />
        </NuxtLink>

        <button
          v-if="signedIn"
          class="locale-switcher__option user-menu__option"
          type="button"
          role="menuitem"
          @click="handleSignOut"
        >
          <span>{{ t('common.signOut') }}</span>
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true" />
        </button>

        <button
          v-else
          class="locale-switcher__option user-menu__option"
          type="button"
          role="menuitem"
          @click="handleLogin"
        >
          <span>{{ t('common.login') }}</span>
          <i class="fa-solid fa-right-to-bracket" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>
