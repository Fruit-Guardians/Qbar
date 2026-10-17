const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const { defaultRequestTimeout, preparePreference } = bundle(
  path.resolve(__dirname, '..'),
  "export { defaultRequestTimeout, preparePreference } from '@/app/model/panel-preferences.ts'",
)
test('settings defaults accept only supported finite numeric timeout values', () => {
  for (const n of [5000, 10000, 30000, 60000, 120000])
    assert.equal(defaultRequestTimeout(n), n)
  for (const n of [
    undefined,
    null,
    '60000',
    0,
    -1,
    Infinity,
    NaN,
    15000,
    {},
    true,
  ])
    assert.equal(defaultRequestTimeout(n), 30000)
})
test('settings patches persist only their own preference and never include request data', () => {
  assert.deepEqual(preparePreference('followRedirect', true), {
    request: { followRedirect: true },
    storage: { rawModeFollowRedirect: true },
  })
  assert.deepEqual(preparePreference('timeoutMs', 60000), {
    request: { timeoutMs: 60000 },
    storage: { defaultRequestTimeoutMs: 60000 },
  })
  assert.throws(() => preparePreference('timeoutMs', -1), /Invalid/)
  assert.throws(() => preparePreference('followRedirect', 'true'), /Invalid/)
})

test('settings navigation closes tool/history sidebars without replacing the request workspace, and returns focus', async () => {
  const { usePanelNavigation } = bundle(
    path.resolve(__dirname, '..'),
    "export { usePanelNavigation } from '@/app/composables/use-panel-navigation.ts'",
  )
  let toolHides = 0,
    toolToggles = 0,
    focused = 0
  const originalDocument = global.document
  global.document = { getElementById: () => ({ focus: () => focused++ }) }
  const history = { value: true },
    tools = { value: { hide: () => toolHides++, toggle: () => toolToggles++ } }
  const nav = usePanelNavigation(
    tools,
    history,
    () => {
      history.value = !history.value
    },
    () => {
      history.value = false
    },
  )
  try {
    nav.toggleSettings()
    assert.equal(nav.settingsOpen.value, true)
    assert.equal(history.value, false)
    assert.equal(toolHides, 1)
    nav.toggleTools()
    assert.equal(nav.settingsOpen.value, false)
    assert.equal(toolToggles, 1)
    nav.toggleSettings()
    nav.toggleRecords()
    assert.equal(nav.settingsOpen.value, false)
    assert.equal(history.value, true)
    nav.toggleSettings()
    nav.closeSettings()
    await new Promise(r => setImmediate(r))
    assert.equal(focused, 1)
  } finally {
    global.document = originalDocument
  }
})
