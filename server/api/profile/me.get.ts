import { ensureProfile, requireAuthenticatedUser } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { accessToken, user } = await requireAuthenticatedUser(event)
  const profile = await ensureProfile(event, user, accessToken)

  return {
    userId: user.id,
    email: user.email ?? null,
    profile
  }
})
