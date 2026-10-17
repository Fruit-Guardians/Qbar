const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const {
  EvidenceStore,
  EVIDENCE_KEY,
  EVIDENCE_ENTRY_BYTES,
  exportEvidence,
  createRepeaterTabs,
  readNetworkHar,
  reactive,
} = bundle(
  path.resolve(__dirname, '..'),
  `
export * from '@/features/evidence/model/evidence-store'
export * from '@/features/workbench/model/repeater-tabs'
export {readNetworkHar} from '@/features/workbench/model/network-capture'
export {reactive} from 'vue'
`,
)
const request = () => ({
  method: 'POST',
  url: 'https://user:password@fixture.test/api?token=secret&token=again#private',
  headers: [
    {
      name: 'Authorization',
      value: 'Bearer secret',
      enabled: true,
      removeIfEmptyValue: false,
      _createdAt: 1,
    },
  ],
  body: {
    enctype: 'application/json',
    content: ' {"id":9007199254740993123,"password":"secret"}\n',
  },
  followRedirect: false,
  timeoutMs: 30000,
})
const exchange = () => ({
  request: request(),
  response: {
    protocolVersion: 'HTTP/1.1',
    statusCode: 403,
    statusMessage: 'Forbidden',
    baseUrl: 'https://fixture.test/api?token=secret',
    headers: [{ name: 'Set-Cookie', value: 'secret' }],
    body: '{"response":"secret"}',
  },
  outcome: 'HTTP error response',
  durationMs: 12,
  rawMode: true,
})
const memory = () => {
  const values = { unrelated: 'keep' }
  return {
    values,
    async get(defaults) {
      return structuredClone({ ...defaults, ...values })
    },
    async set(data) {
      Object.assign(values, structuredClone(data))
    },
  }
}
const save = (store, e = exchange()) =>
  store.action({
    action: 'save',
    exchange: e,
    title: 'secret title',
    notes: 'secret note',
  })
