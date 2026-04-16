import type { AdminSuggestionItem } from '~~/shared/fumo'
import { createAdminServerClient, requireAdminUser } from '~~/server/utils/supabase'

type SuggestionRow = {
  id: number
  content: string
  created_at: string | null
  user_id: string
  profiles:
    | {
        username: string | null
        avatar_url: string | null
      }
    | Array<{
        username: string | null
        avatar_url: string | null
      }>
    | null
}

const firstProfile = (profiles: SuggestionRow['profiles']) => {
  if (Array.isArray(profiles)) {
    return profiles[0] || null
  }

  return profiles
}

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const supabase = createAdminServerClient(event)
  const { data, error } = await supabase
    .from('suggestions')
    .select(`
      id,
      content,
      created_at,
      user_id,
      profiles!suggestions_user_id_fkey (
        username,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return ((data || []) as SuggestionRow[]).map((row): AdminSuggestionItem => {
    const profile = firstProfile(row.profiles)

    return {
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      author: {
        id: row.user_id,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null
      }
    }
  })
})
