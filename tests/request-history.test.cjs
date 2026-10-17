const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const {
  RequestHistory,
  HISTORY_STORAGE_KEY: KEY,
  HISTORY_BYTE_LIMIT: LIMIT,
} = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/history/model/request-history.ts'",
)
const clone = value => structuredClone(value)
const fixture = () => ({
  method: 'POST',
  url: 'https://example.test/echo?q=1',
  body: {
    content: 'hello=world',
    enctype: 'application/x-www-form-urlencoded',
  },
  headers: [
    {
      enabled: true,
      name: 'X-Test',
      value: "quoted ' value",
      removeIfEmptyValue: false,
      _createdAt: 1,
    },
  ],
  followRedirect: true,
  timeoutMs: 5000,
})
function storageFixture() {
  const data = { unrelated: 'keep' }
  return {
    data,
    async get(defaults) {
      return clone({ ...defaults, ...data })
    },
    async set(values) {
      Object.assign(data, clone(values))
    },
  }
}
const done = {
  type: 'execute',
  data: { statusCode: 201, body: 'RESPONSE_MUST_NOT_BE_SAVED' },
}

test('history stores an immutable send snapshot and terminal metadata, not response bodies', async () => {
  const storage = storageFixture(),
    history = new RequestHistory(storage),
    request = fixture()
  const saving = history.begin('one', request, true)
  request.url = 'https://changed.test/'
  request.body.content = 'changed'
  request.headers[0].value = 'changed'
  await saving
  await history.finish('one', done, 123.4)
  const { entries } = await history.action({ action: 'list' }),
    entry = entries[0]
  assert.equal(entry.request.url, 'https://example.test/echo?q=1')
  assert.equal(entry.request.body.content, 'hello=world')
  assert.equal(entry.request.headers[0].value, "quoted ' value")
  assert.equal(entry.request.followRedirect, true)
  assert.equal(entry.request.timeoutMs, 5000)
  assert.equal(entry.rawMode, true)
  assert.equal(entry.status, 'completed')
  assert.equal(entry.statusCode, 201)
  assert.equal(entry.durationMs, 123)
  assert.ok(
    !JSON.stringify(storage.data).includes('RESPONSE_MUST_NOT_BE_SAVED'),
  )
  assert.equal(storage.data.unrelated, 'keep')
  entry.request.body.content = 'mutated return'
  assert.equal(
    (await history.action({ action: 'list' })).entries[0].request.body.content,
    'hello=world',
  )
})
test('concurrent panel writes serialize without losing entries; count is bounded newest first', async () => {
  const storage = storageFixture(),
    history = new RequestHistory(storage)
  await Promise.all(
    Array.from({ length: 110 }, (_, i) =>
      history.begin('id-' + i, fixture(), i % 2 === 0),
    ),
  )
  const state = await history.action({ action: 'list' })
  assert.equal(state.entries.length, 100)
  assert.equal(state.entries[0].id, 'id-109')
  assert.equal(state.entries.at(-1).id, 'id-10')
  assert.equal(state.revision, 110)
  await Promise.all(
    state.entries.map((entry, i) => history.finish(entry.id, done, i)),
  )
  assert.ok(
    (await history.action({ action: 'list' })).entries.every(
      e => e.status === 'completed',
    ),
  )
})
test('history restart persists records and marks only abandoned pending entries interrupted', async () => {
  const storage = storageFixture(),
    first = new RequestHistory(storage)
  await first.begin('pending', fixture(), true)
  await first.begin('done', fixture(), false)
  await first.finish('done', done, 10)
  const state = await new RequestHistory(storage).action({ action: 'list' })
  assert.equal(
    state.entries.find(e => e.id === 'pending').status,
    'interrupted',
  )
  assert.equal(state.entries.find(e => e.id === 'done').status, 'completed')
  assert.equal(
    (await new RequestHistory(storage).action({ action: 'list' })).entries[0]
      .request.body.content,
    'hello=world',
  )
})
test('delete and clear during a running request do not resurrect it on completion', async () => {
  const history = new RequestHistory(storageFixture())
  await history.begin('delete', fixture(), true)
  await history.action({ action: 'remove', id: 'delete' })
  await history.finish('delete', done, 20)
  assert.equal((await history.action({ action: 'list' })).entries.length, 0)
  await history.begin('clear', fixture(), true)
  await history.action({ action: 'clear' })
  await history.finish('clear', done, 30)
  assert.equal((await history.action({ action: 'list' })).entries.length, 0)
})
test('pause/resume recording persists, does not erase old entries or record paused sends', async () => {
  const storage = storageFixture(),
    history = new RequestHistory(storage)
  await history.begin('old', fixture(), false)
  await history.finish('old', done, 1)
  await history.action({ action: 'recording', enabled: false })
  await history.begin('paused', fixture(), true)
  await history.finish('paused', done, 2)
  const restored = new RequestHistory(storage)
  assert.equal((await restored.action({ action: 'list' })).enabled, false)
  await restored.action({ action: 'recording', enabled: true })
  await restored.begin('new', fixture(), true)
  assert.deepEqual(
    (await restored.action({ action: 'list' })).entries.map(e => e.id),
    ['new', 'old'],
  )
})
test('history preserves cancelled/timeout/failed states and bounded error text', async () => {
  const history = new RequestHistory(storageFixture())
  for (const code of ['cancelled', 'timeout', 'failed']) {
    await history.begin(code, fixture(), true)
    await history.finish(
      code,
      { type: 'error', code, data: 'x'.repeat(3000) },
      45,
    )
  }
  const state = await history.action({ action: 'list' })
  for (const entry of state.entries) {
    assert.equal(entry.id, entry.status)
    assert.equal(entry.error.length, 2000)
    assert.equal(entry.durationMs, 45)
  }
})
test('byte cap prunes oldest whole requests; oversize request is not truncated or saved', async () => {
  const storage = storageFixture(),
    history = new RequestHistory(storage),
    request = fixture()
  request.body.content = '🙂'.repeat(150000)
  for (let i = 0; i < 4; i++) await history.begin('large-' + i, request, true)
  assert.equal((await history.action({ action: 'list' })).entries.length, 3)
  assert.ok(Buffer.byteLength(JSON.stringify(storage.data[KEY])) <= LIMIT)
  request.body.content = 'x'.repeat(LIMIT)
  await assert.rejects(history.begin('oversize', request, true), /not saved/)
  assert.equal(
    (await history.action({ action: 'list' })).entries[0].id,
    'large-3',
  )
})
test('storage failures do not poison the write queue and do not erase unrelated keys', async () => {
  const storage = storageFixture(),
    set = storage.set.bind(storage)
  let fail = true
  storage.set = async value => {
    if (fail) {
      fail = false
      throw new Error('quota fixture')
    }
    return set(value)
  }
  const history = new RequestHistory(storage)
  await assert.rejects(
    history.begin('failed-write', fixture(), true),
    /quota fixture/,
  )
  await history.begin('recovered', fixture(), true)
  assert.deepEqual(
    (await history.action({ action: 'list' })).entries.map(e => e.id),
    ['recovered'],
  )
  assert.equal(storage.data.unrelated, 'keep')
})
test('damaged entries and out-of-range dates are skipped; unknown storage version is kept', async () => {
  const storage = storageFixture(),
    history = new RequestHistory(storage)
  await history.begin('good', fixture(), true)
  await history.finish('good', done, 1)
  const good = clone(storage.data[KEY].entries[0])
  storage.data[KEY].entries.push(
    { ...good, id: 'bad-date', createdAt: 1e99 },
    { ...good, id: 'bad-request', request: {} },
    clone(good),
  )
  assert.equal((await history.action({ action: 'list' })).entries.length, 1)
  storage.data[KEY] = { version: 99, entries: [] }
  await assert.rejects(
    history.action({ action: 'list' }),
    /Existing data was kept/,
  )
  assert.equal(storage.data[KEY].version, 99)
})
test('duplicate send IDs are idempotent; invalid preferences reject without corrupting storage', async () => {
  const history = new RequestHistory(storageFixture())
  await history.begin('same', fixture(), true)
  await history.begin('same', fixture(), true)
  assert.equal((await history.action({ action: 'list' })).entries.length, 1)
  await assert.rejects(
    history.action({ action: 'recording', enabled: 'false' }),
    /Invalid history/,
  )
  assert.equal((await history.action({ action: 'list' })).enabled, true)
})
