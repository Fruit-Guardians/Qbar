const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const http = require('node:http')
const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const bundle = require('./helpers/bundle.cjs')
const {
  browser,
  listeners,
  ruleUpdates,
  values,
} = require('./helpers/browser-mock.cjs')
const root = path.resolve(__dirname, '..')
const originalFetch = global.fetch
const originalRuleUpdate = browser.declarativeNetRequest.updateSessionRules
global.__testGlob = () =>
  Object.fromEntries(
    ['application/x-www-form-urlencoded', 'application/json'].map(name => [
      name,
      class {
        getName() {
          return name
        }
        getFormEnctype() {
          return name === 'application/json' ? 'text/plain' : name
        }
        getHttpContentType() {
          return name
        }
      },
    ]),
  )
const {
  FetchRequestExecutor,
  NavigationRequestExecutor,
  RequestQueue,
  prepareRequest,
  toCurl,
  store,
} = bundle(
  root,
  `
export {FetchRequestExecutor} from '@/extension/background/executors/fetch-executor.ts';
export {NavigationRequestExecutor} from '@/extension/background/executors/navigation-executor.ts';
export {RequestQueue} from '@/extension/background/request-queue.ts';
export {prepareRequest,toCurl} from '@/features/request/model/request.ts';
export {default as store} from '@/extension/background/session-store.ts';`,
)
const request = (extra = {}) => ({
  method: 'GET',
  url: 'http://fixture.test/echo',
  body: { content: '', enctype: 'application/x-www-form-urlencoded' },
  headers: [],
  followRedirect: false,
  timeoutMs: 1000,
  ...extra,
})
const header = (name, value, removeIfEmptyValue = false) => ({
  enabled: true,
  name,
  value,
  removeIfEmptyValue,
  _createdAt: 1,
})
const assertClean = () => {
  for (const [name, e] of Object.entries(listeners))
    assert.equal(e.handlers.size, 0, `leaked ${name}`)
  assert.ok(
    ruleUpdates.some(r => r.removeRuleIds?.length && !r.addRules),
    'rule not removed',
  )
}
test.beforeEach(() => {
  global.fetch = originalFetch
  browser.declarativeNetRequest.updateSessionRules = originalRuleUpdate
  ruleUpdates.length = 0
  for (const e of Object.values(listeners)) e.handlers.clear()
  browser.scripting.executeScript = async () => []
  browser.tabs.sendMessage = async () => null
  browser.tabs.get = async () => ({
    url: 'http://fixture.test/echo',
    status: 'complete',
  })
})
test.after(() => {
  global.fetch = originalFetch
})

test('HEAD cURL reads headers without expecting a response body', () => {
  const command = toCurl(request({ method: 'HEAD' }))
  assert.ok(command.includes('--head'))
  assert.ok(!command.includes('--data-raw'))
})

