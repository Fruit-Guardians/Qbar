/* UI-only adapter. Vite aliases this module in development, never in builds. */
import { EvidenceStore } from '@/features/evidence/model/evidence-store'
import { RequestHistory } from '@/features/history/model/request-history'
const listeners = new Set<(message: any) => void>()
const messages: any[] = []
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const storageKey = 'qbar-ui-preview'
const readStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}')
  } catch (_) {
    return {}
  }
}
const emit = (message: any) => listeners.forEach(listener => listener(message))
type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>
const storageListeners = new Set<
  (changes: StorageChanges, area: string) => void
>()
const publishStorage = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) => {
  const changes: StorageChanges = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      changes[key] = { oldValue: before[key], newValue: after[key] }
  }
  if (Object.keys(changes).length)
    storageListeners.forEach(fn => fn(changes, 'local'))
}
const storageChanged = (event: StorageEvent) => {
  if (event.key !== storageKey) return
  try {
    publishStorage(
      JSON.parse(event.oldValue || '{}'),
      JSON.parse(event.newValue || '{}'),
    )
  } catch {
    /* Ignore malformed preview storage. */
  }
}
const onStorageChanged = {
  addListener(listener: (changes: StorageChanges, area: string) => void) {
    if (!storageListeners.size)
      window.addEventListener?.('storage', storageChanged)
    storageListeners.add(listener)
  },
  removeListener(listener: (changes: StorageChanges, area: string) => void) {
    storageListeners.delete(listener)
    if (!storageListeners.size)
      window.removeEventListener?.('storage', storageChanged)
  },
}
const previewStorage = {
  async get(defaults: object = {}) {
    return { ...defaults, ...readStorage() }
  },
  async set(values: object) {
    const before = readStorage(),
      after = { ...before, ...values }
    localStorage.setItem(storageKey, JSON.stringify(after))
    publishStorage(before, after)
  },
}
const history = new RequestHistory(previewStorage)
const evidence = new EvidenceStore(previewStorage)
const publishHistory = (data: unknown) => emit({ type: 'history', data })
const historyError = (error: unknown) =>
  emit({ type: 'history', error: (error as Error).message })
const request = {
  method: 'GET',
  url: 'https://example.com/api/health?verbose=true',
  body: { content: '', enctype: 'application/x-www-form-urlencoded' },
  headers: [
    {
      enabled: true,
      name: 'Accept',
      value: 'application/json',
      removeIfEmptyValue: false,
      _createdAt: 1,
    },
    {
      enabled: true,
      name: 'X-Request-ID',
      value: 'qbar-preview',
      removeIfEmptyValue: false,
      _createdAt: 2,
    },
  ],
  followRedirect: false,
}
const previewBrowser = {
  storage: {
    local: previewStorage,
    onChanged: onStorageChanged,
  },
  devtools: {
    inspectedWindow: { tabId: 1 },
    network: {
      async getHAR() {
        return {
          entries: [
            {
              startedDateTime: '2026-10-15T00:00:00Z',
              request: {
                method: 'GET',
                url: 'http://127.0.0.1:8891/api/items?tag=one&tag=two&flag&name=%E4%BD%A0%E5%A5%BD',
                headers: [{ name: 'Accept', value: 'application/json' }],
                bodySize: 0,
              },
              response: { status: 200 },
            },
            {
              startedDateTime: '2026-10-15T00:00:01Z',
              request: {
                method: 'POST',
                url: 'http://127.0.0.1:8891/api/items?debug=1',
                headers: [{ name: 'Content-Type', value: 'application/json' }],
                postData: {
                  mimeType: 'application/json',
                  text: '{"id":9007199254740993123,"items":[1,2],"name":"QBar"}',
                },
              },
              response: { status: 201 },
            },
          ],
        }
      },
      onRequestFinished: { addListener() {}, removeListener() {} },
      onNavigated: { addListener() {}, removeListener() {} },
    },
  },
  runtime: {
    connect() {
      return {
        onMessage: {
          addListener(listener: (message: any) => void) {
            listeners.add(listener)
          },
          removeListener(listener: (message: any) => void) {
            listeners.delete(listener)
          },
        },
        onDisconnect: { addListener() {}, removeListener() {} },
        disconnect() {},
        postMessage(message: any) {
          messages.push(JSON.parse(JSON.stringify(message)))
          if (message.type === 'init') {
            queueMicrotask(() => emit({ type: 'ready' }))
          } else if (message.type === 'load') {
            queueMicrotask(() =>
              emit({
                type: 'load',
                loadId: message.loadId,
                source: message.draftOnly ? 'draft' : 'captured',
                reason: message.draftOnly ? 'no-record' : undefined,
                data: message.draftOnly
                  ? { ...structuredClone(request), headers: [] }
                  : structuredClone(request),
              }),
            )
          } else if (message.type === 'execute') {
            const id = message.data.requestId
            history
              .begin(id, message.data.request, message.data.rawMode)
              .then(publishHistory, historyError)
            pending.set(
              id,
              setTimeout(() => {
                pending.delete(id)
                const body = JSON.stringify(
                  {
                    preview: true,
                    message: 'Local UI fixture. No network request was sent.',
                    data: {
                      items: [{ id: 1, name: 'QBar', enabled: true }],
                      count: 1,
                    },
                    method: message.data.request.method,
                    requestUrl: message.data.request.url,
                  },
                  null,
                  2,
                )
                const result = {
                  type: 'execute',
                  requestId: id,
                  durationMs: 750,
                  data: message.data.rawMode
                    ? {
                        protocolVersion: 'HTTP/1.1',
                        statusCode: 200,
                        statusMessage: 'OK',
                        baseUrl: 'https://example.com',
                        headers: [
                          { name: 'Content-Type', value: 'application/json' },
                          { name: 'X-QBar-Preview', value: 'fixture-only' },
                        ],
                        body,
                        durationMs: 750,
                        bodyBytes: new TextEncoder().encode(body).byteLength,
                      }
                    : undefined,
                } as DevtoolsExecuteMessage
                history
                  .finish(id, result, 750)
                  .then(publishHistory, historyError)
                emit(result)
              }, 750),
            )
          } else if (message.type === 'cancel') {
            const id = message.data.requestId
            if (pending.has(id)) {
              clearTimeout(pending.get(id))
              pending.delete(id)
              const result: DevtoolsErrorMessage = {
                type: 'error',
                requestId: id,
                code: 'cancelled',
                data: 'Request cancelled.',
              }
              history.finish(id, result, 0).then(publishHistory, historyError)
              emit(result)
            }
          } else if (message.type === 'evidence') {
            evidence.action(message.data).then(
              data =>
                emit({ type: 'evidence', actionId: message.actionId, data }),
              error =>
                emit({
                  type: 'evidence',
                  actionId: message.actionId,
                  error: (error as Error).message,
                }),
            )
          } else if (message.type === 'history') {
            history.action(message.data).then(publishHistory, historyError)
          }
        },
      }
    },
    getURL(path: string) {
      return path
    },
  },
}
Object.assign(window, { __qbarPreview: { messages } })
export default previewBrowser
