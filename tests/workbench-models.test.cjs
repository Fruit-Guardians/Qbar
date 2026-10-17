const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const {
  parseJson,
  printJson,
  jsonPath,
  readQuery,
  writeQuery,
  newQueryRow,
  captureRequest,
  createNetworkCapture,
  lineDiff,
  exchangeSections,
  cloneExchange,
} = bundle(
  path.resolve(__dirname, '..'),
  `
export * from '@/features/workbench/model/json-document'
export * from '@/features/workbench/model/query-params'
export * from '@/features/workbench/model/network-capture'
export * from '@/features/workbench/model/exchange-diff'
`,
)
test('lossless JSON format/minify preserves large integers, exponent spelling, negative zero, duplicate keys and strings', () => {
  const source =
    ' { "id": 9007199254740993123, "id": 1.2300e+99, "a": [-0, true, null, "你好\\n\\\""] } '
  const node = parseJson(source),
    compact = printJson(node, true),
    pretty = printJson(node)
  assert.equal(
    compact,
    '{"id":9007199254740993123,"id":1.2300e+99,"a":[-0,true,null,"你好\\n\\\""]}',
  )
  assert.equal(printJson(parseJson(pretty), true), compact)
  assert.equal(node.children.length, 3)
})
test('JSON scalars, empty objects, unicode keys and paths work without prototype setters', () => {
  for (const source of [
    '0',
    '-1.2E-3',
    'true',
    'false',
    'null',
    '"text"',
    '[]',
    '{}',
    '{"__proto__":1}',
  ])
    assert.equal(printJson(parseJson(source), true), source)
  assert.equal(jsonPath('$', 'a.b"[]', false), '$["a.b\\\"[]"]')
  assert.equal(jsonPath('$["a"]', '2', true), '$["a"][2]')
})
test('JSON invalid syntax is rejected with precise line/column, and tools bound size/depth/node count', () => {
  for (const s of [
    '',
    '01',
    '1.',
    '1e',
    'NaN',
    '[1,]',
    '{"a":}',
    '{"a" 1}',
    '{"a":1,}',
    '"bad\ntext"',
    '"bad\\x"',
    '{}[]',
    '[',
    '{"a":1',
    '"\\uXXXX"',
  ])
    assert.throws(() => parseJson(s), Error, s)
  assert.throws(() => parseJson('{\n"a":\n?}'), /line 3, column 1/)
  assert.throws(() => parseJson('['.repeat(66) + '0' + ']'.repeat(66)), /deep/)
  assert.throws(() => parseJson(' '.repeat(1024 * 1024 + 1)), /1 MiB/)
  assert.throws(
    () => parseJson('[' + Array(10001).fill('0').join(',') + ']'),
    /large/,
  )
})
test('query editing round-trips duplicates, bare flags, blanks, empty segments, plus and escaped bytes without touching the fragment', () => {
  const url =
    'https://x.test/a?x=1&x=2&flag&blank=&a+b=c%20d&&escaped=%2f#keep?x=3'
  const rows = readQuery(url)
  assert.equal(rows[4].name, 'a b')
  assert.equal(rows[4].value, 'c d')
  assert.equal(writeQuery(url, rows), url)
  rows[1].enabled = false
  assert.equal(
    writeQuery(url, rows),
    'https://x.test/a?x=1&flag&blank=&a+b=c%20d&&escaped=%2f#keep?x=3',
  )
  rows[0].value = '你好 &='
  assert.match(writeQuery(url, rows), /x=%E4%BD%A0%E5%A5%BD%20%26%3D&flag/)
  rows[1].enabled = true
  assert.match(writeQuery(url, rows), /&x=2&flag/)
})
test('query add/delete handles no query and fragment, and rejects malformed encoding instead of corrupting it', () => {
  const row = newQueryRow(1)
  row.name = 'hello'
  row.value = 'a+b'
  assert.equal(
    writeQuery('https://x/#frag', [row]),
    'https://x/?hello=a%2Bb#frag',
  )
  assert.equal(writeQuery('https://x/?a=1#frag', []), 'https://x/#frag')
  assert.deepEqual(readQuery('https://x/#fragment?a=1'), [])
  assert.throws(() => readQuery('https://x/?a=%FF'))
  assert.throws(() => readQuery('https://x/?%oops'))
})
const har = (url = 'http://127.0.0.1/api', method = 'GET', postData) => ({
  startedDateTime: '2026-10-15T00:00:00Z',
  request: {
    url,
    method,
    headers: [
      { name: 'X-Test', value: 'a' },
      { name: 'X-Test', value: 'b' },
    ],
    ...(postData ? { postData } : {}),
    bodySize:
      method === 'GET'
        ? 0
        : typeof postData?.text === 'string'
          ? Buffer.byteLength(postData.text)
          : 99,
  },
  response: { status: 200 },
})
test('HAR capture keeps exact bodies / duplicates and does not invoke response getContent', () => {
  const e = har(undefined, 'POST', {
    mimeType: 'application/json',
    text: '{ "n":9007199254740993123 }',
  })
  e.getContent = () => {
    throw Error('must not call')
  }
  const row = captureRequest(e, 1)
  assert.equal(row.error, '')
  assert.equal(row.request.body.content, '{ "n":9007199254740993123 }')
  assert.equal(row.request.headers.filter(h => h.name === 'X-Test').length, 2)
  assert.equal(row.request.headers.at(-1).name, 'Content-Type')
  assert.equal(captureRequest(har('chrome://extensions/'), 2), null)
  assert.equal(captureRequest({}, 2), null)
})
test('HAR missing, file/params-only, encoded and oversized bodies are never silently reconstructed', () => {
  for (const post of [
    undefined,
    {
      mimeType: 'multipart/form-data',
      params: [{ name: 'file', fileName: 'x' }],
    },
    { text: 'AA', encoding: 'base64' },
  ]) {
    const row = captureRequest(har(undefined, 'POST', post), 1)
    assert.ok(row.error)
    assert.equal(row.request, undefined)
  }
  const empty = har(undefined, 'POST')
  empty.request.bodySize = 0
  assert.equal(captureRequest(empty, 1).request.body.content, '')
  assert.match(
    captureRequest(har(undefined, 'POST', { text: 'x'.repeat(512 * 1024) }), 1)
      .error,
    /limit/,
  )
})
const event = () => ({
  handlers: new Set(),
  addListener(fn) {
    this.handlers.add(fn)
  },
  removeListener(fn) {
    this.handlers.delete(fn)
  },
  emit(value) {
    for (const fn of this.handlers) fn(value)
  },
})
const flush = () => new Promise(r => setImmediate(r))
function network(getHAR) {
  const api = { getHAR, onRequestFinished: event(), onNavigated: event() },
    updates = []
  const c = createNetworkCapture(api, (rows, error) =>
    updates.push({ rows, error }),
  )
  return { api, c, updates }
}
test('network snapshot + stream preserves repeated URLs, deduplicates overlapping arrivals and releases listeners', async () => {
  let resolve
  const f = network(() => new Promise(r => (resolve = r)))
  f.c.start()
  f.c.start()
  const e = har()
  f.api.onRequestFinished.emit(e)
  resolve({ entries: [e, e] })
  await flush()
  assert.equal(f.updates.at(-1).rows.length, 2)
  assert.equal(f.api.onRequestFinished.handlers.size, 1)
  f.c.dispose()
  assert.equal(f.api.onRequestFinished.handlers.size, 0)
  assert.equal(f.api.onNavigated.handlers.size, 0)
})
test('navigation, clear and dispose invalidate pending HAR reads; incoming later requests survive stale snapshots', async () => {
  for (const action of ['navigation', 'clear', 'dispose']) {
    let resolve
    const f = network(() => new Promise(r => (resolve = r)))
    f.c.start()
    if (action === 'navigation') f.api.onNavigated.emit('http://new.test/')
    else f.c[action]()
    f.api.onRequestFinished.emit(har('http://new.test/after'))
    resolve({ entries: [har('http://old.test/before')] })
    await flush()
    assert.ok(!f.updates.some(u => u.rows.some(r => r.url.includes('before'))))
    if (action !== 'dispose')
      assert.equal(f.updates.at(-1).rows[0].url, 'http://new.test/after')
    f.c.dispose()
  }
})
test('overlapping refreshes use latest generation, errors surface, logs are capped at 200 / 4 MiB', async () => {
  const pending = []
  const f = network(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  )
  f.c.start()
  const refresh = f.c.refresh()
  pending[1].resolve({ entries: [har('http://new.test/')] })
  await refresh
  pending[0].resolve({ entries: [har('http://old.test/')] })
  await flush()
  assert.equal(f.updates.at(-1).rows[0].url, 'http://new.test/')
  const bad = f.c.refresh()
  pending[2].reject(Error('private implementation error'))
  await bad
  assert.match(f.updates.at(-1).error, /could not be read/)
  for (let i = 0; i < 205; i++)
    f.api.onRequestFinished.emit(har(`http://x.test/${i}`))
  assert.equal(f.updates.at(-1).rows.length, 200)
  for (let i = 0; i < 20; i++)
    f.api.onRequestFinished.emit(
      har(`http://x.test/big${i}`, 'POST', { text: 'a'.repeat(400000) }),
    )
  assert.ok(
    JSON.stringify(f.updates.at(-1).rows).length <= 4 * 1024 * 1024 + 200,
  )
  f.c.dispose()
})
test('line diffs represent unchanged / added / removed lines and reconstruct both inputs', () => {
  for (const [a, b] of [
    ['a\nb\nc', 'a\nx\nc'],
    ['', 'x'],
    ['x\n', 'x'],
    ['same', 'same'],
    ['a\r\nb', 'a\nb'],
  ]) {
    const d = lineDiff(a, b)
    assert.equal(d.truncated, false)
    assert.equal(
      d.lines
        .filter(l => l.kind !== 'add')
        .map(l => l.text)
        .join('\n'),
      a,
    )
    assert.equal(
      d.lines
        .filter(l => l.kind !== 'remove')
        .map(l => l.text)
        .join('\n'),
      b,
    )
  }
})
test('diff work is bounded for large line counts, coarse fallback, or oversized text', () => {
  const a = Array.from({ length: 600 }, (_, i) => `a${i}`).join('\n'),
    b = Array.from({ length: 600 }, (_, i) => `b${i}`).join('\n')
  assert.equal(lineDiff(a, b).lines.length, 1200)
  assert.equal(lineDiff('x'.repeat(256 * 1024 + 1), '').truncated, true)
  assert.equal(
    lineDiff('a\n'.repeat(5000), 'b\n'.repeat(5000)).lines.length,
    2000,
  )
})
test('exchange snapshots isolate mutation and compare status, ordered duplicate headers and unavailable response states', () => {
  const request = captureRequest(har(), 1).request
  const exchange = {
    request,
    response: {
      statusCode: 200,
      statusMessage: 'OK',
      headers: [
        { name: 'Set-Cookie', value: 'a' },
        { name: 'Set-Cookie', value: 'b' },
      ],
      body: '{"n":9007199254740993123}',
    },
  }
  const frozen = cloneExchange(exchange)
  request.url = 'http://edited/'
  assert.notEqual(frozen.request.url, request.url)
  const sections = exchangeSections(frozen)
  assert.equal(sections['Response status'], '200 OK')
  assert.equal(sections['Response headers'], 'Set-Cookie: a\nSet-Cookie: b')
  assert.equal(sections['Response body'], '{"n":9007199254740993123}')
  assert.match(exchangeSections({ request })['Response body'], /No response/)
  assert.match(
    exchangeSections({
      request,
      response: { ...exchange.response, bodyUnavailable: true },
    })['Response body'],
    /unavailable/,
  )
})

test('HAR body length mismatch, empty hidden payload and file placeholders cannot be loaded as complete requests', () => {
  for (const entry of [
    har(undefined, 'POST', { text: '' }),
    har(undefined, 'POST', { text: 'partial' }),
    har(undefined, 'POST', {
      text: 'file placeholder',
      params: [{ name: 'upload', fileName: 'file.bin' }],
    }),
  ]) {
    entry.request.bodySize = 100
    const row = captureRequest(entry, 1)
    assert.equal(row.request, undefined)
    assert.ok(row.error)
  }
  const unicode = har(undefined, 'POST', { text: '你好' })
  assert.equal(captureRequest(unicode, 1).request.body.content, '你好')
})

test('JSON, capture and diff size limits count UTF-8 bytes rather than UTF-16 characters', () => {
  assert.throws(() => parseJson('"' + '你'.repeat(350000) + '"'), /1 MiB/)
  assert.equal(
    captureRequest(har(undefined, 'POST', { text: '你'.repeat(180000) }), 1)
      .request,
    undefined,
  )
  assert.equal(lineDiff('你'.repeat(90000), '').truncated, true)
})
