const test = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs'),
  { browser, ruleUpdates } = require('./helpers/browser-mock.cjs')
const { FetchRequestExecutor } = bundle(
  path.resolve(__dirname, '..'),
  "export {FetchRequestExecutor} from '@/extension/background/executors/fetch-executor'",
)
let server,
  origin,
  seen = []
test.before(async () => {
  server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      seen.push({
        url: req.url,
        method: req.method,
        body: Buffer.concat(chunks).toString('utf8'),
        header: req.headers['x-qbar-test'],
      })
      if (req.url.startsWith('/slow')) {
        setTimeout(() => {
          if (!res.destroyed) res.end('late')
        }, 300)
        return
      }
      if (req.url === '/drop') {
        req.socket.destroy()
        return
      }
      res.writeHead(req.url.startsWith('/denied') ? 403 : 201, {
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify(seen.at(-1)))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
test.after(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})
const request = (url, timeoutMs = 1000) => ({
  url: origin + url,
  method: 'POST',
  body: {
    enctype: 'application/json',
    content: ' {"n":9007199254740993123,"name":"你好"}\n',
  },
  headers: [
    {
      enabled: true,
      name: 'X-QBar-Test',
      value: 'p0-local',
      removeIfEmptyValue: false,
      _createdAt: 1,
    },
    {
      enabled: true,
      name: 'Content-Type',
      value: 'application/json',
      removeIfEmptyValue: false,
      _createdAt: 2,
    },
  ],
  followRedirect: false,
  timeoutMs,
})
function assertClean() {
  const removed = new Set(ruleUpdates.flatMap(u => u.removeRuleIds ?? []))
  for (const u of ruleUpdates)
    for (const rule of u.addRules ?? []) assert.ok(removed.has(rule.id))
  for (const e of Object.values(browser.webRequest))
    assert.equal(e.handlers.size, 0)
}
test('production Fetch executor sends exact Unicode/body bytes to real localhost HTTP and preserves 403 as a response', async () => {
  for (const url of ['/ok?x=1&x=2', '/denied']) {
    const source = request(url),
      result = await new FetchRequestExecutor(1, source).execute()
    assert.equal(result.type, 'execute')
    assert.equal(result.data.statusCode, url === '/denied' ? 403 : 201)
    const echoed = JSON.parse(result.data.body)
    assert.equal(echoed.body, source.body.content)
    assert.equal(echoed.method, 'POST')
    assert.equal(echoed.header, 'p0-local')
    assert.equal(echoed.url, url)
    assertClean()
  }
})
test('production Fetch executor distinguishes real socket failure, timeout and explicit cancellation without retries', async () => {
  const dropped = await new FetchRequestExecutor(1, request('/drop')).execute()
  assert.equal(dropped.code, 'failed')
  assertClean()
  const timed = await new FetchRequestExecutor(
    1,
    request('/slow?case=timeout', 100),
  ).execute()
  assert.equal(timed.code, 'timeout')
  assertClean()
  const executor = new FetchRequestExecutor(1, request('/slow?case=cancel')),
    pending = executor.execute()
  await new Promise(resolve => setTimeout(resolve, 30))
  executor.abort()
  const cancelled = await pending
  assert.equal(cancelled.code, 'cancelled')
  assertClean()
  assert.equal(seen.filter(r => r.url === '/slow?case=cancel').length, 1)
})
