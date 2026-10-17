export type QueryRow = {
  id: number
  enabled: boolean
  name: string
  value: string
  raw: string
  originalName: string
  originalValue: string
}
function parts(url: string) {
  const hash = url.indexOf('#'),
    end = hash < 0 ? url.length : hash,
    query = url.indexOf('?')
  const start = query < 0 || query > end ? end : query
  return {
    base: url.slice(0, start),
    hash: url.slice(end),
    query: start < end ? url.slice(start + 1, end) : '',
  }
}
function decode(value: string) {
  return decodeURIComponent(value.replace(/\+/g, ' '))
}
export function readQuery(url: string): QueryRow[] {
  if (url.length > 1024 * 1024)
    throw new Error('URL exceeds the 1 MiB editing limit.')
  const query = parts(url).query
  if (!query) return []
  return query.split('&').map((raw, id) => {
    const equal = raw.indexOf('='),
      name = decode(equal < 0 ? raw : raw.slice(0, equal)),
      value = decode(equal < 0 ? '' : raw.slice(equal + 1))
    return {
      id,
      enabled: true,
      name,
      value,
      raw,
      originalName: name,
      originalValue: value,
    }
  })
}
export function writeQuery(url: string, rows: QueryRow[]) {
  const { base, hash } = parts(url)
  const values = rows
    .filter(r => r.enabled)
    .map(r =>
      r.name === r.originalName && r.value === r.originalValue
        ? r.raw
        : `${encodeURIComponent(r.name)}=${encodeURIComponent(r.value)}`,
    )
  return base + (values.length ? '?' + values.join('&') : '') + hash
}
export function newQueryRow(id: number): QueryRow {
  return {
    id,
    enabled: true,
    name: '',
    value: '',
    raw: '=',
    originalName: '',
    originalValue: '',
  }
}
