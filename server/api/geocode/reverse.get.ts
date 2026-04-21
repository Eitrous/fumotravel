import { getQuery } from 'h3'
import {
  fetchReverseGeocodeResult,
  getPreferredGeocodeAcceptLanguage
} from '~~/server/utils/geocode'
import {
  enforceRateLimit,
  getRateLimitIdentifier,
  isPublicNominatimBaseUrl
} from '~~/server/utils/rateLimit'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const query = getQuery(event)
  const lat = Number(query.lat)
  const lng = Number(query.lng)

  if ([lat, lng].some(Number.isNaN)) {
    throw createError({
      statusCode: 400,
      statusMessage: '坐标不合法'
    })
  }

  await enforceRateLimit(event, 'geocodeIp', getRateLimitIdentifier(event))
  if (isPublicNominatimBaseUrl(config.geocodeBaseUrl)) {
    await enforceRateLimit(event, 'geocodeGlobal', 'nominatim')
  }

  try {
    return await fetchReverseGeocodeResult(event, {
      lat,
      lng
    }, getPreferredGeocodeAcceptLanguage(event))
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: '逆地理编码服务暂时不可用'
    })
  }
})
