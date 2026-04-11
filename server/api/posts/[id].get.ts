import type { PublicPostDetail } from '~~/shared/fumo'
import {
  createAdminServerClient,
  getOptionalAuthenticatedUser
} from '~~/server/utils/supabase'
import { getOrderedPhotoRows, signPhotoRows, type PhotoRow } from '~~/server/utils/posts'

export default defineEventHandler(async (event): Promise<PublicPostDetail> => {
  const id = Number(event.context.params?.id)

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const supabase = createAdminServerClient(event)
  const auth = await getOptionalAuthenticatedUser(event)

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      title,
      body,
      image_path,
      thumb_path,
      place_name,
      country_name,
      region_name,
      city_name,
      public_lat,
      public_lng,
      privacy_mode,
      captured_at,
      created_at,
      post_photos (
        image_path,
        thumb_path,
        sort_order
      ),
      profiles!posts_user_id_fkey (
        username,
        avatar_url
      )
    `)
    .eq('id', id)
    .eq('status', 'approved')
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 404,
      statusMessage: error?.message || 'Post not found'
    })
  }

  const photoRows = getOrderedPhotoRows(data.post_photos as PhotoRow[], data)
  const photos = await signPhotoRows(event, photoRows, 60 * 60)
  const coverPhoto = photos[0] || {
    imageUrl: null,
    thumbUrl: null
  }

  const { count: likeCount, error: likeCountError } = await supabase
    .from('post_likes')
    .select('post_id', { count: 'exact', head: true })
    .eq('post_id', id)

  if (likeCountError) {
    throw createError({
      statusCode: 500,
      statusMessage: likeCountError.message
    })
  }

  let likedByViewer = false
  if (auth) {
    const { data: viewerLikes, error: viewerLikeError } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', id)
      .eq('user_id', auth.user.id)
      .limit(1)

    if (viewerLikeError) {
      throw createError({
        statusCode: 500,
        statusMessage: viewerLikeError.message
      })
    }

    likedByViewer = Boolean(viewerLikes?.length)
  }

  return {
    id: data.id,
    title: data.title,
    body: data.body,
    imageUrl: coverPhoto.imageUrl,
    thumbUrl: coverPhoto.thumbUrl,
    photos,
    likeCount: likeCount ?? 0,
    likedByViewer,
    placeName: data.place_name,
    countryName: data.country_name,
    regionName: data.region_name,
    cityName: data.city_name,
    publicLocation: data.public_lat != null && data.public_lng != null
      ? {
          lat: data.public_lat,
          lng: data.public_lng
        }
      : null,
    privacyMode: data.privacy_mode,
    capturedAt: data.captured_at,
    createdAt: data.created_at,
    author: {
      username: data.profiles?.username ?? 'unknown',
      avatarUrl: data.profiles?.avatar_url ?? null
    }
  }
})
