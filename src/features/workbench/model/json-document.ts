export type JsonNode = {
  kind: 'object' | 'array' | 'value'
  start: number
  end: number
  raw?: string
  children: { key: string; node: JsonNode }[]
}
export class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    source: string,
  ) {
    const lines = source.slice(0, offset).split('\n')
    super(
      `${message} at line ${lines.length}, column ${lines.at(-1)!.length + 1} (offset ${offset}).`,
    )
  }
}
/** A token-preserving JSON parser: numbers and duplicate object members never round-trip through JS values. */
export function parseJson(source: string): JsonNode {
  if (new TextEncoder().encode(source).byteLength > 1024 * 1024)
    throw new Error('JSON exceeds the 1 MiB tool limit.')
  let pos = 0,
    count = 0
  const fail = (message: string): never => {
    throw new JsonSyntaxError(message, pos, source)
  }
  const space = () => {
    while (/[\t\r\n ]/.test(source[pos] || 'x')) pos++
  }
  const string = () => {
    const start = pos++
    while (pos < source.length) {
      const c = source[pos++]
      if (c === '"') {
        const raw = source.slice(start, pos)
        try {
          JSON.parse(raw)
        } catch {
          fail('Invalid JSON string')
        }
        return raw
      }
      if (c === '\\') pos++
    }
    return fail('Unterminated string')
  }
  function value(depth: number): JsonNode {
    space()
    if (++count > 10000 || depth > 64)
      fail('JSON tree is too large or deeply nested')
    const start = pos,
      c = source[pos]
    const children: JsonNode['children'] = []
    if (c === '{' || c === '[') {
      pos++
      space()
      const close = c === '{' ? '}' : ']'
      if (source[pos] !== close) {
        while (pos <= source.length) {
          space()
          let key = String(children.length)
          if (c === '{') {
            if (source[pos] !== '"') fail('Expected an object key')
            key = JSON.parse(string()) as string
            space()
            if (source[pos++] !== ':') fail('Expected a colon')
          }
          children.push({ key, node: value(depth + 1) })
          space()
          if (source[pos] === close) break
          if (source[pos++] !== ',') fail('Expected a comma or closing bracket')
        }
      }
      pos++
      return { kind: c === '{' ? 'object' : 'array', start, end: pos, children }
    }
    if (c === '"') string()
    else {
      const match =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          source.slice(pos),
        )
      if (!match) fail('Expected a JSON value')
      pos += match![0].length
    }
    return {
      kind: 'value',
      start,
      end: pos,
      raw: source.slice(start, pos),
      children,
    }
  }
  const root = value(0)
  space()
  if (pos !== source.length) fail('Unexpected trailing content')
  return root
}
export function printJson(node: JsonNode, compact = false, depth = 0): string {
  if (node.kind === 'value') return node.raw!
  const [open, close] = node.kind === 'object' ? ['{', '}'] : ['[', ']']
  const entries = node.children.map(
    ({ key, node: child }) =>
      (node.kind === 'object'
        ? `${JSON.stringify(key)}:${compact ? '' : ' '}`
        : '') + printJson(child, compact, depth + 1),
  )
  if (!entries.length) return open + close
  return compact
    ? open + entries.join(',') + close
    : `${open}\n${entries.map(v => '  '.repeat(depth + 1) + v).join(',\n')}\n${'  '.repeat(depth)}${close}`
}
export const jsonPath = (parent: string, key: string, array: boolean) =>
  array ? `${parent}[${key}]` : `${parent}[${JSON.stringify(key)}]`
