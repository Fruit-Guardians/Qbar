import type { Exchange } from '@/features/workbench/model/exchange-diff'
import { comparisonPaths } from '@/features/workbench/model/response-compare'
export const EVIDENCE_KEY = 'qbarEvidenceV1'
export const EVIDENCE_BYTES = 4 * 1024 * 1024
export const EVIDENCE_ENTRY_BYTES = 512 * 1024
export type Evidence = {
  id: string
  createdAt: number
  title: string
  notes: string
  exchange: Exchange
  tags?: string[]
  reproduction?: string
  comparison?: { baseline: Exchange; ignorePaths: string[] }
}
export type EvidenceSnapshot = {
  version: 1
  revision: number
  entries: Evidence[]
}
export type EvidenceAction =
  | { action: 'list' }
  | {
      action: 'save'
      exchange: Exchange
      title: string
      notes: string
      tags?: string[]
      reproduction?: string
      comparison?: Evidence['comparison']
    }
  | {
      action: 'update'
      id: string
      title: string
      notes: string
      tags?: string[]
      reproduction?: string
      expectedRevision?: number
    }
  | { action: 'remove'; id: string; expectedRevision?: number }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const bytes = (v: unknown) =>
  new TextEncoder().encode(JSON.stringify(v)).byteLength
function validExchange(v: Exchange) {
  if (
    !v ||
    typeof v.request?.url !== 'string' ||
    !/^https?:\/\//i.test(v.request.url) ||
    typeof v.request.method !== 'string' ||
    typeof v.request.body?.content !== 'string' ||
    typeof v.request.body.enctype !== 'string' ||
    !Array.isArray(v.request.headers) ||
    v.request.headers.some(
      h => typeof h?.name !== 'string' || typeof h.value !== 'string',
    )
  )
    throw Error('Invalid evidence request.')
  if (
    v.response &&
    (typeof v.response.body !== 'string' ||
      !Number.isFinite(v.response.statusCode) ||
      !Array.isArray(v.response.headers) ||
      v.response.headers.some(
        h => typeof h?.name !== 'string' || typeof h.value !== 'string',
      ))
  )
    throw Error('Invalid evidence response.')
}
function text(v: string, max: number) {
  if (typeof v !== 'string' || v.length > max)
    throw Error('Evidence title or notes exceed the limit.')
  return v
}
function metadata(value: {
  tags?: string[]
  reproduction?: string
  comparison?: Evidence['comparison']
}) {
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) ||
      value.tags.length > 12 ||
      value.tags.some(t => typeof t !== 'string' || t.length > 32))
  )
    throw Error('Evidence tags exceed the limit (12 tags / 32 characters).')
  if (value.reproduction !== undefined) text(value.reproduction, 10000)
  if (value.comparison) {
    validExchange(value.comparison.baseline)
    if (
      !Array.isArray(value.comparison.ignorePaths) ||
      value.comparison.ignorePaths.some(p => typeof p !== 'string')
    )
      throw Error('Invalid comparison paths.')
    comparisonPaths(value.comparison.ignorePaths.join('\n'))
  }
}
/** Background-owned serialized writes. No silent truncation, eviction, or automatic response capture. */
export class EvidenceStore {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(
    private storage: {
      get(keys: object): Promise<Record<string, unknown>>
      set(items: object): Promise<void>
    },
  ) {}
  action(action: EvidenceAction) {
    const input = clone(action)
    const result = this.tail.then(async () => {
      const saved = (await this.storage.get({ [EVIDENCE_KEY]: null }))[
        EVIDENCE_KEY
      ]
      const state = saved
        ? (clone(saved) as EvidenceSnapshot)
        : { version: 1 as const, revision: 0, entries: [] }
      if (
        state.version !== 1 ||
        !Number.isSafeInteger(state.revision) ||
        !Array.isArray(state.entries) ||
        state.entries.length > 50
      )
        throw Error('Evidence data could not be read. Existing data was kept.')
      for (const entry of state.entries) {
        if (typeof entry.id !== 'string' || !Number.isFinite(entry.createdAt))
          throw Error(
            'Evidence data could not be read. Existing data was kept.',
          )
        validExchange(entry.exchange)
        text(entry.title, 120)
        text(entry.notes, 10000)
        metadata(entry)
      }
      if (input.action === 'list') return state
      if (
        (input.action === 'update' || input.action === 'remove') &&
        input.expectedRevision !== undefined &&
        input.expectedRevision !== state.revision
      )
        throw Error(
          'Evidence changed in another panel. Select the entry again before saving or removing it; your notes are still in this editor.',
        )
      if (input.action === 'save') {
        metadata(input)
        validExchange(input.exchange)
        state.entries.unshift({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          title: text(input.title, 120),
          notes: text(input.notes, 10000),
          exchange: input.exchange,
          tags: input.tags || [],
          reproduction: input.reproduction || '',
          comparison: input.comparison,
        })
      } else if (input.action === 'update') {
        metadata(input)
        const entry = state.entries.find(e => e.id === input.id)
        if (!entry)
          throw Error('Evidence entry no longer exists. Refresh the list.')
        entry.title = text(input.title, 120)
        entry.notes = text(input.notes, 10000)
        if (input.tags !== undefined) entry.tags = input.tags
        if (input.reproduction !== undefined)
          entry.reproduction = input.reproduction
      } else if (input.action === 'remove')
        state.entries = state.entries.filter(e => e.id !== input.id)
      else throw Error('Unknown evidence action.')
      if (
        state.entries.length > 50 ||
        bytes(state) > EVIDENCE_BYTES ||
        state.entries.some(e => bytes(e) > EVIDENCE_ENTRY_BYTES)
      )
        throw Error(
          'Evidence storage limit reached (50 entries / 4 MiB / 512 KiB per entry). Export or remove entries first. Nothing was saved.',
        )
      state.revision++
      await this.storage.set({ [EVIDENCE_KEY]: clone(state) })
      return clone(state)
    })
    this.tail = result.catch(() => {})
    return result
  }
}
/** Conservative metadata export: bodies, notes, titles, credentials and all header/query values are omitted. Paths remain visible. */
export function exportEvidence(entry: Evidence, redacted = true) {
  const value = clone(entry)
  if (redacted) {
    const redactUrl = (source: string) => {
      try {
        const u = new URL(source)
        u.username = ''
        u.password = ''
        u.hash = ''
        const p = new URLSearchParams()
        u.searchParams.forEach((_v, k) => p.append(k, '[REDACTED]'))
        u.search = p.toString()
        return u.href
      } catch {
        return '[REDACTED]'
      }
    }
    value.title = '[REDACTED]'
    value.notes = '[REDACTED]'
    value.exchange.request.url = redactUrl(value.exchange.request.url)
    value.exchange.request.body.content = '[OMITTED]'
    value.exchange.request.body.enctype = '[REDACTED]'
    value.exchange.request.headers.forEach(h => {
      h.value = '[REDACTED]'
    })
    value.exchange.error = value.exchange.error ? '[REDACTED]' : undefined
    if (value.exchange.response) {
      value.exchange.response.baseUrl = redactUrl(
        value.exchange.response.baseUrl,
      )
      value.exchange.response.statusMessage = '[REDACTED]'
      value.exchange.response.body = '[OMITTED]'
      value.exchange.response.headers.forEach(h => {
        h.value = '[REDACTED]'
      })
    }
  }
  const source = value.exchange,
    req = source.request,
    res = source.response
  const output: Evidence = redacted
    ? {
        id: value.id,
        createdAt: value.createdAt,
        title: value.title,
        notes: value.notes,
        exchange: {
          request: {
            method: req.method,
            url: req.url,
            body: req.body,
            followRedirect: req.followRedirect === true,
            timeoutMs: req.timeoutMs,
            headers: req.headers.map(h => ({
              name: h.name,
              value: h.value,
              enabled: h.enabled === true,
              removeIfEmptyValue: h.removeIfEmptyValue === true,
              _createdAt: h._createdAt,
            })),
          },
          response: res
            ? {
                protocolVersion: res.protocolVersion,
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                baseUrl: res.baseUrl,
                body: res.body,
                bodyUnavailable: res.bodyUnavailable,
                bodyBytes: res.bodyBytes,
                headers: res.headers.map(h => ({
                  name: h.name,
                  value: h.value,
                })),
              }
            : undefined,
          outcome: source.outcome,
          error: source.error,
          completedAt: source.completedAt,
          durationMs: source.durationMs,
          rawMode: source.rawMode,
        },
      }
    : value
  return JSON.stringify(
    {
      format: 'qbar-evidence',
      version: 1,
      redacted,
      exportedAt: new Date().toISOString(),
      entry: output,
    },
    null,
    2,
  )
}

/** Report is derived from the same conservative export whitelist as JSON. */
export function evidenceReport(entry: Evidence, redacted = true): string {
  const snapshot = exportEvidence(entry, redacted)
  const fence = '`'.repeat(
    Math.max(3, ...(snapshot.match(/`+/g) || []).map(v => v.length + 1)),
  )
  return `# QBar evidence report\n\n${redacted ? 'Redacted metadata report. Bodies, credentials, notes and reproduction details are omitted.' : 'Full local evidence report.'}\n\n${fence}json\n${snapshot}\n${fence}\n`
}
