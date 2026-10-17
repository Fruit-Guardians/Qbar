import { prepareRequest } from '@/features/request/model/request'

export const HISTORY_STORAGE_KEY = 'requestHistoryV1'
export const HISTORY_LIMIT = 100
export const HISTORY_BYTE_LIMIT = 2 * 1024 * 1024

export type HistoryStatus =
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'timeout'
  | 'failed'
  | 'interrupted'
export type HistoryEntry = {
  id: string
  createdAt: number
  rawMode: boolean
  request: BrowseRequest
  status: HistoryStatus
  statusCode?: number
  durationMs?: number
  error?: string
}
export type HistorySnapshot = {
  version: 1
  revision: number
  enabled: boolean
  entries: HistoryEntry[]
}
export type HistoryAction =
  | { action: 'list' | 'clear' }
  | { action: 'remove'; id: string }
  | { action: 'recording'; enabled: boolean }
type Storage = {
  get(keys: object): Promise<Record<string, unknown>>
  set(items: object): Promise<void>
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const byteLength = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength
const statuses: HistoryStatus[] = [
  'pending',
  'completed',
  'cancelled',
  'timeout',
  'failed',
  'interrupted',
]

/** A single background instance owns serialized history writes across all panels. */
export class RequestHistory {
  private tail: Promise<unknown> = Promise.resolve()
  private initialized = false

  constructor(private storage: Storage) {}

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.catch(() => {})
    return result
  }

  private async read(): Promise<HistorySnapshot> {
    const values = await this.storage.get({ [HISTORY_STORAGE_KEY]: null })
    const saved = values[HISTORY_STORAGE_KEY]
    if (!saved) return { version: 1, revision: 0, enabled: true, entries: [] }
    if (
      typeof saved !== 'object' ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('entries' in saved) ||
      !Array.isArray(saved.entries)
    )
      throw new Error('History data could not be read. Existing data was kept.')
    const state = saved as HistorySnapshot
    const ids = new Set<string>()
    const entries = state.entries.filter(entry => {
      try {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          !entry.id ||
          ids.has(entry.id) ||
          !Number.isFinite(entry.createdAt) ||
          !Number.isFinite(new Date(entry.createdAt).getTime()) ||
          typeof entry.rawMode !== 'boolean' ||
          !statuses.includes(entry.status)
        )
          return false
        if (
          typeof entry.request?.url !== 'string' ||
          typeof entry.request.method !== 'string' ||
          typeof entry.request.body?.content !== 'string' ||
          typeof entry.request.body.enctype !== 'string' ||
          !Array.isArray(entry.request.headers) ||
          entry.request.headers.some(
            header =>
              !header ||
              typeof header.name !== 'string' ||
              typeof header.value !== 'string',
          )
        )
          return false
        prepareRequest(entry.request)
        ids.add(entry.id)
        return true
      } catch (_) {
        return false
      }
    })
    return clone({
      version: 1,
      revision: Number.isSafeInteger(state.revision) ? state.revision : 0,
      enabled: state.enabled !== false,
      entries: entries.slice(0, HISTORY_LIMIT),
    })
  }

  private async write(state: HistorySnapshot) {
    state.revision++
    while (
      state.entries.length > HISTORY_LIMIT ||
      (state.entries.length && byteLength(state) > HISTORY_BYTE_LIMIT)
    )
      state.entries.pop()
    await this.storage.set({ [HISTORY_STORAGE_KEY]: clone(state) })
    return clone(state)
  }

  private async ready() {
    const state = await this.read()
    if (!this.initialized) {
      // Only a new worker marks previous in-flight entries interrupted, not a reopened panel.
      if (state.entries.some(entry => entry.status === 'pending')) {
        state.entries.forEach(entry => {
          if (entry.status === 'pending') entry.status = 'interrupted'
        })
        await this.write(state)
      }
      this.initialized = true
    }
    return state
  }

  action(action: HistoryAction) {
    return this.serialize(async () => {
      const state = await this.ready()
      switch (action.action) {
        case 'list':
          return state
        case 'clear':
          state.entries = []
          break
        case 'remove':
          state.entries = state.entries.filter(entry => entry.id !== action.id)
          break
        case 'recording':
          if (typeof action.enabled !== 'boolean')
            throw new Error('Invalid history recording preference.')
          state.enabled = action.enabled
          break
        default:
          throw new Error('Unknown history action.')
      }
      return this.write(state)
    })
  }

  begin(id: string, source: BrowseRequest, rawMode: boolean) {
    // Snapshot immediately, before waiting for storage or allowing further editor changes.
    const request = prepareRequest(source)
    return this.serialize(async () => {
      const state = await this.ready()
      if (!state.enabled || state.entries.some(entry => entry.id === id))
        return state
      const entry: HistoryEntry = {
        id,
        createdAt: Date.now(),
        rawMode,
        request,
        status: 'pending',
      }
      if (byteLength(entry) > HISTORY_BYTE_LIMIT - 1024)
        throw new Error(
          'Request exceeds the 2 MB history limit; it was not saved.',
        )
      state.entries.unshift(entry)
      return this.write(state)
    })
  }

  finish(
    id: string,
    result: DevtoolsExecuteMessage | DevtoolsErrorMessage,
    durationMs: number,
  ) {
    const outcome =
      result.type === 'execute'
        ? { status: 'completed' as const, statusCode: result.data?.statusCode }
        : { status: result.code ?? 'failed', error: result.data.slice(0, 2000) }
    return this.serialize(async () => {
      const state = await this.ready()
      const entry = state.entries.find(entry => entry.id === id)
      // Deleting/clearing a running request must not bring it back on completion.
      if (!entry) return state
      entry.status = outcome.status
      entry.durationMs = Math.max(0, Math.round(durationMs))
      if ('statusCode' in outcome) entry.statusCode = outcome.statusCode
      if ('error' in outcome) entry.error = outcome.error
      return this.write(state)
    })
  }
}
