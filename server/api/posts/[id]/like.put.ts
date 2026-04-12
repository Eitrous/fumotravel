import { readBody } from 'h3'
import type { PostLikePayload, PostLikeResponse } from '~~/shared/fumo'
import {
  createPublicServerClient,
  ensureProfile,
  requireAuthenticatedUser
} from '~~/server/utils/supabase'
import { enforceRateLimit, getRateLimitIdentifier } from '~~/server/utils/rateLimit'

export default defineEventHandler(async (event): Promise<PostLikeResponse> => {
  const id = Number(event.context.params?.id)

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  await enforceRateLimit(event, 'likeIp', getRateLimitIdentifier(event))

  const body = await readBody<PostLikePayload>(event)
  if (typeof body?.liked !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Liked value is required.'
    })
  }

  const { accessToken, user } = await requireAuthenticatedUser(event)
  await enforceRateLimit(event, 'likeUser', user.id)
  await enforceRateLimit(event, 'likePostUser', `${user.id}:${id}`)

  await ensureProfile(event, user, accessToken)

  const supabase = createPublicServerClient(event, accessToken)
  const { data: post, error: postError } = await supabase
    .from('public_approved_posts')
    .select('id')
    .eq('id', id)
    .single()

  if (postError || !post) {
    throw createError({
      statusCode: 404,
      statusMessage: postError?.message || 'Post not found.'
    })
  }

  if (body.liked) {
    const { error: likeError } = await supabase
      .from('post_likes')
      .upsert({
        post_id: id,
        user_id: user.id
      }, {
        onConflict: 'post_id,user_id',
        ignoreDuplicates: true
      })

    if (likeError) {
      throw createError({
        statusCode: 500,
        statusMessage: likeError.message
      })
    }
  } else {
    const { error: unlikeError } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', id)
      .eq('user_id', user.id)

    if (unlikeError) {
      throw createError({
        statusCode: 500,
        statusMessage: unlikeError.message
      })
    }
  }

  const { data: likeCount, error: countError } = await supabase
    .from('public_approved_post_like_counts')
    .select('like_count')
    .eq('post_id', id)
    .maybeSingle()

  if (countError) {
    throw createError({
      statusCode: 500,
      statusMessage: countError.message
    })
  }

  return {
    postId: id,
    likeCount: likeCount?.like_count ?? 0,
    likedByViewer: body.liked
  }
})
