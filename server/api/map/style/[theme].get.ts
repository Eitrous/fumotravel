import { getQuery, setHeader, type H3Event } from 'h3'
import { isMapStyleTheme, normalizeMapStyleLanguage } from '~~/shared/mapStyle'
import { buildHostedMapStyle } from '~~/server/utils/mapStyle'

const getRequestedThemeAndLanguage = (event: H3Event) => {
  const theme = String(event.context.params?.theme || '')

  if (!isMapStyleTheme(theme)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Map style not found'
    })
  }

  const query = getQuery(event)
  const rawLang = typeof query.lang === 'string' ? query.lang : null
  const version = typeof query.v === 'string' ? query.v : 'default'

  return {
    theme,
    lang: normalizeMapStyleLanguage(rawLang),
    version
  }
}

const cachedMapStyleHandler = defineCachedEventHandler((event) => {
  const { theme, lang } = getRequestedThemeAndLanguage(event)

  return buildHostedMapStyle(event, theme, lang)
}, {
  maxAge: 60 * 60 * 24,
  swr: false,
  getKey: (event) => {
    const { theme, lang, version } = getRequestedThemeAndLanguage(event)
    return `${theme}:${lang}:${version}`
  }
})

export default defineEventHandler(async (event) => {
  const response = await cachedMapStyleHandler(event)

  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return response
})
