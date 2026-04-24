type DeferredVisibilityOptions = {
  rootMargin?: string
}

export const useDeferredVisibility = (options: DeferredVisibilityOptions = {}) => {
  const targetRef = ref<HTMLElement | null>(null)
  const isActivated = ref(false)
  let observer: IntersectionObserver | null = null

  const activate = () => {
    if (isActivated.value) {
      return
    }

    isActivated.value = true
    observer?.disconnect()
    observer = null
  }

  onMounted(() => {
    if (isActivated.value) {
      return
    }

    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      activate()
      return
    }

    if (!targetRef.value) {
      activate()
      return
    }

    observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        activate()
      }
    }, {
      rootMargin: options.rootMargin || '200px 0px'
    })

    observer.observe(targetRef.value)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return {
    targetRef,
    isActivated,
    activate
  }
}
