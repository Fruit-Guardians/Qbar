const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const { browser } = require('./helpers/browser-mock.cjs')
const { loadTabRequest, reloadTabRequest, store } = bundle(
  path.resolve(__dirname, '..'),
  `
export { loadTabRequest, reloadTabRequest } from '@/extension/background/tab-request.ts'
export { default as store } from '@/extension/background/session-store.ts'
`,
)
let tab, permitted, getError
const reset = () => {
  tab = { url: 'https://fixture.test/new', status: 'complete' }
  permitted = true
  getError = false
}
browser.permissions = { contains: async () => permitted }
browser.tabs.get = async () => {
  if (getError) throw Error('Tab closed')
  return { ...tab }
}
const capture = url => ({
  url,
  method: 'POST',
  headers: [{ name: 'X-Captured', value: 'real' }],
  body: { content: 'original', enctype: 'application/json' },
  followRedirect: false,
})
test.beforeEach(reset)
test('first installation creates empty GET URL draft without invented headers or body', async () => {
  const result = await loadTabRequest(81)
  assert.equal(result.source, 'draft')
  assert.equal(result.reason, 'no-record')
  assert.equal(result.data.url, tab.url)
  assert.equal(result.data.method, 'GET')
  assert.deepEqual(result.data.headers, [])
  assert.equal(result.data.body.content, '')
  assert.equal(await store.getBrowseRequest(81), undefined)
})
test('real capture restores method, headers and body; startup always seeds only URL', async () => {
  await store.updateBrowseRequest(82, capture(tab.url), 'capture')
  const result = await loadTabRequest(82)
  assert.equal(result.source, 'captured')
  assert.equal(result.data.method, 'POST')
  assert.equal(result.data.body.content, 'original')
  const draft = await loadTabRequest(82, true)
  assert.equal(draft.source, 'draft')
  assert.deepEqual(draft.data.headers, [])
  assert.equal(draft.data.body.content, '')
})
test('navigation cannot reuse old POST body, including SPA path changes and pending navigation', async () => {
  await store.updateBrowseRequest(
    83,
    capture('https://fixture.test/old'),
    'old',
  )
  assert.equal((await loadTabRequest(83)).source, 'draft')
  tab.pendingUrl = 'https://other.test/pending'
  tab.status = 'loading'
  const result = await loadTabRequest(83)
  assert.equal(result.data, undefined)
  assert.equal(result.reason, 'navigating')
})
test('fragment-only changes still match a captured network request', async () => {
  await store.updateBrowseRequest(84, capture(tab.url), 'fragment')
  tab.url += '#section'
  assert.equal((await loadTabRequest(84)).source, 'captured')
})
test('permission denial, unsupported schemes, missing URL and closed tab are distinct non-destructive results', async () => {
  permitted = false
  assert.equal((await loadTabRequest(85)).reason, 'permission')
  tab.url = 'chrome://extensions'
  assert.equal((await loadTabRequest(85)).reason, 'unsupported')
  tab.url = undefined
  permitted = true
  assert.equal((await loadTabRequest(85)).reason, 'unavailable')
  getError = true
  assert.equal((await loadTabRequest(85)).reason, 'unavailable')
})
test('navigation during asynchronous capture lookup is rejected', async () => {
  let calls = 0
  const old = browser.tabs.get
  browser.tabs.get = async () => ({
    url: ++calls === 1 ? 'https://fixture.test/a' : 'https://fixture.test/b',
    status: 'complete',
  })
  try {
    assert.equal((await loadTabRequest(86)).reason, 'navigating')
  } finally {
    browser.tabs.get = old
  }
})
test('refresh-and-load installs/removes listener and returns newly captured request', async () => {
  browser.tabs.reload = async id => {
    for (const fn of [...browser.tabs.onUpdated.handlers])
      fn(id, { status: 'loading' })
    await store.updateBrowseRequest(id, capture(tab.url), 'reload')
    for (const fn of [...browser.tabs.onUpdated.handlers])
      fn(id, { status: 'complete' })
  }
  const before = browser.tabs.onUpdated.handlers.size
  assert.equal((await reloadTabRequest(87)).source, 'captured')
  assert.equal(browser.tabs.onUpdated.handlers.size, before)
  browser.tabs.reload = async () => {
    throw Error('restricted')
  }
  assert.equal((await reloadTabRequest(87)).reason, 'unavailable')
  assert.equal(browser.tabs.onUpdated.handlers.size, before)
})
test('request-id guard blocks headers from a different navigation even at the same URL', async () => {
  await store.updateBrowseRequest(88, capture(tab.url), 'first')
  await store.updateBrowseRequest(
    88,
    { ...capture(tab.url), body: { content: 'second' } },
    'second',
  )
  assert.equal(store.matchesCapture(88, 'first', tab.url), false)
  await store.updateBrowseRequest(88, capture(tab.url), 'first', true)
  assert.equal((await store.getBrowseRequest(88)).body.content, 'second')
  await store.remove(88)
  assert.equal(store.matchesCapture(88, 'second', tab.url), false)
})

test('reload waits for its loading transition, not an old complete event or another tab', async () => {
  let settled = false
  browser.tabs.reload = async id => {
    for (const fn of [...browser.tabs.onUpdated.handlers]) {
      fn(id, { status: 'complete' })
      fn(id + 1, { status: 'loading' })
      fn(id + 1, { status: 'complete' })
    }
  }
  const result = reloadTabRequest(89).then(value => {
    settled = true
    return value
  })
  await new Promise(resolve => setImmediate(resolve))
  const early = settled
  for (const fn of [...browser.tabs.onUpdated.handlers]) {
    fn(89, { status: 'loading' })
    fn(89, { status: 'complete' })
  }
  await result
  assert.equal(early, false)
  assert.equal(browser.tabs.onUpdated.handlers.size, 0)
})

test('P0 partial captures are never labelled complete, and header completion survives worker reload', async () => {
  await store.updateBrowseRequest(95, capture(tab.url), 'partial', false, false)
  assert.equal((await loadTabRequest(95)).reason, 'partial')
  await store.updateBrowseRequest(95, capture(tab.url), 'partial', true, true)
  assert.equal((await loadTabRequest(95)).source, 'captured')
  const { store: reopened } = bundle(
    path.resolve(__dirname, '..'),
    "export {default as store} from '@/extension/background/session-store'",
  )
  assert.equal((await reopened.getBrowseRequest(95)).body.content, 'original')
  assert.equal(reopened.captureComplete(95), true)
  await reopened.updateBrowseRequest(
    95,
    capture(tab.url),
    'partial',
    true,
    true,
  )
  assert.equal(reopened.captureComplete(95), true)
})
test('P0 unavailable binary bodies stay partial even after headers arrive', async () => {
  await store.updateBrowseRequest(
    96,
    capture(tab.url),
    'binary',
    false,
    false,
    'body-unavailable',
  )
  await store.updateBrowseRequest(96, capture(tab.url), 'binary', true, true)
  assert.equal(store.captureComplete(96), false)
  assert.equal((await loadTabRequest(96)).reason, 'partial')
})
