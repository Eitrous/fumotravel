import { getQuery } from 'h3'
import type { PublicMapCollection } from '~~/shared/fumo'
import { createPublicServerClient } from '~~/server/utils/supabase'
import { enforceRateLimit, getRateLimitIdentifier } from '~~/server/utils/rateLimit'

type MapQuery = {
  west?: string
  south?: string
  east?: string
  north?: string
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event) as MapQuery

  const west = Number(q.west)
  const south = Number(q.south)
  const east = Number(q.east)
  const north = Number(q.north)

  if ([west, south, east, north].some(Number.isNaN)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid bbox'
    })
  }

  await enforceRateLimit(event, 'mapIp', getRateLimitIdentifier(event))

  const supabase = createPublicServerClient(event)

  let query = supabase
    .from('public_approved_posts')
    .select(`
      id,
      user_id,
      title,
      place_name,
      public_lat,
      public_lng,
      privacy_mode,
      captured_at
    `)
    .not('public_lat', 'is', null)
    .not('public_lng', 'is', null)
    .gte('public_lat', south)
    .lte('public_lat', north)
    .order('created_at', { ascending: false })
    .limit(400)

  if (east < west) {
    query = query.or(`public_lng.gte.${west},public_lng.lte.${east}`)
  } else {
    query = query
      .gte('public_lng', west)
      .lte('public_lng', east)
  }

  const { data, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  const userIds = [...new Set((data || []).map((row: any) => row.user_id).filter(Boolean))]
  const profilesById = new Map<string, { username: string | null }>()

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
      profilesById.set(profile.id, profile)
    }
  }

  const features = (data || []).map((row: any) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [row.public_lng, row.public_lat]
    },
    properties: {
      id: row.id,
      title: row.title,
      placeName: row.place_name,
      username: profilesById.get(row.user_id)?.username ?? 'unknown',
      privacyMode: row.privacy_mode,
      capturedAt: row.captured_at
    }
  })) satisfies PublicMapCollection['features']

  return {
    type: 'FeatureCollection',
    features
  } satisfies PublicMapCollection
})
