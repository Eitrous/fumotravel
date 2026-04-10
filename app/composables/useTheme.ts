import { useCookie, useHead } from '#app'
import { computed } from 'vue'

export type Theme = 'light' | 'dark'

export const useTheme = () => {
  const cookie = useCookie<Theme>('fumo_theme', {
    default: () => 'light',
    watch: true
  })

  const isDark = computed(() => cookie.value === 'dark')

  const toggleTheme = () => {
    cookie.value = isDark.value ? 'light' : 'dark'
  }

  // Bind the theme to the HTML tag's data-theme attribute for CSS targeting
  useHead(() => ({
    htmlAttrs: {
      'data-theme': cookie.value
    }
  }))

  return {
    theme: cookie,
    isDark,
    toggleTheme
  }
}
