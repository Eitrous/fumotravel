<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()

const localeOptions = computed(() => {
  return locales.value.map((entry) => {
    const code = typeof entry === 'string' ? entry : entry.code
    return {
      code,
      label: t(`common.languageNames.${code}`)
    }
  })
})

const updateLocale = async (event: Event) => {
  const value = (event.target as HTMLSelectElement).value

  if (!value || value === locale.value) {
    return
  }

  await setLocale(value)
}
</script>

<template>
  <label class="locale-switcher">
    <span class="sr-only">{{ t('common.language') }}</span>
    <select
      class="locale-switcher__select"
      :value="locale"
      :aria-label="t('common.language')"
      @change="updateLocale"
    >
      <option
        v-for="option in localeOptions"
        :key="option.code"
        :value="option.code"
      >
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
