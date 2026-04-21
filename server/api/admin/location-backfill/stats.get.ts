import { createAdminServerClient, requireAdminUser } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const supabase = createAdminServerClient(event)

  const [{ count: postsCount, error: postsError }, { count: revisionsCount, error: revisionsError }] = await Promise.all([
    supabase
      .from('posts')
      .select('id', {
        count: 'exact',
        head: true
      }),
    supabase
      .from('post_revisions')
      .select('id', {
        count: 'exact',
        head: true
      })
  ])

  if (postsError) {
    throw createError({
      statusCode: 500,
      statusMessage: postsError.message
    })
  }

  if (revisionsError) {
    throw createError({
      statusCode: 500,
      statusMessage: revisionsError.message
    })
  }

  return {
    totals: {
      posts: postsCount ?? 0,
      revisions: revisionsCount ?? 0,
      eligibleRows: (postsCount ?? 0) + (revisionsCount ?? 0)
    }
  }
})
