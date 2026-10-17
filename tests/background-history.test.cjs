const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const { browser, listeners } = require('./helpers/browser-mock.cjs')
const event = () => ({
  handlers: new Set(),
  addListener(fn) {
    this.handlers.add(fn)
  },
  removeListener(fn) {
    this.handlers.delete(fn)
  },
})
const local = { unrelated: 'keep' }
let localFailure = false
let suspendStorage
browser.storage.local = {
  async get(defaults) {
    if (suspendStorage) await suspendStorage
    if (localFailure) throw new Error('history storage fixture failure')
    return structuredClone({ ...defaults, ...local })
  },
  async set(values) {
    if (localFailure) throw new Error('history storage fixture failure')
    Object.assign(local, structuredClone(values))
  },
}
browser.permissions = { contains: async () => true }
browser.runtime.onConnect = event()
browser.runtime.onMessage = event()
browser.runtime.onInstalled = event()
browser.declarativeNetRequest.getSessionRules = async () => []
browser.webRequest.onBeforeSendHeaders = event()
browser.tabs.onRemoved = event()
browser.commands = { onCommand: event() }
global.chrome = {
  webRequest: {
    OnBeforeRequestOptions: {},
    OnBeforeSendHeadersOptions: {},
    OnBeforeRedirectOptions: {},
    OnCompletedOptions: {},
  },
}
global.__testGlob = () => ({
  form: class {
    getName() {
      return 'application/x-www-form-urlencoded'
    }
  },
})
bundle(
  path.resolve(__dirname, '..'),
  "import '@/extension/background/index.ts'",
)
function portFixture() {
  const messages = []
  const port = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage(message) {
      messages.push(structuredClone(message))
    },
  }
  for (const fn of browser.runtime.onConnect.handlers) fn(port)
  return {
    messages,
    port,
    async send(message) {
      for (const fn of port.onMessage.handlers) await fn(message)
    },
  }
}
async function until(predicate) {
  for (let i = 0; i < 300; i++) {
    const result = predicate()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  assert.fail('Expected background result did not arrive')
}
const request = () => ({
  method: 'POST',
  url: 'http://fixture.test/send?history=1',
  body: {
    content: 'actual=snapshot',
    enctype: 'application/x-www-form-urlencoded',
  },
  headers: [],
  followRedirect: false,
  timeoutMs: 500,
})
const execMessage = (id, tabId = 1) => ({
  type: 'execute',
  tabId,
  data: { rawMode: true, request: request(), requestId: id },
})
const originalFetch = global.fetch
test.after(() => {
  global.fetch = originalFetch
})

test('production background records actual sends and broadcasts terminal history to both panels', async () => {
  global.fetch = async () => new Response('private response', { status: 201 })
  const first = portFixture(),
    second = portFixture()
  await first.send(execMessage('actual-one'))
  await until(() =>
    first.messages.find(
      m => m.type === 'execute' && m.requestId === 'actual-one',
    ),
  )
  const update = await until(() =>
    second.messages.findLast(
      m =>
        m.type === 'history' &&
        m.data?.entries.find(
          e => e.id === 'actual-one' && e.status === 'completed',
        ),
    ),
  )
  const entry = update.data.entries.find(e => e.id === 'actual-one')
  assert.equal(entry.request.body.content, 'actual=snapshot')
  assert.equal(entry.statusCode, 201)
  assert.equal(entry.rawMode, true)
  assert.equal(local.unrelated, 'keep')
  assert.ok(!JSON.stringify(local).includes('private response'))
  await second.send({
    type: 'history',
    tabId: 2,
    data: { action: 'remove', id: 'actual-one' },
  })
  await until(() =>
    first.messages.findLast(
      m => m.type === 'history' && m.data?.entries.length === 0,
    ),
  )
})
test('history storage failure is separate from successful network sending and can recover', async () => {
  localFailure = true
  const client = portFixture()
  await client.send(execMessage('storage-failure', 3))
  await until(() =>
    client.messages.find(
      m => m.type === 'history' && m.error?.includes('storage fixture'),
    ),
  )
  await until(() =>
    client.messages.find(
      m => m.type === 'execute' && m.requestId === 'storage-failure',
    ),
  )
  assert.ok(
    !client.messages.some(
      m => m.type === 'error' && m.requestId === 'storage-failure',
    ),
  )
  localFailure = false
  await client.send({ type: 'history', tabId: 3, data: { action: 'list' } })
  await until(() => client.messages.find(m => m.type === 'history' && m.data))
})
test('slow history storage never blocks sending or returning the response', async () => {
  let release
  suspendStorage = new Promise(resolve => {
    release = resolve
  })
  const client = portFixture()
  await client.send(execMessage('slow-history', 4))
  await until(() =>
    client.messages.find(
      m => m.type === 'execute' && m.requestId === 'slow-history',
    ),
  )
  assert.ok(
    !client.messages.some(
      m =>
        m.type === 'history' &&
        m.data?.entries.some(e => e.id === 'slow-history'),
    ),
  )
  release()
  suspendStorage = undefined
  await until(() =>
    client.messages.find(
      m =>
        m.type === 'history' &&
        m.data?.entries.some(
          e => e.id === 'slow-history' && e.status === 'completed',
        ),
    ),
  )
})
test('cancelled in-flight production requests are recorded as cancelled', async () => {
  global.fetch = async (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(init.signal.reason), {
        once: true,
      }),
    )
  const client = portFixture()
  await client.send(execMessage('cancel-history', 5))
  await until(() =>
    client.messages.find(
      m =>
        m.type === 'history' &&
        m.data?.entries.some(e => e.id === 'cancel-history'),
    ),
  )
  await client.send({
    type: 'cancel',
    tabId: 5,
    data: { requestId: 'cancel-history' },
  })
  await until(() =>
    client.messages.find(
      m =>
        m.type === 'error' &&
        m.requestId === 'cancel-history' &&
        m.code === 'cancelled',
    ),
  )
  await until(() =>
    client.messages.find(
      m =>
        m.type === 'history' &&
        m.data?.entries.some(
          e => e.id === 'cancel-history' && e.status === 'cancelled',
        ),
    ),
  )
  assert.equal(
    listeners.onBeforeRequest.handlers.size,
    1,
    'only the permanent inspected-tab recorder remains',
  )
})