test('evidence is opt-in, stores exact immutable request+response+notes and survives a new store instance', async () => {
  const storage = memory(),
    store = new EvidenceStore(storage),
    input = exchange()
  assert.equal((await store.action({ action: 'list' })).entries.length, 0)
  assert.equal(storage.values[EVIDENCE_KEY], undefined)
  const pending = save(store, input)
  input.request.body.content = 'changed after click'
  const snapshot = await pending
  assert.equal(
    snapshot.entries[0].exchange.request.body.content,
    request().body.content,
  )
  assert.equal(snapshot.entries[0].exchange.response.statusCode, 403)
  snapshot.entries[0].notes = 'outside mutation'
  const reopened = await new EvidenceStore(storage).action({ action: 'list' })
  assert.equal(reopened.entries[0].notes, 'secret note')
  assert.equal(storage.values.unrelated, 'keep')
})
test('serialized evidence saves and note updates do not drop another panel’s entries', async () => {
  const store = new EvidenceStore(memory())
  await Promise.all([save(store), save(store), save(store)])
  const before = await store.action({ action: 'list' }),
    id = before.entries[1].id
  const after = await store.action({
    action: 'update',
    id,
    title: 'edited',
    notes: 'new note',
  })
  assert.equal(after.entries.length, 3)
  assert.equal(after.entries[1].notes, 'new note')
  assert.equal(after.revision, 4)
  const removed = await store.action({ action: 'remove', id })
  assert.equal(removed.entries.length, 2)
  assert.equal((await store.action({ action: 'list' })).revision, 5)
})
test('evidence limits refuse saving instead of evicting or silently truncating existing proof', async () => {
  const storage = memory(),
    store = new EvidenceStore(storage)
  await save(store)
  const before = JSON.stringify(storage.values)
  const large = exchange()
  large.response.body = 'x'.repeat(EVIDENCE_ENTRY_BYTES)
  await assert.rejects(save(store, large), /limit reached/)
  assert.equal(JSON.stringify(storage.values), before)
  for (let i = 1; i < 50; i++) await save(store)
  await assert.rejects(save(store), /limit reached/)
  assert.equal((await store.action({ action: 'list' })).entries.length, 50)
})
test('failed evidence writes preserve old data and the serialized queue recovers', async () => {
  const storage = memory(),
    original = storage.set,
    store = new EvidenceStore(storage)
  await save(store)
  storage.set = async () => {
    throw Error('disk full')
  }
  await assert.rejects(save(store), /disk full/)
  storage.set = original
  assert.equal((await save(store)).entries.length, 2)
})
test('corrupt evidence is retained and malformed input never touches existing records', async () => {
  const storage = memory(),
    store = new EvidenceStore(storage)
  await save(store)
  const bad = exchange()
  bad.response.body = 42
  await assert.rejects(save(store, bad), /Invalid evidence response/)
  await assert.rejects(
    store.action({ action: 'update', id: 'missing', title: 'x', notes: '' }),
    /no longer exists/,
  )
  storage.values[EVIDENCE_KEY] = { version: 9, entries: [] }
  const before = JSON.stringify(storage.values)
  await assert.rejects(store.action({ action: 'list' }), /could not be read/)
  assert.equal(JSON.stringify(storage.values), before)
})
test('default redacted export removes bodies, credentials, notes and all header/query values without mutating saved proof', async () => {
  const entry = (await save(new EvidenceStore(memory()))).entries[0]
  entry.exchange.request.futureSecret = 'unknown-secret'
  const original = structuredClone(entry),
    redacted = exportEvidence(entry)
  for (const secret of [
    'secret',
    'again',
    'password@',
    'private',
    'unknown-secret',
  ])
    assert.ok(!redacted.includes(secret), secret)
  const parsed = JSON.parse(redacted)
  assert.equal(parsed.redacted, true)
  assert.equal(parsed.entry.exchange.request.body.content, '[OMITTED]')
  assert.equal(
    new URL(parsed.entry.exchange.request.url).searchParams.getAll('token')
      .length,
    2,
  )
  assert.deepEqual(entry, original)
  const full = JSON.parse(exportEvidence(entry, false))
  assert.equal(full.redacted, false)
  assert.equal(full.entry.exchange.request.body.content, request().body.content)
})
test('failed and cancelled attempts can be saved with an explicit missing response', async () => {
  const store = new EvidenceStore(memory()),
    e = exchange()
  delete e.response
  e.outcome = 'Cancelled'
  e.error = 'Request cancelled.'
  const result = await save(store, e)
  assert.equal(result.entries[0].exchange.outcome, 'Cancelled')
  assert.equal(result.entries[0].exchange.response, undefined)
})
const draft = () => ({
  request: request(),
  rawMode: true,
  status: 'Ready',
  duration: null,
  source: 'fixture',
})
function tabsFixture() {
  const state = reactive({ draft: draft(), busy: false })
  const tabs = createRepeaterTabs({
    read: () => state.draft,
    apply: d => {
      state.draft = d
    },
    empty: () => ({
      ...draft(),
      request: {
        ...request(),
        url: '',
        headers: [],
        body: { enctype: 'application/json', content: '' },
      },
    }),
    busy: () => state.busy,
  })
  return { state, tabs }
}
test('Repeater tab switching preserves independent exact bodies, response, status, mode and duration', () => {
  const { state, tabs } = tabsFixture()
  state.draft.request.body.content = ' A \n'
  state.draft.response = exchange().response
  state.draft.exchange = exchange()
  state.draft.status = 'HTTP error response'
  state.draft.duration = 12
  tabs.add()
  assert.equal(state.draft.request.url, '')
  state.draft.request.body.content = 'B'
  state.draft.rawMode = false
  tabs.activate('1')
  assert.equal(state.draft.request.body.content, ' A \n')
  assert.equal(state.draft.response.statusCode, 403)
  assert.equal(state.draft.duration, 12)
  tabs.activate('2')
  assert.equal(state.draft.request.body.content, 'B')
  assert.equal(state.draft.response, undefined)
  assert.equal(state.draft.rawMode, false)
})
test('duplicating a request is a deep copy and never copies a result into an unsent tab', () => {
  const { state, tabs } = tabsFixture()
  state.draft.response = exchange().response
  state.draft.attempt = exchange()
  tabs.add(true)
  assert.equal(state.draft.response, undefined)
  assert.equal(state.draft.attempt, undefined)
  assert.equal(tabs.dirty.value, true)
  state.draft.request.headers[0].value = 'duplicate'
  tabs.activate('1')
  assert.equal(state.draft.request.headers[0].value, 'Bearer secret')
})
test('closing dirty tabs or results requires explicit discard and the last tab always has a replacement', () => {
  const { state, tabs } = tabsFixture()
  state.draft.request.url += '&edited=1'
  tabs.close('1')
  assert.equal(tabs.pendingClose.value, '1')
  assert.equal(tabs.tabs.value.length, 1)
  tabs.cancelClose()
  assert.equal(tabs.pendingClose.value, '')
  tabs.close('1', true)
  assert.equal(tabs.tabs.value.length, 1)
  assert.equal(state.draft.request.url, '')
})
test('sending locks tab mutation; tab count is bounded and close/switch never sends a request', () => {
  const { state, tabs } = tabsFixture()
  state.busy = true
  tabs.add()
  tabs.close('1', true)
  tabs.activate('invalid')
  assert.equal(tabs.tabs.value.length, 1)
  state.busy = false
  for (let i = 0; i < 30; i++) tabs.add()
  assert.equal(tabs.tabs.value.length, 20)
  assert.match(tabs.notice.value, /Maximum 20/)
})
test('Chrome callback-only HAR, Firefox promises, extra-argument fallback and abort are supported', async () => {
  const signal = new AbortController(),
    expected = { entries: [{ request: { url: 'https://fixture.test' } }] }
  assert.deepEqual(
    await readNetworkHar(
      {
        getHAR(cb) {
          queueMicrotask(() => cb(expected))
        },
      },
      signal.signal,
    ),
    expected,
  )
  assert.deepEqual(
    await readNetworkHar({ getHAR: async () => expected }, signal.signal),
    expected,
  )
  assert.deepEqual(
    await readNetworkHar(
      {
        getHAR(cb) {
          if (cb) throw Error('No arguments')
          return Promise.resolve(expected)
        },
      },
      signal.signal,
    ),
    expected,
  )
  const pending = readNetworkHar({ getHAR() {} }, signal.signal)
  signal.abort()
  await assert.rejects(pending, /cancelled/)
})

