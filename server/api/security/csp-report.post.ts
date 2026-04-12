import { readRawBody, setResponseStatus } from 'h3'
import { enforceRateLimit, getRateLimitIdentifier } from '~~/server/utils/rateLimit'
import { notifySecurityAlert } from '~~/server/utils/securityAlert'

type CspReportBody = {
  'csp-report'?: Record<string, unknown>
  'document-uri'?: unknown
  'blocked-uri'?: unknown
  'violated-directive'?: unknown
  'effective-directive'?: unknown
  'source-file'?: unknown
  'line-number'?: unknown
  'column-number'?: unknown
}

const parseReport = (rawBody: string | undefined) => {
  if (!rawBody) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawBody) as CspReportBody
    return parsed['csp-report'] || parsed
  } catch {
    return {
      raw: rawBody.slice(0, 500)
    }
  }
}

const asString = (value: unknown) => {
  return typeof value === 'string' ? value : null
}

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'securityReportIp', getRateLimitIdentifier(event))

  const report = parseReport(await readRawBody(event))
  const violatedDirective = asString(report['violated-directive'])
    || asString(report['effective-directive'])
    || 'unknown-directive'
  const blockedUri = asString(report['blocked-uri']) || 'unknown-uri'

  await notifySecurityAlert(event, {
    type: 'csp_report',
    severity: 'warning',
    message: `CSP report-only violation: ${violatedDirective}`,
    fingerprint: `csp:${violatedDirective}:${blockedUri}`,
    metadata: {
      documentUri: report['document-uri'],
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      effectiveDirective: report['effective-directive'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number']
    }
  })

  setResponseStatus(event, 204)
  return null
})
