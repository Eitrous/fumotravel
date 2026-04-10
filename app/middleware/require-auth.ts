export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return
  }

  const auth = useAuthState()
  await auth.init()

  if (!auth.user.value) {
    return navigateTo({
      path: '/',
      query: {
        panel: 'login',
        next: to.fullPath
      }
    })
  }
})