test('Cookie and Set-Cookie survive explicit evidence storage but neither secret reaches default export', async () => {
  const e = exchange()
  e.request.headers.push({
    name: 'Cookie',
    value: 'sid=cookie-secret-A',
    enabled: true,
    removeIfEmptyValue: false,
    _createdAt: 2,
  })
  e.response.headers.push({
    name: 'Set-Cookie',
    value: 'sid=cookie-secret-B; HttpOnly; Secure',
  })
  const entry = (await save(new EvidenceStore(memory()), e)).entries[0]
  assert.ok(
    entry.exchange.request.headers.some(h => h.value === 'sid=cookie-secret-A'),
  )
  assert.ok(
    entry.exchange.response.headers.some(h =>
      h.value.includes('cookie-secret-B'),
    ),
  )
  const redacted = exportEvidence(entry)
  assert.ok(!redacted.includes('cookie-secret-A'))
  assert.ok(!redacted.includes('cookie-secret-B'))
  const full = exportEvidence(entry, false)
  assert.ok(full.includes('cookie-secret-A'))
  assert.ok(full.includes('cookie-secret-B'))
})

test('stale evidence updates and removals are rejected without destroying another panel’s newer notes', async () => {
  const store = new EvidenceStore(memory()),
    first = await save(store),
    id = first.entries[0].id
  await store.action({
    action: 'update',
    id,
    title: 'new',
    notes: 'newer',
    expectedRevision: first.revision,
  })
  await assert.rejects(
    store.action({
      action: 'update',
      id,
      title: 'old',
      notes: 'stale',
      expectedRevision: first.revision,
    }),
    /changed in another panel/,
  )
  await assert.rejects(
    store.action({ action: 'remove', id, expectedRevision: first.revision }),
    /changed in another panel/,
  )
  assert.equal(
    (await store.action({ action: 'list' })).entries[0].notes,
    'newer',
  )
})
