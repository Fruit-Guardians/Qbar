const byteLength = (value: string) => new TextEncoder().encode(value).byteLength
type HarHeader = { name: string; value: string }
export type CapturedRequest = {
  id: number
  method: string
  url: string
  status: number
  started: string
  request?: BrowseRequest
  error: string
  resourceType?: string
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
function headers(value: unknown): HarHeader[] {
  if (!Array.isArray(value)) return []
  return value
    .map(record)
    .filter(h => typeof h.name === 'string' && typeof h.value === 'string')
    .map(h => ({ name: h.name as string, value: h.value as string }))
}
export function captureRequest(
  entry: unknown,
  id: number,
): CapturedRequest | null {
  const e = record(entry),
    req = record(e.request),
    res = record(e.response)
  if (typeof req.url !== 'string' || !/^https?:\/\//i.test(req.url)) return null
  const result: CapturedRequest = {
    id,
    url: req.url,
    method: typeof req.method === 'string' ? req.method : 'GET',
    status: typeof res.status === 'number' ? res.status : 0,
    started: typeof e.startedDateTime === 'string' ? e.startedDateTime : '',
    error: '',
    resourceType:
      typeof e._resourceType === 'string' ? e._resourceType : undefined,
  }
  try {
    if (byteLength(JSON.stringify(req)) > 512 * 1024)
      throw new Error('Request exceeds the 512 KiB capture limit.')
    const hs = headers(req.headers),
      post = record(req.postData)
    let content = ''
    const allowsBody = !['GET', 'HEAD'].includes(result.method.toUpperCase())
    if (allowsBody) {
      if (
        post.encoding ||
        post._encoding ||
        (Array.isArray(post.params) &&
          post.params.some(p => typeof record(p).fileName === 'string'))
      )
        throw new Error(
          'Encoded / binary request body is not available as exact text.',
        )
      if (typeof post.text === 'string') content = post.text
      else if (req.bodySize !== 0)
        throw new Error(
          'Exact request body was not supplied by DevTools. Copy as cURL or enter the body manually.',
        )
    }
    if (
      allowsBody &&
      typeof req.bodySize === 'number' &&
      req.bodySize >= 0 &&
      new TextEncoder().encode(content).byteLength !== req.bodySize
    ) {
      throw new Error(
        'Captured body size does not match the request. Exact replay is not available.',
      )
    }
    const enctype =
      hs.find(h => h.name.toLowerCase() === 'content-type')?.value ||
      (typeof post.mimeType === 'string'
        ? post.mimeType
        : 'application/x-www-form-urlencoded')
    if (
      allowsBody &&
      content &&
      !hs.some(h => h.name.toLowerCase() === 'content-type')
    )
      hs.push({ name: 'Content-Type', value: enctype })
    result.request = {
      url: result.url,
      method: result.method,
      body: { content, enctype },
      headers: hs.map((h, i) => ({
        ...h,
        enabled: true,
        removeIfEmptyValue: false,
        _createdAt: id * 10000 + i,
      })),
      followRedirect: false,
      timeoutMs: 30000,
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'Request data unavailable.'
  }
  return result
}
export type NetworkEvents = {
  addListener: (listener: (entry: unknown) => void) => void
  removeListener: (listener: (entry: unknown) => void) => void
}
export type NetworkApi = {
  getHAR: (
    callback?: (har: Record<string, unknown>) => void,
  ) => Promise<Record<string, unknown>> | void
  onRequestFinished: NetworkEvents
  onNavigated: NetworkEvents
}
/** Chrome callback API (also before promise support) and Firefox promise API. */
export function readNetworkHar(api: NetworkApi, signal: AbortSignal) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let done = false
    const finish = (value?: Record<string, unknown>, error?: unknown) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      if (error) reject(error)
      else resolve(value ?? {})
    }
    const aborted = () =>
      finish(undefined, new Error('Capture refresh cancelled.'))
    const timer = setTimeout(
      () => finish(undefined, new Error('Capture refresh timed out.')),
      5000,
    )
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) {
      aborted()
      return
    }
    try {
      let result
      try {
        result = api.getHAR(value => finish(value))
      } catch {
        result = api.getHAR()
      }
      result?.then(
        value => finish(value),
        error => finish(undefined, error),
      )
    } catch (error) {
      finish(undefined, error)
    }
  })
}
/** Ephemeral bounded capture. No response bodies, persistence, or requests are made here. */
export function createNetworkCapture(
  api: NetworkApi,
  publish: (rows: CapturedRequest[], error: string) => void,
) {
  let rows: CapturedRequest[] = [],
    id = 0,
    generation = 0,
    active = false
  let refreshController: AbortController | undefined
  const trim = () => {
    let bytes = 0
    rows = rows
      .filter(row => {
        bytes += byteLength(JSON.stringify(row))
        return bytes <= 4 * 1024 * 1024
      })
      .slice(0, 200)
  }
  const send = (error = '') => {
    trim()
    publish([...rows], error)
  }
  const append = (entry: unknown) => {
    const row = captureRequest(entry, ++id)
    if (row) rows = [row, ...rows].slice(0, 200)
  }
  const receive = (entry: unknown) => {
    if (active) {
      append(entry)
      send()
    }
  }
  const navigate = () => {
    generation++
    refreshController?.abort()
    rows = []
    send()
  }
  async function refresh() {
    const version = ++generation
    // Preserve arrivals while getHAR is pending; the snapshot must not overwrite them.
    const cutoff = id
    try {
      refreshController?.abort()
      const controller = new AbortController()
      refreshController = controller
      const har = await readNetworkHar(api, controller.signal)
      if (!active || generation !== version) return
      const arrivals = rows.filter(r => r.id > cutoff)
      rows = []
      const entries = Array.isArray(har.entries) ? har.entries : []
      for (const entry of entries.slice(-200)) append(entry)
      // HAR snapshot may already contain an arrival; retain distinct requests, not URL-only dedup.
      const signature = (r: CapturedRequest) =>
        JSON.stringify([
          r.started,
          r.method,
          r.url,
          r.status,
          r.request?.headers.map(h => [h.name, h.value]),
          r.request?.body,
        ])
      const seen = new Map<string, number>()
      for (const row of rows) {
        const key = signature(row)
        seen.set(key, (seen.get(key) || 0) + 1)
      }
      for (const arrival of [...arrivals].reverse()) {
        const key = signature(arrival),
          n = seen.get(key) || 0
        if (n) seen.set(key, n - 1)
        else rows.unshift(arrival)
      }
      rows = rows.slice(0, 200)
      send()
    } catch {
      if (active && generation === version)
        send(
          'DevTools request log could not be read. Try Refresh or reopen DevTools.',
        )
    }
  }
  return {
    start() {
      if (active) return
      active = true
      api.onRequestFinished.addListener(receive)
      api.onNavigated.addListener(navigate)
      void refresh()
    },
    refresh,
    clear() {
      generation++
      refreshController?.abort()
      rows = []
      send()
    },
    dispose() {
      active = false
      generation++
      refreshController?.abort()
      rows = []
      api.onRequestFinished.removeListener(receive)
      api.onNavigated.removeListener(navigate)
    },
  }
}
