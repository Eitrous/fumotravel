import { getQuery } from 'h3'
import type { PublicRegionPage, RegionScope, RegionSort } from '~~/shared/fumo'
import {
  createPublicServerClient,
  signStorageObjects
} from '~~/server/utils/supabase'

type RegionPostRow = {
  id: number
  user_id: string
  title: string
  image_path: string
  thumb_path: string | null
  place_name: string | null
  captured_at: string | null
  created_at: string | null
}

const REGION_SORT_VALUES = new Set<RegionSort>(['created', 'captured'])

const getTrimmedQueryValue = (value: unknown) => {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

const applyRegionFilters = <T extends {
  eq: (column: string, value: string) => T
}>(request: T, scope: RegionScope) => {
  let next = request.eq('region_name', scope.regionName)

  if (scope.countryName) {
    next = next.eq('country_name', scope.countryName)
  }

  if (scope.cityName) {
    next = next.eq('city_name', scope.cityName)
  }

  return next
}

const buildRegionTitle = (scope: RegionScope) => {
  return [scope.cityName, scope.regionName, scope.countryName].filter(Boolean).join(' / ')
}

export default defineEventHandler(async (event): Promise<PublicRegionPage> => {
  const query = getQuery(event)
  const regionName = getTrimmedQueryValue(query.region)

  if (!regionName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Region is required.'
    })
  }

  const scope: RegionScope = {
    countryName: getTrimmedQueryValue(query.country),
    regionName,
    cityName: getTrimmedQueryValue(query.city)
  }

  const rawSort = getTrimmedQueryValue(query.sort)
  const sort: RegionSort = rawSort && REGION_SORT_VALUES.has(rawSort as RegionSort)
    ? rawSort as RegionSort
    : 'created'

  const supabase = createPublicServerClient(event)
  const countRequest = applyRegionFilters(
    supabase
      .from('public_approved_posts')
      .select('id', {
        count: 'exact',
        head: true
      }),
    scope
  )
  const { count, error: countError } = await countRequest

  if (countError) {
    throw createError({
      statusCode: 500,
      statusMessage: countError.message
    })
  }

  let postsRequest = applyRegionFilters(
    supabase
      .from('public_approved_posts')
      .select(`
        id,
        user_id,
        title,
        image_path,
        thumb_path,
        place_name,
        captured_at,
        created_at
      `),
    scope
  )

  if (sort === 'captured') {
    postsRequest = postsRequest
      .order('captured_at', {
        ascending: false,
        nullsFirst: false
      })
      .order('created_at', { ascending: false })
  } else {
    postsRequest = postsRequest.order('created_at', { ascending: false })
  }

  const { data: rows, error: postsError } = await postsRequest.limit(100)

  if (postsError) {
    throw createError({
      statusCode: 500,
      statusMessage: postsError.message
    })
  }

  const posts = (rows || []) as RegionPostRow[]
  const userIds = [...new Set(posts.map((post) => post.user_id))]
  const authorMap = new Map<string, string>()

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('public_profiles')
      .select('id, username')
      .in('id', userIds)

    if (profilesError) {
      throw createError({
        statusCode: 500,
        statusMessage: profilesError.message
      })
    }

    for (const profile of profiles || []) {
      authorMap.set(profile.id, profile.username)
    }
  }

  const coverPathByPostId = new Map<number, string>()
  for (const post of posts) {
    coverPathByPostId.set(post.id, post.thumb_path || post.image_path)
  }
  const coverUrls = await signStorageObjects(event, [...coverPathByPostId.values()], 60 * 30)

  return {
    title: buildRegionTitle(scope),
    scope,
    sort,
    postCount: count ?? posts.length,
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      thumbUrl: coverUrls.get(coverPathByPostId.get(post.id) || '') ?? null,
      placeName: post.place_name,
      capturedAt: post.captured_at,
      createdAt: post.created_at,
      author: {
        username: authorMap.get(post.user_id) ?? 'unknown'
      }
    }))
  }
})
