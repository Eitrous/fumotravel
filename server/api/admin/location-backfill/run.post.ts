import { readBody, type H3Event } from 'h3'
import { fetchReverseGeocodeResult } from '~~/server/utils/geocode'
import {
  clampLocationBackfillBatchSize,
  fetchLocationBackfillBatch,
  getLocationBackfillSource,
  getLocationScopeDiff,
  toLocationBackfillCursorValue,
  type LocationBackfillCursor,
  type LocationBackfillRow
} from '~~/server/utils/locationBackfill'
import { createAdminServerClient, requireAdminUser } from '~~/server/utils/supabase'

type LocationBackfillBody = {
  batchSize?: number
  dryRun?: boolean
  cursor?: {
    postsAfterId?: number
    revisionsAfterId?: number
  }
}

type FailureItem = {
  stage: 'geocode' | 'update'
  scope: 'posts' | 'post_revisions'
  key: string
  message: string
}

type BatchSummary = {
  posts: number
  revisions: number
}

type BatchProcessResult = {
  processed: BatchSummary
  wouldUpdate: BatchSummary
  updated: BatchSummary
  failures: FailureItem[]
  cursor: LocationBackfillCursor
  hasMore: boolean
}

type BackfillEntry = {
  scope: 'posts' | 'post_revisions'
  row: LocationBackfillRow
}

const LOCATION_BACKFILL_CONCURRENCY = 2

const createEmptySummary = (): BatchSummary => ({
  posts: 0,
  revisions: 0
})

const addSummary = (target: BatchSummary, source: BatchSummary) => {
  target.posts += source.posts
  target.revisions += source.revisions
}

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unknown error.'
}

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) => {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()))
  return results
}

const processBatch = async (
  event: H3Event,
  supabase: ReturnType<typeof createAdminServerClient>,
  cursor: LocationBackfillCursor,
  batchSize: number,
  dryRun: boolean
): Promise<BatchProcessResult> => {
  const batch = await fetchLocationBackfillBatch(supabase, cursor, batchSize)
  const entries: BackfillEntry[] = [
    ...batch.posts.map((row) => ({
      scope: 'posts' as const,
      row
    })),
    ...batch.revisions.map((row) => ({
      scope: 'post_revisions' as const,
      row
    }))
  ]

  const processed = {
    posts: batch.posts.length,
    revisions: batch.revisions.length
  }
  const wouldUpdate = createEmptySummary()
  const updated = createEmptySummary()
  const failures: FailureItem[] = []

  const resolvedEntries = await mapWithConcurrency(entries, LOCATION_BACKFILL_CONCURRENCY, async (entry) => {
    const sourceLocation = getLocationBackfillSource(entry.row)

    if (!sourceLocation) {
      return {
        entry,
        diff: null,
        failure: {
          stage: 'geocode' as const,
          scope: entry.scope,
          key: String(entry.row.id),
          message: 'No usable coordinates.'
        }
      }
    }

    try {
      const geocodeResult = await fetchReverseGeocodeResult(event, sourceLocation)
      return {
        entry,
        diff: getLocationScopeDiff(entry.row, {
          countryName: geocodeResult.countryName,
          regionName: geocodeResult.regionName,
          cityName: geocodeResult.cityName
        }),
        failure: null
      }
    } catch (error) {
      return {
        entry,
        diff: null,
        failure: {
          stage: 'geocode' as const,
          scope: entry.scope,
          key: String(entry.row.id),
          message: getErrorMessage(error)
        }
      }
    }
  })

  for (const result of resolvedEntries) {
    if (result.failure) {
      failures.push(result.failure)
      continue
    }

    if (!result.diff?.changed) {
      continue
    }

    if (result.entry.scope === 'posts') {
      wouldUpdate.posts += 1
    } else {
      wouldUpdate.revisions += 1
    }

    if (dryRun) {
      continue
    }

    const { error } = await supabase
      .from(result.entry.scope)
      .update(result.diff.values)
      .eq('id', result.entry.row.id)

    if (error) {
      failures.push({
        stage: 'update',
        scope: result.entry.scope,
        key: String(result.entry.row.id),
        message: error.message
      })
      continue
    }

    if (result.entry.scope === 'posts') {
      updated.posts += 1
    } else {
      updated.revisions += 1
    }
  }

  return {
    processed,
    wouldUpdate,
    updated,
    failures,
    cursor: batch.cursor,
    hasMore: batch.hasMore
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const body = await readBody<LocationBackfillBody>(event)
  const dryRun = Boolean(body?.dryRun)
  const batchSize = clampLocationBackfillBatchSize(body?.batchSize)
  const supabase = createAdminServerClient(event)

  let cursor: LocationBackfillCursor = {
    postsAfterId: toLocationBackfillCursorValue(body?.cursor?.postsAfterId),
    revisionsAfterId: toLocationBackfillCursorValue(body?.cursor?.revisionsAfterId)
  }

  if (dryRun) {
    const totals = {
      processed: createEmptySummary(),
      wouldUpdate: createEmptySummary(),
      updated: createEmptySummary(),
      failures: [] as FailureItem[]
    }

    while (true) {
      const result = await processBatch(event, supabase, cursor, batchSize, true)
      addSummary(totals.processed, result.processed)
      addSummary(totals.wouldUpdate, result.wouldUpdate)
      addSummary(totals.updated, result.updated)
      totals.failures.push(...result.failures)
      cursor = result.cursor

      if (!result.hasMore) {
        break
      }
    }

    return {
      dryRun: true,
      batchSize,
      processed: totals.processed,
      wouldUpdate: totals.wouldUpdate,
      updated: totals.updated,
      failures: {
        geocode: totals.failures.filter((failure) => failure.stage === 'geocode').length,
        updates: totals.failures.filter((failure) => failure.stage === 'update').length,
        items: totals.failures
      },
      cursor,
      hasMore: false
    }
  }

  const result = await processBatch(event, supabase, cursor, batchSize, false)

  return {
    dryRun: false,
    batchSize,
    processed: result.processed,
    wouldUpdate: result.wouldUpdate,
    updated: result.updated,
    failures: {
      geocode: result.failures.filter((failure) => failure.stage === 'geocode').length,
      updates: result.failures.filter((failure) => failure.stage === 'update').length,
      items: result.failures
    },
    cursor: result.cursor,
    hasMore: result.hasMore
  }
})
