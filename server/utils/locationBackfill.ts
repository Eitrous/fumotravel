import type { RegionScope } from '~~/shared/fumo'

export type LocationBackfillCursor = {
  postsAfterId: number
  revisionsAfterId: number
}

export type LocationBackfillRow = {
  id: number
  exact_lat: number | null
  exact_lng: number | null
  public_lat: number | null
  public_lng: number | null
  country_name: string | null
  region_name: string | null
  city_name: string | null
}

const LOCATION_BACKFILL_FIELDS = `
  id,
  exact_lat,
  exact_lng,
  public_lat,
  public_lng,
  country_name,
  region_name,
  city_name
`

export const clampLocationBackfillBatchSize = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 30
  }

  return Math.max(1, Math.min(100, Math.round(value)))
}

export const toLocationBackfillCursorValue = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.floor(value)
}

export const fetchLocationBackfillBatch = async (
  supabase: any,
  cursor: LocationBackfillCursor,
  batchSize: number
) => {
  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select(LOCATION_BACKFILL_FIELDS)
    .gt('id', cursor.postsAfterId)
    .order('id', { ascending: true })
    .limit(batchSize)

  if (postsError) {
    throw createError({
      statusCode: 500,
      statusMessage: postsError.message
    })
  }

  const { data: revisions, error: revisionsError } = await supabase
    .from('post_revisions')
    .select(LOCATION_BACKFILL_FIELDS)
    .gt('id', cursor.revisionsAfterId)
    .order('id', { ascending: true })
    .limit(batchSize)

  if (revisionsError) {
    throw createError({
      statusCode: 500,
      statusMessage: revisionsError.message
    })
  }

  const nextCursor = {
    postsAfterId: posts?.at(-1)?.id ?? cursor.postsAfterId,
    revisionsAfterId: revisions?.at(-1)?.id ?? cursor.revisionsAfterId
  }

  return {
    posts: (posts || []) as LocationBackfillRow[],
    revisions: (revisions || []) as LocationBackfillRow[],
    cursor: nextCursor,
    hasMore: (posts?.length ?? 0) === batchSize || (revisions?.length ?? 0) === batchSize
  }
}

export const getLocationBackfillSource = (row: LocationBackfillRow) => {
  if (typeof row.exact_lat === 'number' && typeof row.exact_lng === 'number') {
    return {
      lat: row.exact_lat,
      lng: row.exact_lng
    }
  }

  if (typeof row.public_lat === 'number' && typeof row.public_lng === 'number') {
    return {
      lat: row.public_lat,
      lng: row.public_lng
    }
  }

  return null
}

const normalizeScopeValue = (value: string | null) => value?.trim() || ''

export const getLocationScopeDiff = (
  row: LocationBackfillRow,
  nextScope: Pick<RegionScope, 'countryName' | 'regionName' | 'cityName'>
) => {
  const current = {
    countryName: normalizeScopeValue(row.country_name),
    regionName: normalizeScopeValue(row.region_name),
    cityName: normalizeScopeValue(row.city_name)
  }
  const next = {
    countryName: normalizeScopeValue(nextScope.countryName),
    regionName: normalizeScopeValue(nextScope.regionName),
    cityName: normalizeScopeValue(nextScope.cityName)
  }

  return {
    changed:
      current.countryName !== next.countryName
      || current.regionName !== next.regionName
      || current.cityName !== next.cityName,
    values: {
      country_name: nextScope.countryName,
      region_name: nextScope.regionName,
      city_name: nextScope.cityName
    }
  }
}