test('production background routes Basic JSON through exact-body Fetch and records its actual transport', async () => {
  let sent
  global.fetch = async (_url, init) => {
    sent = init
    return new Response('ok', { status: 200 })
  }
  const client = portFixture(),
    message = execMessage('basic-json-exact', 6)
  message.data.rawMode = false
  message.data.request.body = {
    enctype: 'application/json',
    content: ' {"n":9007199254740993123,"x":null}\n',
  }
  await client.send(message)
  await until(() =>
    client.messages.find(
      m => m.type === 'execute' && m.requestId === 'basic-json-exact',
    ),
  )
  assert.equal(sent.body, message.data.request.body.content)
  assert.equal(
    new Headers(sent.headers).get('Content-Type'),
    'application/json',
  )
  const update = await until(() =>
    client.messages.find(
      m =>
        m.type === 'history' &&
        m.data?.entries.some(
          e => e.id === 'basic-json-exact' && e.status === 'completed',
        ),
    ),
  )
  assert.equal(
    update.data.entries.find(e => e.id === 'basic-json-exact').rawMode,
    true,
  )
})

test('background ready handshake, load correlation, and permission rejection are action-scoped', async () => {
  const client = portFixture()
  await client.send({ type: 'init', tabId: 71 })
  await until(() => client.messages.find(m => m.type === 'ready'))
  await client.send({
    type: 'load',
    tabId: 71,
    loadId: 'first-open',
    draftOnly: true,
  })
  const loaded = await until(() =>
    client.messages.find(m => m.type === 'load' && m.loadId === 'first-open'),
  )
  assert.equal(loaded.source, 'draft')
  assert.equal(loaded.data.method, 'GET')
  assert.deepEqual(loaded.data.headers, [])
  browser.permissions.contains = async () => false
  try {
    await client.send(execMessage('no-site-access', 71))
    const failure = await until(() =>
      client.messages.find(
        m => m.type === 'error' && m.requestId === 'no-site-access',
      ),
    )
    assert.match(failure.data, /Site access/)
    assert.ok(
      !client.messages.some(
        m => m.type === 'execute' && m.requestId === 'no-site-access',
      ),
    )
  } finally {
    browser.permissions.contains = async () => true
  }
})

test('P0 cancelling while permission checks are pending prevents the fetch entirely', async () => {
  let permit,
    fetches = 0
  browser.permissions.contains = () =>
    new Promise(resolve => (permit = resolve))
  global.fetch = async () => {
    fetches++
    return new Response('must not send')
  }
  const client = portFixture()
  await client.send(execMessage('early-cancel', 101))
  await until(() => permit)
  await client.send({
    type: 'cancel',
    tabId: 101,
    data: { requestId: 'early-cancel' },
  })
  permit(true)
  await until(() =>
    client.messages.find(
      m =>
        m.type === 'error' &&
        m.requestId === 'early-cancel' &&
        m.code === 'cancelled',
    ),
  )
  assert.equal(fetches, 0)
  browser.permissions.contains = async () => true
})
test('P0 disconnect aborts only its owned request, even if another panel last registered the same tab', async () => {
  let began
  const started = new Promise(resolve => (began = resolve))
  global.fetch = async (_url, init) => {
    began()
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(init.signal.reason), {
        once: true,
      }),
    )
  }
  const first = portFixture(),
    second = portFixture()
  await first.send(execMessage('owner-disconnect', 102))
  await started
  await second.send({ type: 'init', tabId: 102 })
  for (const fn of first.port.onDisconnect.handlers) fn()
  await until(() =>
    first.messages.find(
      m =>
        m.type === 'error' &&
        m.requestId === 'owner-disconnect' &&
        m.code === 'cancelled',
    ),
  )
  assert.ok(!second.messages.some(m => m.requestId === 'owner-disconnect'))
})
test('P0 evidence protocol saves full snapshots only on explicit action and broadcasts revisions', async () => {
  global.fetch = async () => new Response('proof body', { status: 409 })
  const first = portFixture(),
    second = portFixture()
  await first.send(execMessage('evidence-send', 103))
  const completed = await until(() =>
    first.messages.find(
      m => m.type === 'execute' && m.requestId === 'evidence-send',
    ),
  )
  assert.ok(!local.qbarEvidenceV1)
  await first.send({
    type: 'evidence',
    tabId: 103,
    actionId: 'evidence-save',
    data: {
      action: 'save',
      title: 'Conflict test',
      notes: 'Check duplicate',
      exchange: {
        request: request(),
        response: completed.data,
        durationMs: completed.durationMs,
        outcome: 'HTTP error response',
      },
    },
  })
  const update = await until(() =>
    first.messages.find(
      m => m.type === 'evidence' && m.actionId === 'evidence-save' && m.data,
    ),
  )
  assert.equal(update.data.entries[0].exchange.response.body, 'proof body')
  assert.equal(update.data.entries[0].exchange.response.statusCode, 409)
  await until(() =>
    second.messages.find(
      m => m.type === 'evidence' && m.data.revision === update.data.revision,
    ),
  )
  assert.equal(local.unrelated, 'keep')
})
