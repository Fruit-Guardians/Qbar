const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
test('actual preview adapter supports connection disposal and removes old message listeners', async () => {
  global.window = {}
  global.localStorage = { getItem: () => null, setItem() {} }
  const { browser, createPanelConnection } = bundle(
    path.resolve(__dirname, '..'),
    `
export { default as browser } from './build/preview/browser-adapter.ts'
export { createPanelConnection } from '@/app/composables/panel-connection.ts'
`,
  )
  const received = [],
    states = []
  const connection = createPanelConnection({
    connect: () => browser.runtime.connect(),
    tabId: 1,
    onMessage: m => received.push(m),
    onState: s => states.push(s),
  })
  try {
    connection.start()
    await new Promise(r => setImmediate(r))
    assert.equal(states.at(-1), 'connected')
    assert.equal(received[0].type, 'ready')
    assert.doesNotThrow(() => connection.dispose())
    const count = received.length
    browser.runtime.connect().postMessage({ type: 'init' })
    await new Promise(r => setImmediate(r))
    assert.equal(received.length, count)
  } finally {
    connection.dispose()
    delete global.window
    delete global.localStorage
  }
})

test('preview preference events mirror extension local storage and release browser event listeners', async () => {
  const events = new Set()
  global.window = {
    addEventListener: (type, fn) => events.add(fn),
    removeEventListener: (type, fn) => events.delete(fn),
  }
  let value = '{}'
  global.localStorage = { getItem: () => value, setItem: (_, v) => (value = v) }
  const { browser } = bundle(
    path.resolve(__dirname, '..'),
    "export {default as browser} from './build/preview/browser-adapter.ts'",
  )
  const updates = [],
    listener = (changes, area) => updates.push({ changes, area })
  try {
    browser.storage.onChanged.addListener(listener)
    assert.equal(events.size, 1)
    await browser.storage.local.set({ uiThemeMode: 'system' })
    assert.equal(updates[0].changes.uiThemeMode.newValue, 'system')
    assert.equal(updates[0].area, 'local')
    for (const fn of events)
      fn({
        key: 'qbar-ui-preview',
        oldValue: '{"uiLanguage":"en"}',
        newValue: '{"uiLanguage":"zh-CN"}',
      })
    assert.equal(updates.at(-1).changes.uiLanguage.newValue, 'zh-CN')
    browser.storage.onChanged.removeListener(listener)
    assert.equal(events.size, 0)
    const count = updates.length
    await browser.storage.local.set({ uiThemeMode: 'dark' })
    assert.equal(updates.length, count)
  } finally {
    delete global.window
    delete global.localStorage
  }
})
