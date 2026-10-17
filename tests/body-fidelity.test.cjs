const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  http = require('node:http'),
  { exec } = require('node:child_process'),
  { promisify } = require('node:util')
const bundle = require('./helpers/bundle.cjs')
const root = path.resolve(__dirname, '..')
let importCurl
test.before(async () => {
  ;({ importCurl } = await require('./helpers/bundle-parser.cjs')(root))
})
const {
  prepareExecutionRequest,
  toCurl,
  FetchRequestExecutor,
  FormProcessor,
  JsonProcessor,
  normalizeMultipartBody,
} = bundle(
  root,
  `
export {prepareExecutionRequest,toCurl} from '@/features/request/model/request.ts';
export {FetchRequestExecutor} from '@/extension/background/executors/fetch-executor.ts';
export {default as FormProcessor} from '@/features/request/processors/form-processor.ts';
export {default as JsonProcessor} from '@/features/request/processors/json-processor.ts';
export {normalizeMultipartBody} from '@/features/request/model/request-body.ts';`,
)
const request = (content, enctype = 'application/json') => ({
  method: 'POST',
  url: 'https://example.test/path?a=1&a=2',
  body: { content, enctype },
  headers: [],
  followRedirect: false,
  timeoutMs: 3500,
})
const header = (req, name) =>
  req.headers.find(h => h.name.toLowerCase() === name.toLowerCase())

