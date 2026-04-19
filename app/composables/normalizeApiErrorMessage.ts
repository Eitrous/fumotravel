type ApiErrorLike = {
  statusCode?: unknown
  status?: unknown
  statusMessage?: unknown
  message?: unknown
  data?: {
    statusCode?: unknown
    statusMessage?: unknown
    message?: unknown
  }
  response?: {
    status?: unknown
    statusText?: unknown
    _data?: {
      statusCode?: unknown
      statusMessage?: unknown
      message?: unknown
    }
  }
}

const asNonEmptyString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const asStatusCode = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }

  return parsed >= 100 && parsed <= 599 ? parsed : null
}

export const normalizeApiErrorMessage = (error: unknown, fallback: string) => {
  const fallbackMessage = asNonEmptyString(fallback) || 'Request failed.'

  if (!error || typeof error !== 'object') {
    return fallbackMessage
  }

  const maybeError = error as ApiErrorLike
  const statusCode =
    asStatusCode(maybeError.statusCode)
    ?? asStatusCode(maybeError.data?.statusCode)
    ?? asStatusCode(maybeError.response?._data?.statusCode)
    ?? asStatusCode(maybeError.response?.status)
    ?? asStatusCode(maybeError.status)

  const reason =
    asNonEmptyString(maybeError.data?.statusMessage)
    ?? asNonEmptyString(maybeError.response?._data?.statusMessage)
    ?? asNonEmptyString(maybeError.data?.message)
    ?? asNonEmptyString(maybeError.response?._data?.message)
    ?? asNonEmptyString(maybeError.statusMessage)
    ?? asNonEmptyString(maybeError.response?.statusText)
    ?? asNonEmptyString(maybeError.message)

  if (statusCode && reason) {
    if (reason.startsWith(`${statusCode}`)) {
      return reason
    }

    return `${statusCode} · ${reason}`
  }

  if (statusCode) {
    return `${statusCode} · ${fallbackMessage}`
  }

  return reason || fallbackMessage
}
