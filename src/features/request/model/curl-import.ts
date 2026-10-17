// Isolate the pinned curlconverter 4.11 parser API here: its JSON generator is lossy
// for duplicate form keys, literal JSON whitespace/numbers, and removed headers.
import { Headers as CurlHeaders } from 'curlconverter/dist/src/Headers.js'
import { buildRequests } from 'curlconverter/dist/src/Request.js'
import type { Warnings } from 'curlconverter/dist/src/Warnings.js'
import { parseArgs } from 'curlconverter/dist/src/curl/opts.js'
import type { Word } from 'curlconverter/dist/src/shell/Word.js'
import { tokenize } from 'curlconverter/dist/src/shell/tokenizer.js'
import {
  DEFAULT_REQUEST_TIMEOUT,
  methodAllowsBody,
  prepareRequest,
} from '@/features/request/model/request'
import {
  buildMultipartBody,
  multipartBoundary,
} from '@/features/request/model/request-body'

const supported = new Set([
  'url',
  'request',
  'header',
  'cookie',
  'user',
  'basic',
  'oauth2-bearer',
  'data',
  'data-raw',
  'data-binary',
  'data-urlencode',
  'json',
  'get',
  'head',
  'form',
  'form-string',
  'location',
  'no-location',
  'max-time',
  'user-agent',
  'referer',
  'compressed',
  'globoff',
  'silent',
  'show-error',
])
function literal(word: Word) {
  if (!word.isString())
    throw new Error(
      'Replace shell variables and command substitutions with literal values before importing.',
    )
  return word.toString()
}
function headerValue(value: string) {
  if (/[\r\n\0]/.test(value))
    throw new Error('Header values must not contain line breaks.')
  return value
}
export async function importCurl(command: string) {
  const warnings: Warnings = []
  const commands = await tokenize(command, warnings)
  if (commands.length !== 1)
    throw new Error('Import one cURL command at a time.')
  const [argv, stdin, stdinFile] = commands[0]
  if (literal(argv[0]) !== 'curl')
    throw new Error('Enter a command starting with curl.')
  argv.forEach(literal)
  const [config] = parseArgs(
    argv,
    undefined,
    undefined,
    undefined,
    supported,
    warnings,
  )
  if (config.configs.length !== 1)
    throw new Error('Import one request at a time, without --next.')
  const removed = new CurlHeaders(config.configs[0].header).headers.filter(
    ([, value]) => value === null,
  )
  const requests = buildRequests(config, stdin, stdinFile)
  if (requests.length !== 1 || requests[0].urls.length !== 1)
    throw new Error('Import one request URL at a time.')
  const parsed = requests[0],
    url = parsed.urls[0]
  if (
    parsed.dataReadsFile ||
    url.uploadFile ||
    url.queryReadsFile ||
    parsed.cookieFiles?.length ||
    parsed.stdinFile
  )
    throw new Error(
      'This command reads a local file. Paste the literal request body and headers instead of a file path.',
    )
  const headers: Header[] = [...parsed.headers.headers, ...removed].map(
    ([name, value], index) => ({
      enabled: true,
      name: literal(name),
      value: value === null ? '' : literal(value),
      removeIfEmptyValue: value === null,
      _createdAt: Date.now() * 1000 + index,
    }),
  )
  const has = (name: string) =>
    headers.some(header => header.name.toLowerCase() === name.toLowerCase())
  const add = (name: string, value: string) => {
    if (!has(name))
      headers.push({
        enabled: true,
        name,
        value,
        removeIfEmptyValue: false,
        _createdAt: Date.now() * 1000 + headers.length,
      })
  }
  if (url.auth) {
    if (parsed.authType !== 'basic')
      throw new Error(
        'Import an explicit Authorization header for authentication schemes other than Basic.',
      )
    const [user, password] = url.auth.map(literal)
    const bytes = new TextEncoder().encode(`${user}:${password}`)
    add(
      'Authorization',
      `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`,
    )
  }
  if (parsed.cookies?.length && !has('cookie'))
    add(
      'Cookie',
      parsed.cookies
        .map(([key, value]) => `${literal(key)}=${literal(value)}`)
        .join('; '),
    )
  let content = parsed.data ? literal(parsed.data) : ''
  let enctype =
    headers
      .find(header => header.name.toLowerCase() === 'content-type')
      ?.value.split(';', 1)[0]
      .trim()
      .toLowerCase() || 'application/x-www-form-urlencoded'
  if (!parsed.data && parsed.multipartUploads) {
    const fields = parsed.multipartUploads.map(part => {
      if ('contentFile' in part || part.headerFiles?.length)
        throw new Error(
          'Multipart file contents are required; use a literal multipart request body instead of @file or <file.',
        )
      if (part.encoder)
        throw new Error(
          'Import the encoded multipart body directly for fields with an encoder.',
        )
      return {
        name: literal(part.name),
        content: literal(part.content),
        filename: part.filename ? literal(part.filename) : undefined,
        contentType: part.contentType
          ? headerValue(literal(part.contentType))
          : undefined,
        headers: part.headers?.map(header => headerValue(literal(header))),
      }
    })
    const existing = headers.find(
      header => header.name.toLowerCase() === 'content-type',
    )
    const supplied = existing?.value.match(
      /;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i,
    )
    let boundary = supplied?.[1] ?? supplied?.[2] ?? ''
    if (boundary) {
      multipartBoundary(`--${boundary}\r\n`)
      if (fields.some(field => field.content.includes(boundary)))
        throw new Error('Multipart boundary appears inside a field value.')
    } else {
      do {
        boundary = '----QBar' + crypto.randomUUID().replaceAll('-', '')
      } while (fields.some(field => field.content.includes(boundary)))
    }
    content = buildMultipartBody(fields, boundary)
    if (
      existing &&
      !supplied &&
      /^multipart\/form-data(?:;|$)/i.test(existing.value)
    )
      existing.value += `; boundary=${boundary}`
    else add('Content-Type', `multipart/form-data; boundary=${boundary}`)
    enctype = 'multipart/form-data'
  }
  if (
    !methodAllowsBody(literal(url.method)) &&
    (parsed.data || parsed.multipartUploads)
  )
    throw new Error(
      'Browser GET/HEAD requests have no body. Choose a body-capable method before importing this command.',
    )
  let timeoutMs = DEFAULT_REQUEST_TIMEOUT
  if (parsed.timeout) {
    const seconds = Number(literal(parsed.timeout))
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error('Invalid cURL max-time value.')
    timeoutMs =
      seconds > 0
        ? Math.min(120000, Math.max(100, seconds * 1000))
        : DEFAULT_REQUEST_TIMEOUT
    if (seconds * 1000 !== timeoutMs)
      warnings.push([
        'timeout-range',
        `Timeout was adjusted to ${timeoutMs / 1000} s (supported range: 0.1–120 s).`,
      ])
  }
  if (parsed.followRedirectsTrusted)
    warnings.push([
      'redirect-auth',
      'Browser redirect handling does not forward credentials to unrelated origins.',
    ])
  const request = prepareRequest({
    method: literal(url.method).toUpperCase(),
    url: literal(url.url),
    headers,
    body: { content, enctype },
    followRedirect: parsed.followRedirects ?? false,
    timeoutMs,
  })
  return {
    request,
    warnings: [...new Set(warnings.map(([, message]) => message))],
  }
}
