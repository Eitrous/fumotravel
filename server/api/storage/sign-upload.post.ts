import { readBody } from 'h3'
import { isOwnedStoragePath } from '~~/server/utils/posts'
import { requireAuthenticatedUser } from '~~/server/utils/supabase'
import { createSignedUploadUrl } from '~~/server/utils/storage'

type SignUploadBody = {
  path?: unknown
  contentType?: unknown
  expiresIn?: unknown
}

const MAX_CONTENT_TYPE_LENGTH = 128

const sanitizeContentType = (value: unknown) => {
  if (typeof value !== 'string') {
    return 'application/octet-stream'
  }

  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > MAX_CONTENT_TYPE_LENGTH) {
    return 'application/octet-stream'
  }

  return trimmed
}

const normalizePath = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const normalizeExpiresIn = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return Math.floor(parsed)
}

export default defineEventHandler(async (event) => {
  const { user } = await requireAuthenticatedUser(event)
  const body = await readBody<SignUploadBody>(event)

  const path = normalizePath(body?.path)
  if (!path || !isOwnedStoragePath(path, user.id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Storage path is invalid.'
    })
  }

  const contentType = sanitizeContentType(body?.contentType)
  const expiresIn = normalizeExpiresIn(body?.expiresIn)
  const uploadUrl = await createSignedUploadUrl(event, path, {
    contentType,
    expiresIn
  })

  return {
    path,
    method: 'PUT' as const,
    uploadUrl,
    contentType
  }
})