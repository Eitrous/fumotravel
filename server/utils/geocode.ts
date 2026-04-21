import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import type { GeocodeResult, LatLng } from '~~/shared/fumo'

type NominatimAddress = {
  attraction?: string
  city?: string
  city_district?: string
  country?: string
  county?: string
  hamlet?: string
  neighbourhood?: string
  region?: string
  state?: string
  suburb?: string
  town?: string
  village?: string
}

type NominatimEntry = {
  display_name: string
  lat: string
  lon: string
  name?: string
  address?: NominatimAddress
}

export type NominatimSearchEntry = NominatimEntry & {
  boundingbox?: string[]
  geojson?: GeoJSON.Geometry | null
}

type SearchNominatimOptions = {
  limit?: number
  polygonGeoJson?: boolean
  acceptLanguage?: string
}

const DEFAULT_ACCEPT_LANGUAGE = 'zh-CN,en'

const pickPlaceName = (entry: NominatimEntry) => {
  const address = entry.address || {}
  return (
    entry.name ||
    address.attraction ||
    address.city ||
    address.town ||
    address.village ||
    address.county ||
    entry.display_name.split(',')[0] ||
    '未命名地点'
  )
}

export const normalizeGeocodeResult = (entry: NominatimEntry): GeocodeResult => {
  const address = entry.address || {}

  return {
    displayName: entry.display_name,
    placeName: pickPlaceName(entry),
    lat: Number(entry.lat),
    lng: Number(entry.lon),
    countryName: address.country || null,
    regionName: address.state || address.region || address.county || null,
    cityName:
      address.city ||
      address.town ||
      address.village ||
      address.city_district ||
      address.suburb ||
      address.neighbourhood ||
      address.hamlet ||
      null
  }
}

export const getPreferredGeocodeAcceptLanguage = (event: H3Event) => {
  return getHeader(event, 'accept-language') || DEFAULT_ACCEPT_LANGUAGE
}

const getNominatimHeaders = (event: H3Event, acceptLanguage = DEFAULT_ACCEPT_LANGUAGE) => {
  const config = useRuntimeConfig(event)

  return {
    'User-Agent': config.geocodeUserAgent,
    'Accept-Language': acceptLanguage
  }
}

export const fetchSearchGeocodeEntries = async (
  event: H3Event,
  q: string,
  options: SearchNominatimOptions = {}
) => {
  const config = useRuntimeConfig(event)

  return await $fetch<NominatimSearchEntry[]>(`${config.geocodeBaseUrl}/search`, {
    query: {
      q,
      format: 'jsonv2',
      addressdetails: 1,
      limit: options.limit ?? 6,
      polygon_geojson: options.polygonGeoJson ? 1 : undefined
    },
    headers: getNominatimHeaders(event, options.acceptLanguage)
  })
}

export const fetchReverseGeocodeResult = async (
  event: H3Event,
  location: LatLng,
  acceptLanguage = DEFAULT_ACCEPT_LANGUAGE
) => {
  const config = useRuntimeConfig(event)
  const result = await $fetch<NominatimEntry>(`${config.geocodeBaseUrl}/reverse`, {
    query: {
      lat: location.lat,
      lon: location.lng,
      format: 'jsonv2',
      addressdetails: 1
    },
    headers: getNominatimHeaders(event, acceptLanguage)
  })

  return normalizeGeocodeResult(result)
}
