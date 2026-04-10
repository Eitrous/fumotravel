import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router'
import type { WorkbenchPanel } from '~~/shared/fumo'

const PANEL_VALUES = new Set<WorkbenchPanel>(['info', 'post', 'login', 'onboarding', 'submit'])

const firstQueryValue = (value: LocationQuery[string]) => {
  return Array.isArray(value) ? value[0] : value
}

export const resolveWorkbenchState = (query: LocationQuery) => {
  const requestedPanel = firstQueryValue(query.panel)
  const rawPanel = typeof requestedPanel === 'string' ? requestedPanel : 'info'
  let panel: WorkbenchPanel = PANEL_VALUES.has(rawPanel as WorkbenchPanel)
    ? rawPanel as WorkbenchPanel
    : 'info'

  const rawPost = firstQueryValue(query.post)
  const postId = typeof rawPost === 'string' ? Number(rawPost) : Number.NaN
  const hasValidPostId = Number.isInteger(postId) && postId > 0

  if (panel === 'post' && !hasValidPostId) {
    panel = 'info'
  }

  const rawNext = firstQueryValue(query.next)
  const nextPath = typeof rawNext === 'string' && rawNext.trim()
    ? rawNext
    : null

  return {
    panel,
    postId: panel === 'post' && hasValidPostId ? postId : null,
    nextPath
  }
}

export const createWorkbenchLocation = (
  panel: WorkbenchPanel = 'info',
  options: {
    postId?: number | null
    next?: string | null
  } = {}
): RouteLocationRaw => {
  const query: LocationQueryRaw = {}

  if (panel !== 'info') {
    query.panel = panel
  }

  if (panel === 'post' && options.postId) {
    query.post = String(options.postId)
  }

  if (options.next) {
    query.next = options.next
  }

  return {
    path: '/',
    query
  }
}
