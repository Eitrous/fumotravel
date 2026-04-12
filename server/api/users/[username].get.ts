import { getRouterParam } from 'h3'
import type { PublicUserPage } from '~~/shared/fumo'
import { USERNAME_PATTERN } from '~~/shared/fumo'
import {
  createPublicServerClient,
  getOptionalAuthenticatedUser,
  signStorageObjects
} from '~~/server/utils/supabase'
import { getOrderedPhotoRows, type PhotoRow } from '~~/server/utils/posts'

export default defineEventHandler(async (event): Promise<PublicUserPage> => {
  const username = decodeURIComponent(String(getRouterParam(event, 'username') || '')).trim()

  if (!USERNAME_PATTERN.test(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid username.'
    })
  }

  const supabase = createPublicServerClient(event)
  const auth = await getOptionalAuthenticatedUser(event)
  const { data: profile, error: profileError } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .eq('username', username)
    .single()

  if (profileError || !profile?.username) {
    throw createError({
      statusCode: 404,
      statusMessage: profileError?.message || 'User not found.'
    })
  }

  const isSelf = auth?.user.id === profile.id
  const postsClient = isSelf && auth
    ? createPublicServerClient(event, auth.accessToken)
    : supabase

  const postsSelect = `
    id,
    title,
    body,
    image_path,
    thumb_path,
    place_name,
    status,
    captured_at,
    created_at,
    updated_at
  `

  const selfPostsSelect = `
    ${postsSelect},
    post_photos (
      image_path,
      thumb_path,
      sort_order
    )
  `

  const { data: rows, error: postsError } = await postsClient
    .from(isSelf ? 'posts' : 'public_approved_posts')
    .select(isSelf ? selfPostsSelect : postsSelect)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (postsError) {
    throw createError({
      statusCode: 500,
      statusMessage: postsError.message
    })
  }

  const posts = rows || []
  const postIds = posts.map((post) => post.id)
  const pendingRevisionPostIds = new Set<number>()
  const publicPhotoRowsByPostId = new Map<number, PhotoRow[]>()

  if (!isSelf && postIds.length) {
    const { data: publicPhotoRows, error: publicPhotosError } = await supabase
      .from('public_approved_post_photos')
      .select('post_id, image_path, thumb_path, sort_order')
      .in('post_id', postIds)
      .order('sort_order', { ascending: true })

    if (publicPhotosError) {
      throw createError({
        statusCode: 500,
        statusMessage: publicPhotosError.message
      })
    }

    for (const photo of publicPhotoRows || []) {
      const rowsForPost = publicPhotoRowsByPostId.get(photo.post_id) || []
      rowsForPost.push(photo)
      publicPhotoRowsByPostId.set(photo.post_id, rowsForPost)
    }
  }

  if (isSelf && postIds.length) {
    const { data: pendingRevisions, error: revisionsError } = await postsClient
      .from('post_revisions')
      .select('post_id')
      .in('post_id', postIds)
      .eq('status', 'pending')

    if (revisionsError) {
      throw createError({
        statusCode: 500,
        statusMessage: revisionsError.message
      })
    }

    for (const revision of pendingRevisions || []) {
      pendingRevisionPostIds.add(revision.post_id)
    }
  }

  const coverPathsByPostId = new Map<number, string>()
  for (const post of posts) {
    const photoRows = isSelf
      ? getOrderedPhotoRows(post.post_photos as PhotoRow[], post)
      : getOrderedPhotoRows(publicPhotoRowsByPostId.get(post.id), post)
    const coverPhoto = photoRows[0]

    if (coverPhoto) {
      coverPathsByPostId.set(post.id, coverPhoto.thumb_path || coverPhoto.image_path)
    }
  }

  const coverUrls = await signStorageObjects(event, [...coverPathsByPostId.values()], 60 * 30)

  return {
    profile: {
      id: profile.id,
      username: profile.username,
      avatarUrl: profile.avatar_url
    },
    isSelf,
    posts: posts.map((post) => {
      const coverPath = coverPathsByPostId.get(post.id)

      return {
        id: post.id,
        title: post.title,
        body: post.body,
        thumbUrl: coverPath ? coverUrls.get(coverPath) ?? null : null,
        placeName: post.place_name,
        status: post.status,
        hasPendingRevision: pendingRevisionPostIds.has(post.id),
        capturedAt: post.captured_at,
        createdAt: post.created_at,
        updatedAt: post.updated_at
      }
    })
  }
})
