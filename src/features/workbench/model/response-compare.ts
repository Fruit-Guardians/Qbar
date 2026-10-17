import { type JsonNode, parseJson, printJson } from './json-document'
export function comparisonPaths(input: string): string[] {
  const paths = input
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(Boolean)
  if (
    paths.length > 50 ||
    paths.some(
      p => !p.startsWith('/') || p.length > 250 || /~(?![01])/u.test(p),
    )
  )
    throw Error(
      'Use at most 50 exact JSON Pointer paths, for example /timestamp.',
    )
  return [...new Set(paths)]
}
function projection(
  node: JsonNode,
  paths: Set<string>,
  pointer = '',
): JsonNode {
  if (node.kind === 'value') return node
  const children = node.children
    .filter(
      ({ key }) =>
        node.kind === 'array' ||
        !paths.has(
          pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'),
        ),
    )
    .map(({ key, node: child }) => {
      const p = pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1')
      return {
        key,
        node: paths.has(p)
          ? {
              kind: 'value' as const,
              start: 0,
              end: 0,
              raw: '"[IGNORED]"',
              children: [],
            }
          : projection(child, paths, p),
      }
    })
  if (node.kind === 'object')
    children.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { ...node, children }
}
export function compareBodies(before: string, after: string, ignore: string[]) {
  try {
    const paths = new Set(ignore)
    return {
      before: printJson(projection(parseJson(before), paths)),
      after: printJson(projection(parseJson(after), paths)),
      json: true,
    }
  } catch {
    return { before, after, json: false }
  }
}
