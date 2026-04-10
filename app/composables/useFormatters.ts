import type { LatLng, PrivacyMode } from '~~/shared/fumo'

type FormatterLocale = 'zh-CN' | 'en-US' | 'ja-JP'

const LABELS: Record<FormatterLocale, {
  notProvided: string
  notAnnotated: string
  privacyExact: string
  privacyApprox: string
}> = {
  'zh-CN': {
    notProvided: '未提供',
    notAnnotated: '未标注',
    privacyExact: '公开精确坐标',
    privacyApprox: '公开近似位置'
  },
  'en-US': {
    notProvided: 'Not provided',
    notAnnotated: 'Not set',
    privacyExact: 'Exact public location',
    privacyApprox: 'Approximate public location'
  },
  'ja-JP': {
    notProvided: '未設定',
    notAnnotated: '未指定',
    privacyExact: '正確な公開位置',
    privacyApprox: '概略の公開位置'
  }
}

const localeToIntl = (locale: string): FormatterLocale => {
  if (locale === 'ja') {
    return 'ja-JP'
  }

  if (locale === 'en') {
    return 'en-US'
  }

  return 'zh-CN'
}

export const useFormatters = (options?: {
  locale?: FormatterLocale
}) => {
  const { locale } = useI18n()

  const resolvedLocale = computed<FormatterLocale>(() => {
    return options?.locale || localeToIntl(locale.value)
  })

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return LABELS[resolvedLocale.value].notProvided
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return LABELS[resolvedLocale.value].notProvided
    }

    return new Intl.DateTimeFormat(resolvedLocale.value, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  }

  const formatLatLng = (value?: LatLng | null) => {
    if (!value) {
      return LABELS[resolvedLocale.value].notAnnotated
    }

    return `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
  }

  const privacyModeLabel = (mode: PrivacyMode) => {
    return mode === 'exact'
      ? LABELS[resolvedLocale.value].privacyExact
      : LABELS[resolvedLocale.value].privacyApprox
  }

  return {
    formatDateTime,
    formatLatLng,
    privacyModeLabel
  }
}
