import { applyCookiePolicy } from './session-controls'
import {
  FORM_CONTENT_TYPE,
  multipartBoundary,
  normalizeMultipartBody,
} from '@/features/request/model/request-body'

export const DEFAULT_REQUEST_TIMEOUT = 30000
export const methodAllowsBody = (method: string) =>
  !['GET', 'HEAD'].includes(method.toUpperCase())

export function prepareRequest(source: BrowseRequest): BrowseRequest {
  const request: BrowseRequest = JSON.parse(JSON.stringify(source))
  const url = new URL(request.url.trim().replace(/[\r\n]/g, ''))
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Request URL must use HTTP or HTTPS.')
  }
  request.url = url.href
  request.method = request.method.trim().toUpperCase()
  if (!/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(request.method)) {
    throw new Error('Invalid HTTP method.')
  }
  if (['CONNECT', 'TRACE', 'TRACK'].includes(request.method)) {
    throw new Error(`${request.method} is not supported by browser requests.`)
  }
  request.headers = request.headers.filter(h => h.enabled && h.name.trim())
  request.headers.forEach(header => {
    header.name = header.name.trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header.name)) {
      throw new Error(`Invalid header name: ${header.name}`)
    }
    if (/[\r\n\0]/.test(header.value)) {
      throw new Error(`Invalid line break in header: ${header.name}`)
    }
  })
  // Browser transport owns message framing. Captured lengths become stale after body edits;
  // forcing them through DNR can truncate requests or make the server reject them.
  request.headers = request.headers.filter(
    h =>
      !['content-length', 'transfer-encoding', 'trailer'].includes(
        h.name.toLowerCase(),
      ),
  )
  if (!methodAllowsBody(request.method)) {
    request.body.content = ''
  }
  request.timeoutMs = Math.min(
    120000,
    Math.max(100, Number(request.timeoutMs) || DEFAULT_REQUEST_TIMEOUT),
  )
  return request
}

/** Keep native GET/form navigation; use exact-body Fetch transport for other bodies. */
export function prepareExecutionRequest(
  source: BrowseRequest,
  rawMode: boolean,
) {
  let request = prepareRequest(source)
  if (
    request.cookiePolicy &&
    !['default', 'omit', 'override'].includes(request.cookiePolicy)
  )
    throw new Error('Invalid cookie policy.')
  if (request.cookiePolicy === 'omit')
    request = applyCookiePolicy(request, 'omit', '')

  const needsExactBody =
    !rawMode &&
    methodAllowsBody(request.method) &&
    (request.body.enctype !== FORM_CONTENT_TYPE ||
      request.cookiePolicy === 'omit' ||
      request.cookiePolicy === 'override')
  if (needsExactBody) {
    let contentType = request.body.enctype.replace(/ \(raw\)$/, '')
    if (contentType === FORM_CONTENT_TYPE)
      request.body.content = request.body.content.replace(/[\r\n]/g, '')
    if (contentType === 'multipart/form-data') {
      const boundary = multipartBoundary(request.body.content)
      request.body.content = normalizeMultipartBody(
        request.body.content,
        boundary,
      )
      contentType += `; boundary="${boundary}"`
    }
    if (
      !request.headers.some(
        header => header.name.toLowerCase() === 'content-type',
      )
    ) {
      request.headers.push({
        enabled: true,
        name: 'Content-Type',
        value: contentType,
        removeIfEmptyValue: false,
        _createdAt: Date.now() * 1000,
      })
    }
  }
  return {
    request,
    rawMode:
      rawMode ||
      needsExactBody ||
      request.cookiePolicy === 'omit' ||
      request.cookiePolicy === 'override' ||
      !['GET', 'POST'].includes(request.method),
  }
}

export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function requestError(error: unknown): DevtoolsErrorMessage {
  const name = error instanceof Error ? error.name : ''
  return {
    type: 'error',
    data: error instanceof Error ? error.message : String(error),
    code:
      name === 'TimeoutError'
        ? 'timeout'
        : name === 'AbortError'
          ? 'cancelled'
          : 'failed',
  }
}

export function requestTarget(url: string) {
  const target = new URL(url)
  target.hash = ''
  return target.href
}

export function toCurl(source: BrowseRequest, rawMode = true) {
  const execution = prepareExecutionRequest(source, rawMode)
  const request = execution.request
  rawMode = execution.rawMode
  const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`
  const args = [
    'curl',
    '--request',
    quote(request.method),
    quote(request.url),
    '--max-time',
    String(request.timeoutMs! / 1000),
  ]
  if (request.method === 'HEAD') args.push('--head')
  if (!rawMode || request.followRedirect) {
    args.push('--location')
  }
  request.headers.forEach(header => {
    const value = header.value
      ? `${header.name}: ${header.value}`
      : header.removeIfEmptyValue
        ? `${header.name}:`
        : `${header.name};`
    args.push('--header', quote(value))
  })
  if (methodAllowsBody(request.method)) {
    if (
      !request.headers.some(
        header => header.name.toLowerCase() === 'content-type',
      )
    ) {
      const contentType = rawMode
        ? 'text/plain;charset=UTF-8'
        : request.body.enctype.replace(/ \(raw\)$/, '')
      args.push('--header', quote(`Content-Type: ${contentType}`))
    }
    const body =
      !rawMode &&
      request.body.enctype.startsWith('application/x-www-form-urlencoded')
        ? request.body.content.replace(/[\r\n]/g, '')
        : request.body.content
    args.push('--data-raw', quote(body))
  }
  return args.join(' ')
}

export function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}