test('missing webRequest metadata falls back without waiting forever', async () => {
  global.fetch = async () =>
    new Response('hello', { status: 200, headers: { 'X-Test': 'fallback' } })
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.type, 'execute')
  assert.equal(result.data.body, 'hello')
  assert.equal(result.data.statusCode, 200)
  assert.equal(result.data.bodyBytes, 5)
  assert.ok(result.durationMs >= 0)
  assertClean()
})
test('captured response ignores unrelated extension traffic', async () => {
  global.fetch = async (url, init) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'ours',
      url,
      method: init.method,
      initiator: 'chrome-extension://fixture',
      tabId: -1,
    })
    browser.webRequest.onHeadersReceived.emit({
      requestId: 'other',
      url: 'http://other.test',
      statusLine: 'HTTP/1.1 500 Error',
      statusCode: 500,
      responseHeaders: [],
    })
    browser.webRequest.onHeadersReceived.emit({
      requestId: 'ours',
      url,
      statusLine: 'HTTP/2 201 Created',
      statusCode: 201,
      responseHeaders: [{ name: 'X-Test', value: 'ours' }],
    })
    return new Response('你好', { status: 201 })
  }
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.data.statusCode, 201)
  assert.equal(result.data.protocolVersion, 'HTTP/2')
  assert.equal(result.data.bodyBytes, 6)
  assert.equal(result.data.baseUrl, 'http://fixture.test/echo')
  assertClean()
})
test('Raw header rule is URL scoped', async () => {
  const executor = new FetchRequestExecutor(
    1,
    request({ url: 'http://fixture.test/a?x=1' }),
  )
  const condition = executor.getModifyHeaderCondition(),
    regex = new RegExp(condition.regexFilter)
  assert.ok(regex.test('http://fixture.test/a?x=1'))
  assert.ok(!regex.test('http://fixture.test/b?x=1'))
  assert.deepEqual(condition.initiatorDomains, ['fixture'])
})
test('Raw network rejection clears rules and listeners', async () => {
  global.fetch = async () => {
    throw new Error('Network fixture failure')
  }
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.type, 'error')
  assert.match(result.data, /Network fixture failure/)
  assertClean()
})
test('timeout aborts the fetch and clears request resources', async () => {
  let signal
  global.fetch = async (_, init) => {
    signal = init.signal
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    )
  }
  const result = await new FetchRequestExecutor(
    1,
    request({ timeoutMs: 100 }),
  ).execute()
  assert.equal(result.code, 'timeout')
  assert.equal(signal.aborted, true)
  assertClean()
})
test('cancel aborts the fetch and clears request resources', async () => {
  let begin
  const started = new Promise(r => (begin = r))
  global.fetch = async (_, init) => {
    begin()
    return new Promise((_, reject) =>
      init.signal.addEventListener('abort', () => reject(init.signal.reason), {
        once: true,
      }),
    )
  }
  const executor = new FetchRequestExecutor(1, request()),
    pending = executor.execute()
  await started
  executor.abort()
  const result = await pending
  assert.equal(result.code, 'cancelled')
  assertClean()
})
test('header API failure is reported and still attempts cleanup', async () => {
  browser.declarativeNetRequest.updateSessionRules = async update => {
    ruleUpdates.push(update)
    if (update.addRules) throw new Error('DNR fixture failure')
  }
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.type, 'error')
  assert.match(result.data, /DNR fixture/)
  assertClean()
})
test('cleanup API failure is surfaced rather than silently passing', async () => {
  global.fetch = async () => new Response('ok')
  browser.declarativeNetRequest.updateSessionRules = async update => {
    ruleUpdates.push(update)
    if (!update.addRules) throw new Error('cleanup fixture failure')
  }
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.type, 'error')
  assert.match(result.data, /cleanup failed/)
  assert.ok([...Object.values(listeners)].every(e => e.handlers.size === 0))
})
test('queue prevents Raw rule overlap and cancelled waiters do not bypass holder', async () => {
  const queue = new RequestQueue(),
    a = new AbortController(),
    b = new AbortController(),
    c = new AbortController(),
    order = []
  let release, started
  const began = new Promise(r => (started = r))
  const p1 = queue.run(async () => {
    order.push('a')
    started()
    await new Promise(r => (release = r))
    order.push('a-end')
  }, a.signal)
  await began
  const p2 = queue.run(async () => order.push('b'), b.signal).catch(e => e.name)
  const p3 = queue.run(async () => order.push('c'), c.signal)
  b.abort()
  assert.equal(await p2, 'AbortError')
  assert.deepEqual(order, ['a'])
  release()
  await Promise.all([p1, p3])
  assert.deepEqual(order, ['a', 'a-end', 'c'])
})
test('Frame completes only for its own tab and request ID', async () => {
  browser.tabs.update = async (_, info) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'frame',
      tabId: 7,
      url: info.url,
      method: 'GET',
    })
    browser.webRequest.onCompleted.emit({ requestId: 'frame', tabId: 99 })
    browser.webRequest.onCompleted.emit({ requestId: 'other', tabId: 7 })
    setTimeout(
      () =>
        browser.webRequest.onCompleted.emit({ requestId: 'frame', tabId: 7 }),
      10,
    )
  }
  const result = await new NavigationRequestExecutor(7, request()).execute()
  assert.equal(result.type, 'execute')
  assertClean()
})
test('Frame errors terminate the request and cleanup resources', async () => {
  browser.tabs.update = async (_, info) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'frame',
      tabId: 7,
      url: info.url,
      method: 'GET',
    })
    browser.webRequest.onErrorOccurred.emit({
      requestId: 'frame',
      tabId: 7,
      error: 'net::ERR_CONNECTION_REFUSED',
    })
  }
  const result = await new NavigationRequestExecutor(7, request()).execute()
  assert.equal(result.type, 'error')
  assert.match(result.data, /ERR_CONNECTION_REFUSED/)
  assertClean()
})
test('Frame timeout is bounded and stops only its matching navigation', async () => {
  browser.tabs.update = async (_, info) =>
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'frame',
      tabId: 7,
      url: info.url,
      method: 'GET',
    })
  let stopped = false
  browser.scripting.executeScript = async info => {
    if (info.func) stopped = true
    return []
  }
  const result = await new NavigationRequestExecutor(
    7,
    request({ timeoutMs: 100 }),
  ).execute()
  assert.equal(result.code, 'timeout')
  assert.equal(stopped, true)
  assertClean()
})
test('Frame rejects methods it would otherwise turn into POST', () => {
  assert.throws(
    () => new NavigationRequestExecutor(7, request({ method: 'PUT' })),
    /Use Raw mode/,
  )
})
test('request validation preserves source, normalizes split URL and ignores latent GET body', () => {
  const input = request({
    url: 'http://fixture.test/echo\n?x=1',
    body: { content: 'old POST body', enctype: 'application/json' },
  })
  const normalized = prepareRequest(input)
  assert.equal(normalized.url, 'http://fixture.test/echo?x=1')
  assert.equal(normalized.body.content, '')
  assert.equal(input.body.content, 'old POST body')
  assert.throws(
    () => prepareRequest(request({ url: 'file:///tmp/a' })),
    /HTTP or HTTPS/,
  )
  assert.throws(
    () => prepareRequest(request({ headers: [header('bad name', 'x')] })),
    /Invalid header name/,
  )
  assert.throws(
    () => prepareRequest(request({ headers: [header('X-A', 'line\nbreak')] })),
    /line break/,
  )
})
test('session sync preserves unrelated keys and monotonic rule IDs without records', async () => {
  values.historyFixture = 'keep'
  const first = await store.allocateRuleId(),
    second = await store.allocateRuleId()
  assert.equal(second, first + 1)
  assert.equal(values.historyFixture, 'keep')
  assert.equal(values.ruleId, second + 1)
})
test('cURL export quotes shell metacharacters and distinguishes empty/removal headers', () => {
  const command = toCurl(
    request({
      method: 'POST',
      body: {
        content: "a='quote'&b=$HOME",
        enctype: 'application/x-www-form-urlencoded',
      },
      headers: [header('X-Empty', ''), header('X-Remove', '', true)],
      followRedirect: true,
    }),
  )
  assert.match(command, /--location/)
  assert.match(command, /X-Empty;/)
  assert.match(command, /X-Remove:/)
  assert.match(command, /'"'"'/)
  assert.match(command, /\$HOME/)
})
test('real loopback HTTP sends body and returns response even without browser metadata', async () => {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        }),
      )
    })
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/echo?q=1`
  try {
    const input = request({
      method: 'DELETE',
      url,
      body: {
        content: 'hello=你好',
        enctype: 'application/x-www-form-urlencoded',
      },
      headers: [
        header('Content-Type', 'application/x-www-form-urlencoded'),
        header('X-Test', 'engine'),
      ],
    })
    const result = await new FetchRequestExecutor(1, input).execute(),
      echo = JSON.parse(result.data.body)
    assert.equal(echo.method, 'DELETE')
    assert.equal(echo.body, 'hello=你好')
    assert.equal(echo.headers['x-test'], 'engine')
    assert.equal(result.data.statusCode, 200)
    assertClean()
    const payload = "a='quote'&b=$HOME&c=你好"
    const command = toCurl({
      ...input,
      method: 'POST',
      body: { ...input.body, content: payload },
    })
    const { stdout } = await promisify(exec)(command, {
      timeout: 5000,
      maxBuffer: 65536,
      shell: '/bin/bash',
    })
    assert.equal(JSON.parse(stdout).body, payload)
  } finally {
    await new Promise(r => server.close(r))
  }
})

test('manual redirect displays captured status without claiming placeholder bytes', async () => {
  global.fetch = async (url, init) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'redirect',
      url,
      method: init.method,
      initiator: 'chrome-extension://fixture',
    })
    browser.webRequest.onBeforeRedirect.emit({
      requestId: 'redirect',
      url,
      statusLine: 'HTTP/1.1 302 Found',
      statusCode: 302,
      responseHeaders: [{ name: 'Location', value: '/next' }],
    })
    const response = new Response('')
    Object.defineProperty(response, 'type', { value: 'opaqueredirect' })
    return response
  }
  const result = await new FetchRequestExecutor(1, request()).execute()
  assert.equal(result.data.statusCode, 302)
  assert.equal(result.data.bodyUnavailable, true)
  assert.equal(result.data.bodyBytes, 0)
  assertClean()
})
test('Frame cancel does not stop an unrelated navigation in the same tab', async () => {
  let started
  const began = new Promise(r => (started = r))
  browser.tabs.update = async (_, info) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'frame',
      tabId: 7,
      url: info.url,
      method: 'GET',
    })
    started()
  }
  browser.tabs.get = async () => ({
    url: 'http://other.test/',
    status: 'loading',
  })
  let stopped = false
  browser.scripting.executeScript = async info => {
    if (info.func) stopped = true
    return []
  }
  const executor = new NavigationRequestExecutor(7, request()),
    pending = executor.execute()
  await began
  executor.abort()
  const result = await pending
  assert.equal(result.code, 'cancelled')
  assert.equal(stopped, false)
  assertClean()
})
test('queued Raw request times out without issuing a second fetch', async () => {
  let started,
    release,
    calls = 0
  const began = new Promise(r => (started = r))
  global.fetch = async () => {
    calls++
    started()
    return new Promise(r => (release = () => r(new Response('done'))))
  }
  const first = new FetchRequestExecutor(1, request()).execute()
  await began
  const second = await new FetchRequestExecutor(
    2,
    request({ timeoutMs: 100 }),
  ).execute()
  assert.equal(second.code, 'timeout')
  assert.equal(calls, 1)
  release()
  await first
  assertClean()
})

test('cURL export matches implicit Raw text content type and Basic form choice', () => {
  const source = request({
    method: 'POST',
    body: { enctype: 'application/json', content: '{"ok":true}' },
  })
  assert.ok(
    toCurl(source, true).includes(
      "--header 'Content-Type: text/plain;charset=UTF-8'",
    ),
  )
  assert.ok(
    toCurl(source, false).includes("--header 'Content-Type: application/json'"),
  )
  source.body = {
    enctype: 'application/x-www-form-urlencoded',
    content: 'a=1\n&b=2',
  }
  assert.ok(toCurl(source, false).includes("--data-raw 'a=1&b=2'"))
  source.headers = [header('Content-Type', '', true)]
  const command = toCurl(source, true)
  assert.ok(command.includes("--header 'Content-Type:'"))
  assert.ok(!command.includes('text/plain'))
})

test('Basic multipart cURL uses exact-body routing and preserves boundary framing', () => {
  const source = request({
    method: 'POST',
    body: {
      enctype: 'multipart/form-data',
      content:
        '--fixture-boundary\r\nContent-Disposition: form-data; name="hello"\r\n\r\nworld\r\n--fixture-boundary--\r\n',
    },
  })
  const command = toCurl(source, false)
  assert.ok(!command.includes('--location'))
  assert.ok(
    command.includes(
      'Content-Type: multipart/form-data; boundary="fixture-boundary"',
    ),
  )
  assert.ok(command.includes(source.body.content))
})

test('captured framing headers never override the actual body length in Fetch or DNR rules', async () => {
  const source = request({
    method: 'POST',
    body: {
      content: '{ "id":9007199254740993123, "text":"你好" }',
      enctype: 'application/json',
    },
    headers: [
      header('Content-Length', '1'),
      header('TRANSFER-ENCODING', 'chunked'),
      header('Trailer', 'X-End'),
      header('X-Keep', 'yes'),
    ],
  })
  const before = JSON.stringify(source)
  const prepared = prepareRequest(source)
  assert.deepEqual(
    prepared.headers.map(h => h.name),
    ['X-Keep'],
  )
  assert.equal(JSON.stringify(source), before)
  const executor = new FetchRequestExecutor(1, source)
  assert.ok(
    !executor
      .getModifyHeaderInfo()
      .some(h =>
        ['content-length', 'transfer-encoding', 'trailer'].includes(
          h.header.toLowerCase(),
        ),
      ),
  )
  global.fetch = async (_url, init) => {
    assert.equal(init.body, source.body.content)
    assert.ok(
      !init.headers.some(([name]) =>
        ['content-length', 'transfer-encoding', 'trailer'].includes(
          name.toLowerCase(),
        ),
      ),
    )
    return new Response('exact body')
  }
  const result = await executor.execute()
  assert.equal(result.type, 'execute')
  assert.equal(result.data.body, 'exact body')
  assert.ok(!toCurl(source).includes('Content-Length'))
  assertClean()
})

test('P0 Basic navigation preserves HTTP error metadata while explicitly marking the body unavailable', async () => {
  browser.tabs.update = async (_, info) => {
    browser.webRequest.onBeforeRequest.emit({
      requestId: 'frame-http-error',
      tabId: 7,
      url: info.url,
      method: 'GET',
    })
    browser.webRequest.onHeadersReceived.emit({
      requestId: 'frame-http-error',
      tabId: 7,
      url: info.url,
      statusCode: 404,
      statusLine: 'HTTP/2 404 Not Found',
      responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }],
    })
    browser.webRequest.onCompleted.emit({
      requestId: 'frame-http-error',
      tabId: 7,
      statusCode: 404,
    })
  }
  const result = await new NavigationRequestExecutor(7, request()).execute()
  assert.equal(result.type, 'execute')
  assert.equal(result.data.statusCode, 404)
  assert.equal(result.data.bodyUnavailable, true)
  assert.equal(result.data.body, '')
  assert.equal(result.data.bodyBytes, 0)
  assertClean()
})

test('P0 explicit Cookie is scoped to the Raw request; browser credentials remain omitted and rules are cleaned', async () => {
  const originalFetch = global.fetch
  let init
  global.fetch = async (_url, options) => {
    init = options
    return new Response('cookie fixture', {
      status: 200,
      headers: { 'Set-Cookie': 'server=fixture' },
    })
  }
  try {
    const source = request({
      headers: [header('Cookie', 'sid=fixture-A; pref=1')],
    })
    const result = await new FetchRequestExecutor(1, source).execute()
    assert.equal(result.type, 'execute')
    assert.equal(init.credentials, 'omit')
    assert.equal(
      new Headers(init.headers).get('Cookie'),
      'sid=fixture-A; pref=1',
    )
    const add = ruleUpdates.findLast(u =>
      u.addRules?.some(r =>
        r.action.requestHeaders?.some(
          h =>
            h.header.toLowerCase() === 'cookie' &&
            h.value === 'sid=fixture-A; pref=1',
        ),
      ),
    )
    assert.ok(add)
    assert.match(add.addRules[0].condition.regexFilter, /fixture/)
    assert.deepEqual(add.addRules[0].condition.initiatorDomains, ['fixture'])
    assertClean()
    assert.equal(source.headers[0].value, 'sid=fixture-A; pref=1')
  } finally {
    global.fetch = originalFetch
  }
})
