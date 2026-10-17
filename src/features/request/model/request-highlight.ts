import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
hljs.registerLanguage('json', json)

export const REQUEST_HIGHLIGHT_LIMIT = 256 * 1024
export const escapeRequestText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const token = (kind: string, text: string) =>
  `<span class="request-${kind}">${escapeRequestText(text)}</span>`

/** Presentation only: never parse/stringify or write back the request or body. */
export function highlightRequest(source: string): {
  html: string
  limited: boolean
} {
  // Bound tokenization work while retaining editable text even for large requests.
  if (
    source.length > REQUEST_HIGHLIGHT_LIMIT ||
    new TextEncoder().encode(source).byteLength > REQUEST_HIGHLIGHT_LIMIT ||
    source.split('\n').length > 10000
  ) {
    return { html: escapeRequestText(source), limited: true }
  }
  const separator = /\r?\n\r?\n/.exec(source)
  const head = separator ? source.slice(0, separator.index) : source
  const body = separator
    ? source.slice(separator.index + separator[0].length)
    : ''
  let line = 0
  const header = head.replace(/[^\r\n]+/g, text => {
    if (line++ === 0) {
      const match =
        /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)([ \t]+)(\S+)(?:([ \t]+)(HTTP\/[\d.]*))?([ \t]*)$/.exec(
          text,
        )
      if (match)
        return (
          token('method', match[1]) +
          match[2] +
          token('path', match[3]) +
          (match[4] || '') +
          (match[5] ? token('protocol', match[5]) : '') +
          match[6]
        )
    }
    const match = /^([^\s:]+)(:[ \t]*)(.*)$/.exec(text)
    return match
      ? token('header', match[1]) +
          escapeRequestText(match[2]) +
          token('value', match[3])
      : escapeRequestText(text)
  })
  const isJson =
    /^content-type\s*:[^\r\n]*(?:\/json|\+json)(?:\s*;|\s*$)/im.test(head) ||
    /^\s*(?:\{|\[)/.test(body)
  let rendered = escapeRequestText(body)
  if (isJson && body) {
    try {
      rendered = hljs.highlight(body, {
        language: 'json',
        ignoreIllegals: true,
      }).value
    } catch {
      /* Keep plain escaped text for incomplete input. */
    }
  }
  return { html: header + (separator?.[0] || '') + rendered, limited: false }
}

/** Bounded, display-only gutter; trailing blank lines still get a line number. */
export function requestLineNumbers(source: string): string {
  if (source.length > REQUEST_HIGHLIGHT_LIMIT) return ''
  const count = source.split('\n').length
  if (count > 10000) return ''
  return Array.from({ length: count }, (_, index) => String(index + 1)).join(
    '\n',
  )
}
