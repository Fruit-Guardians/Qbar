const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs')
const bundle = require('./helpers/bundle.cjs')
const { highlightRequest, escapeRequestText, REQUEST_HIGHLIGHT_LIMIT } = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/request/model/request-highlight'",
)
const textContent = html =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
test('request highlight distinguishes HTTP method, URL, protocol, duplicate headers and JSON token classes', () => {
  const source =
    'POST /api?q=one&q=two HTTP/1.1\r\nHost: local.test\r\nX-Test: a\r\nX-Test: b\r\nContent-Type: application/json\r\n\r\n{ "id":9007199254740993123,"name":"你好","ok":true,"value":null }'
  const result = highlightRequest(source)
  for (const cls of [
    'request-method',
    'request-path',
    'request-protocol',
    'request-header',
    'request-value',
    'hljs-attr',
    'hljs-number',
    'hljs-string',
    'hljs-literal',
  ])
    assert.match(result.html, new RegExp(cls))
  assert.equal(textContent(result.html), source)
  assert.equal(result.limited, false)
})
test('highlight is presentation only: duplicate keys, exponent spelling, CRLF, tabs, trailing spaces and empty lines are retained', () => {
  for (const source of [
    '',
    'GET / HTTP/1.1\n\n',
    'POST / HTTP/1.1\nContent-Type: application/problem+json; charset=utf-8\n\n{\n\t"id":9007199254740993123,"id":1.230e+99, "x":-0\n}\n\n',
    'GET\t/path\tHTTP/2  \nX-A:\tvalue  \n folded value\n\nplain\n',
  ]) {
    assert.equal(textContent(highlightRequest(source).html), source)
  }
})
test('untrusted request headers, path and HTML body never become executable HTML', () => {
  const source =
    'GET /<img/src=x/onerror=alert(1)> HTTP/1.1\nX-Header: <script>alert(1)</script> & text\nContent-Type: text/html\n\n<img src=x onerror=alert(1)><script>hi</script>'
  const html = highlightRequest(source).html
  assert.doesNotMatch(html, /<(?:img|script)\b/i)
  assert.equal(textContent(html), source)
  assert.equal(escapeRequestText('<>&'), '&lt;&gt;&amp;')
})
test('incomplete and invalid JSON remain editable, and plain bodies are not forced through JSON conversion', () => {
  for (const source of [
    'P',
    'POST /path',
    'POST / HTTP/1.1\nContent-Type: application/json\n\n{"x":',
    'BROKEN REQUEST\nX-Test: foo\n\nnot JSON',
    'POST / HTTP/1.1\nContent-Type: text/plain\n\na=1&a=2',
    'POST / HTTP/1.1\n\n{"text":"</span><img onerror=1>"}',
  ])
    assert.equal(textContent(highlightRequest(source).html), source)
})
test('large requests keep exact escaped text and bypass tokenization at UTF-8 and line count limits', () => {
  for (const source of [
    'x'.repeat(REQUEST_HIGHLIGHT_LIMIT + 1),
    '你'.repeat(90000),
    '<\n'.repeat(10001),
  ]) {
    const result = highlightRequest(source)
    assert.equal(result.limited, true)
    assert.equal(textContent(result.html), source)
    assert.doesNotMatch(result.html, /<span/)
  }
})
test('native textarea remains the focus, selection, IME and undo target with an inert decorative layer', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/features/request/components/RawRequestEditor.vue',
    ),
    'utf8',
  )
  assert.match(
    source,
    /<textarea[\s\S]*?ref="rawRequestInput"[\s\S]*?v-model="rawRequest.content"/,
  )
  assert.match(source, /@compositionstart="composing = true"/)
  assert.match(source, /@scroll="syncScroll"/)
  assert.match(source, /aria-hidden="true"[\s\S]*?v-html="syntax.html"/)
  assert.match(source, /dom.setSelectionRange\(0, 0\)/)
  const css = fs.readFileSync(
    path.join(
      __dirname,
      '../src/features/request/components/request-highlight.scss',
    ),
    'utf8',
  )
  assert.match(css, /pointer-events: none/)
  assert.match(css, /forced-colors/)
  assert.match(css, /is-composing/)
  assert.match(css, /v-theme--dark/)
})

const { requestLineNumbers } = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/request/model/request-highlight'",
)
test('gutter counts empty, CRLF and trailing lines without rewriting source', () => {
  assert.equal(requestLineNumbers(''), '1')
  assert.equal(
    requestLineNumbers('GET / HTTP/1.1\r\nX: a\r\n\r\n'),
    '1\n2\n3\n4',
  )
  assert.equal(requestLineNumbers('你好\n\t{}'), '1\n2')
})
test('gutter bounds allocation for huge requests', () => {
  assert.equal(requestLineNumbers('x'.repeat(REQUEST_HIGHLIGHT_LIMIT + 1)), '')
  assert.equal(requestLineNumbers('\n'.repeat(10000)), '')
  assert.equal(requestLineNumbers('\n'.repeat(9999)).split('\n').length, 10000)
})
