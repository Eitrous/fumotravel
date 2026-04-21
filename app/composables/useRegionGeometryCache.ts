import type { RegionGeometryResponse, RegionScope } from '~~/shared/fumo'

export const REGION_GEOMETRY_CACHE_TTL_MS = 10 * 60 * 1000
export const MAX_REGION_GEOMETRY_CACHE_ITEMS = 50

type CachedRegionGeometry = {
  regionGeometry: RegionGeometryResponse
  lastAccessedAt: number
  expiresAt: number
}

const pendingRegionGeometryRequests = new Map<string, Promise<RegionGeometryResponse>>()

const normalizeScopeValue = (value: string | null) => value?.trim().toLowerCase() || ''

const cacheKeyForRegionGeometry = (scope: RegionScope) => {
  return [
    normalizeScopeValue(scope.countryName),
    normalizeScopeValue(scope.regionName),
    normalizeScopeValue(scope.cityName)
  ].join('::')
}

export const useRegionGeometryCache = () => {
  const cache = useState<Record<string, CachedRegionGeometry>>('region-geometry-cache', () => ({}))

  const removeCacheKey = (key: string) => {
    if (!cache.value[key]) {
      return
    }

    const next = { ...cache.value }
    delete next[key]
    cache.value = next
  }

  const pruneExpiredRegionGeometry = (now = Date.now()) => {
    const next = { ...cache.value }
    let changed = false

    for (const [key, item] of Object.entries(next)) {
      if (item.expiresAt <= now) {
        delete next[key]
        changed = true
      }
    }

    if (changed) {
      cache.value = next
    }
  }

  const trimRegionGeometryCache = () => {
    const entries = Object.entries(cache.value)
    if (entries.length <= MAX_REGION_GEOMETRY_CACHE_ITEMS) {
      return
    }

    const keysToRemove = entries
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt)
      .slice(0, entries.length - MAX_REGION_GEOMETRY_CACHE_ITEMS)
      .map(([key]) => key)

    const next = { ...cache.value }
    for (const key of keysToRemove) {
      delete next[key]
    }
    cache.value = next
  }

  const setRegionGeometry = (key: string, regionGeometry: RegionGeometryResponse) => {
    const now = Date.now()
    cache.value = {
      ...cache.value,
      [key]: {
        regionGeometry,
        lastAccessedAt: now,
        expiresAt: now + REGION_GEOMETRY_CACHE_TTL_MS
      }
    }
    trimRegionGeometryCache()
  }

  const getCachedRegionGeometry = (key: string) => {
    const now = Date.now()
    const cached = cache.value[key]

    if (!cached) {
      return null
    }

    if (cached.expiresAt <= now) {
      removeCacheKey(key)
      return null
    }

    cache.value = {
      ...cache.value,
      [key]: {
        ...cached,
        lastAccessedAt: now
      }
    }

    return cached.regionGeometry
  }

  const getRegionGeometry = async (scope: RegionScope) => {
    pruneExpiredRegionGeometry()

    const key = cacheKeyForRegionGeometry(scope)
    const cached = getCachedRegionGeometry(key)
    if (cached) {
      return cached
    }

    const pendingRequest = pendingRegionGeometryRequests.get(key)
    if (pendingRequest) {
      return pendingRequest
    }

    const request = $fetch<RegionGeometryResponse>('/api/regions/geometry', {
      query: {
        country: scope.countryName || undefined,
        region: scope.regionName,
        city: scope.cityName || undefined
      }
    })
      .then((regionGeometry) => {
        setRegionGeometry(key, regionGeometry)
        return regionGeometry
      })
      .finally(() => {
        pendingRegionGeometryRequests.delete(key)
      })

    pendingRegionGeometryRequests.set(key, request)
    return request
  }

  const invalidateRegionGeometry = () => {
    cache.value = {}
    pendingRegionGeometryRequests.clear()
  }

  return {
    getRegionGeometry,
    invalidateRegionGeometry
  }
}
