export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

export function multipartBoundary(body: string) {
  const firstLine = body.split(/\r?\n/, 1)[0]
  if (!firstLine.startsWith('--') || firstLine.length <= 2)
    throw new Error('Multipart body must start with a boundary line.')
  const boundary = firstLine.slice(2)
  if (
    !/^[0-9A-Za-z'()+_,\-./:=? ]{1,70}$/.test(boundary) ||
    boundary.endsWith(' ')
  )
    throw new Error('Invalid multipart boundary.')
  return boundary
}

/** Normalize only multipart framing/header lines, never newlines inside part data. */
export function normalizeMultipartBody(body: string, boundary: string) {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marker = new RegExp(`(?:^|\\r?\\n)--${escaped}(--)?(?:\\r?\\n|$)`, 'g')
  const matches = [...body.matchAll(marker)]
  if (matches.length < 2 || matches[0].index !== 0 || !matches.at(-1)![1])
    throw new Error('Multipart body needs a closing boundary line.')
  let output = ''
  for (let i = 0; i < matches.length - 1; i++) {
    const match = matches[i]
    if (match[1]) throw new Error('Unexpected multipart closing boundary.')
    const part = body.slice(
      match.index! + match[0].length,
      matches[i + 1].index,
    )
    const separator = /\r?\n\r?\n/.exec(part)
    if (!separator)
      throw new Error('Multipart part needs headers and a blank line.')
    const headers = part.slice(0, separator.index).replace(/\r?\n/g, '\r\n')
    const content = part.slice(separator.index + separator[0].length)
    output += `--${boundary}\r\n${headers}\r\n\r\n${content}\r\n`
  }
  const last = matches.at(-1)!
  return `${output}--${boundary}--\r\n${body.slice(last.index! + last[0].length)}`
}

export type MultipartField = {
  name: string
  content: string
  filename?: string
  contentType?: string
  headers?: string[]
}
export function buildMultipartBody(fields: MultipartField[], boundary: string) {
  const parameter = (value: string) =>
    value.replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/"/g, '%22')
  let body = ''
  for (const field of fields) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${parameter(field.name)}"`
    if (field.filename !== undefined)
      body += `; filename="${parameter(field.filename)}"`
    body += '\r\n'
    if (field.contentType) body += `Content-Type: ${field.contentType}\r\n`
    for (const header of field.headers ?? []) body += `${header}\r\n`
    body += `\r\n${field.content}\r\n`
  }
  return `${body}--${boundary}--\r\n`
}