test('Basic JSON uses exact-body transport for objects/arrays/primitives without adding fields or trimming', () => {
  for (const body of [
    '{ "n":9007199254740993123, "x": null }\n',
    '{}',
    '[]',
    '[1,2]',
    'true',
    'null',
    '42',
    '"text"',
    'not valid JSON',
  ]) {
    const source = request(body),
      execution = prepareExecutionRequest(source, false)
    assert.equal(execution.rawMode, true)
    assert.equal(execution.request.body.content, body)
    assert.equal(
      header(execution.request, 'content-type').value,
      'application/json',
    )
    assert.equal(source.headers.length, 0)
  }
  assert.throws(() => new JsonProcessor().parse('{}'), /exact-body Raw/)
})
test('ordinary Basic forms retain navigation and correctly parse key-only, duplicate, empty-name and empty body fields', () => {
  const source = request(
    'a&b=2&a=3&=empty&&',
    'application/x-www-form-urlencoded',
  )
  assert.equal(prepareExecutionRequest(source, false).rawMode, false)
  const fields = new FormProcessor().parse(source.body.content).fields
  assert.deepEqual(
    fields.map(({ name, value }) => [name, value]),
    [
      ['a', ''],
      ['b', '2'],
      ['a', '3'],
      ['', 'empty'],
    ],
  )
  assert.deepEqual(new FormProcessor().parse('').fields, [])
})
test('raw form and multipart Basic routing serialize exactly once and leave raw-mode text untouched', () => {
  const raw = request('a=1\n&b=2', 'application/x-www-form-urlencoded (raw)'),
    execution = prepareExecutionRequest(raw, false)
  assert.equal(execution.request.body.content, 'a=1&b=2')
  assert.equal(execution.rawMode, true)
  const multipart = request(
    '--fixture\nContent-Disposition: form-data; name="file"; filename="test.txt"\nContent-Type: text/plain\n\nline1\nline2\n--fixture--\n',
    'multipart/form-data',
  )
  const normalized = prepareExecutionRequest(multipart, false)
  assert.ok(
    normalized.request.body.content.includes(
      '\r\n\r\nline1\nline2\r\n--fixture--\r\n',
    ),
  )
  assert.equal(
    header(normalized.request, 'Content-Type').value,
    'multipart/form-data; boundary="fixture"',
  )
  assert.equal(
    prepareExecutionRequest(multipart, true).request.body.content,
    multipart.body.content,
  )
  assert.throws(
    () => normalizeMultipartBody('--fixture\nmissing close', 'fixture'),
    /closing boundary/,
  )
})
test('cURL import preserves literal JSON numbers/whitespace, query repetitions, content type parameters and options', async () => {
  const body = '{ "n":9007199254740993123, "a":null, "b":[true, false] }\n',
    source = request(body)
  source.followRedirect = true
  source.headers = [
    {
      enabled: true,
      name: 'Content-Type',
      value: 'application/json; charset=utf-8',
      removeIfEmptyValue: false,
      _createdAt: 1,
    },
  ]
  const { request: parsed, warnings } = await importCurl(toCurl(source, true))
  assert.equal(parsed.body.content, body)
  assert.equal(parsed.url, source.url)
  assert.equal(parsed.timeoutMs, 3500)
  assert.equal(parsed.followRedirect, true)
  assert.equal(
    header(parsed, 'content-type').value,
    'application/json; charset=utf-8',
  )
  assert.deepEqual(warnings, [])
})
test('cURL form data keeps repeated keys, encoding and ordering instead of decoding through an object', async () => {
  const body = 'x=1&x=2&q=a%26b%3Dc&space=hello+world&empty=&novalue'
  const { request: parsed } = await importCurl(
    `curl https://example.test --data '${body}'`,
  )
  assert.equal(parsed.body.content, body)
  assert.equal(
    header(parsed, 'Content-Type').value,
    'application/x-www-form-urlencoded',
  )
})
test('cURL empty-header and removal-header semantics survive import/export', async () => {
  const { request: parsed } = await importCurl(
    "curl https://example.test -H 'X-Empty;' -H 'X-Remove:' -H 'Content-Type:' --data-raw 'hello'",
  )
  assert.equal(header(parsed, 'X-Empty').removeIfEmptyValue, false)
  assert.equal(header(parsed, 'X-Remove').removeIfEmptyValue, true)
  assert.equal(header(parsed, 'Content-Type').removeIfEmptyValue, true)
  const restored = (await importCurl(toCurl(parsed, true))).request
  assert.equal(header(restored, 'X-Remove').removeIfEmptyValue, true)
  assert.equal(header(restored, 'X-Empty').removeIfEmptyValue, false)
})
test('cURL Basic authorization/cookies and data-urlencode are imported as explicit request fields', async () => {
  const { request: parsed } = await importCurl(
    "curl https://example.test -u user:password -b 'a=1; b=2' --data-urlencode 'q=a&b=字'",
  )
  assert.equal(
    header(parsed, 'Authorization').value,
    'Basic dXNlcjpwYXNzd29yZA==',
  )
  assert.equal(header(parsed, 'Cookie').value, 'a=1; b=2')
  assert.equal(new URLSearchParams(parsed.body.content).get('q'), 'a&b=字')
})
test('literal multipart form flags preserve duplicate fields, filename and boundary/header pairing', async () => {
  const { request: parsed } = await importCurl(
    "curl https://example.test -H 'Content-Type: multipart/form-data; boundary=chosen' -F a=1 -F a=2 --form-string 'literal=@not-a-file'",
  )
  assert.equal(
    header(parsed, 'Content-Type').value,
    'multipart/form-data; boundary=chosen',
  )
  const form = await new Response(parsed.body.content, {
    headers: { 'Content-Type': header(parsed, 'Content-Type').value },
  }).formData()
  assert.deepEqual(form.getAll('a'), ['1', '2'])
  assert.equal(form.get('literal'), '@not-a-file')
  const copied = (await importCurl(toCurl(parsed, true))).request
  assert.equal(copied.body.content, parsed.body.content)
  assert.equal(
    header(copied, 'Content-Type').value,
    header(parsed, 'Content-Type').value,
  )
})
test('unsupported cURL options produce explicit import notes; timeout adjustments are not silent', async () => {
  const result = await importCurl(
    'curl https://example.test --insecure --max-time 0',
  )
  assert.ok(result.warnings.some(w => w.includes('insecure')))
  assert.ok(result.warnings.some(w => w.includes('Timeout was adjusted')))
  assert.equal(result.request.timeoutMs, 30000)
})
test('multi-URL, dynamic shell, missing file bodies and GET bodies are rejected before replacing the editor', async () => {
  for (const command of [
    'curl https://example.test https://second.test',
    'curl https://example.test --data-binary @missing',
    "curl https://example.test -F 'file=@missing'",
    'curl https://example.test -H "X-Key: $TOKEN"',
    "curl https://example.test -X GET --data 'x=1'",
    'curl https://example.test -X GET --data-raw ""',
  ])
    await assert.rejects(importCurl(command))
})
test('Basic JSON and multipart copy/import/Fetch keep exact bytes and content type over loopback HTTP', async t => {
  const observed = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      observed.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      })
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/echo?x=1&x=2`
  const cases = [
    request(' {"n":9007199254740993123,"text":"quoted \' 字"}\n'),
    request(
      '--wire\nContent-Disposition: form-data; name="a"\n\nfirst\n--wire\nContent-Disposition: form-data; name="a"\n\nsecond\n--wire--\n',
      'multipart/form-data',
    ),
  ]
  for (const source of cases) {
    source.url = url
    const prepared = prepareExecutionRequest(source, false)
    const command = toCurl(source, false)
    const imported = (await importCurl(command)).request
    assert.equal(imported.body.content, prepared.request.body.content)
    await promisify(exec)(command, { shell: '/bin/bash' })
    const result = await new FetchRequestExecutor(1, imported).execute()
    assert.equal(result.type, 'execute')
    const [curl, fetch] = observed.slice(-2)
    assert.equal(curl.body, prepared.request.body.content)
    assert.equal(fetch.body, curl.body)
    assert.equal(fetch.headers['content-type'], curl.headers['content-type'])
    assert.equal(fetch.url, '/echo?x=1&x=2')
  }
})
