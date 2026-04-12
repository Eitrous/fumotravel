<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()
const emit = defineEmits<{
  menuOpen: []
}>()

const rootEl = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const localeOptions = computed(() => {
  return locales.value.map((entry) => {
    const code = typeof entry === 'string' ? entry : entry.code
    return {
      code,
      label: t(`common.languageNames.${code}`)
    }
  })
})

const closeMenu = () => {
  isOpen.value = false
}

const toggleMenu = () => {
  const nextOpen = !isOpen.value

  if (nextOpen) {
    emit('menuOpen')
  }

  isOpen.value = nextOpen
}

const updateLocale = async (value: string) => {
  if (!value || value === locale.value) {
    closeMenu()
    return
  }

  await setLocale(value)
  closeMenu()
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
  <div ref="rootEl" class="locale-switcher">
    <button
      class="workbench-icon-button"
      type="button"
      :title="t('common.language')"
      :aria-label="t('common.language')"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <i class="button-icon fa-solid fa-globe" aria-hidden="true" />
      <span class="sr-only">{{ t('common.language') }}</span>
    </button>

    <Transition name="locale-menu">
      <div
        v-if="isOpen"
        class="locale-switcher__menu"
        role="menu"
        :aria-label="t('common.language')"
      >
        <button
          v-for="option in localeOptions"
          :key="option.code"
          class="locale-switcher__option"
          :class="{ 'is-active': option.code === locale }"
          type="button"
          role="menuitemradio"
          :aria-checked="option.code === locale"
          @click="updateLocale(option.code)"
        >
          <span>{{ option.label }}</span>
          <i
            v-if="option.code === locale"
            class="fa-solid fa-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </Transition>
  </div>
</template>
