export type Exchange = {
  request: BrowseRequest
  response?: BrowseResponse
  durationMs?: number
  outcome?: string
  error?: string
  completedAt?: number
  rawMode?: boolean
}
export type DiffLine = { kind: 'same' | 'remove' | 'add'; text: string }
export function lineDiff(
  before: string,
  after: string,
): { lines: DiffLine[]; truncated: boolean } {
  if (
    new TextEncoder().encode(before).byteLength > 256 * 1024 ||
    new TextEncoder().encode(after).byteLength > 256 * 1024
  )
    return { lines: [], truncated: true }
  const a = before.split('\n'),
    b = after.split('\n')
  let start = 0,
    endA = a.length,
    endB = b.length
  const lines: DiffLine[] = []
  while (start < endA && start < endB && a[start] === b[start]) {
    lines.push({ kind: 'same', text: a[start++] })
  }
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const x = a.slice(start, endA),
    y = b.slice(start, endB)
  if (x.length * y.length <= 250000) {
    const dp = Array.from(
      { length: x.length + 1 },
      () => new Uint16Array(y.length + 1),
    )
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        dp[i][j] =
          x[i] === y[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1])
    let i = 0,
      j = 0
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        lines.push({ kind: 'same', text: x[i++] })
        j++
      } else if (
        i < x.length &&
        (j === y.length || dp[i + 1][j] >= dp[i][j + 1])
      )
        lines.push({ kind: 'remove', text: x[i++] })
      else lines.push({ kind: 'add', text: y[j++] })
    }
  } else {
    for (const text of x) lines.push({ kind: 'remove', text })
    for (const text of y) lines.push({ kind: 'add', text })
  }
  for (let i = endA; i < a.length; i++) lines.push({ kind: 'same', text: a[i] })
  return { lines: lines.slice(0, 2000), truncated: lines.length > 2000 }
}
export const cloneExchange = (value: Exchange): Exchange =>
  JSON.parse(JSON.stringify(value))
export function exchangeSections(value: Exchange) {
  const r = value.request,
    s = value.response
  return {
    'Request line': `${r.method} ${r.url}`,
    'Request headers': r.headers
      .filter(h => h.enabled)
      .map(h => `${h.name}: ${h.value}`)
      .join('\n'),
    'Request body': r.body.content,
    'Response status': s
      ? `${s.statusCode} ${s.statusMessage}`
      : '[No response captured]',
    'Response headers': s
      ? s.headers.map(h => `${h.name}: ${h.value}`).join('\n')
      : '[No response captured]',
    'Response body': s
      ? s.bodyUnavailable
        ? '[Response body unavailable]'
        : s.body
      : '[No response captured]',
  }
}
