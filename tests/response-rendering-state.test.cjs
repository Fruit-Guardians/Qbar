const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  esbuild = require('esbuild')
const { createRenderer, ref, nextTick } = require('vue'),
  { browser } = require('./helpers/browser-mock.cjs')
const mock = require.resolve('./helpers/browser-mock.cjs'),
  root = path.resolve(__dirname, '..')
const code = esbuild.buildSync({
  stdin: {
    contents:
      "export {useResponseRendering} from '@/features/request/composables/use-response-rendering'",
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  alias: { '@': path.join(root, 'src'), 'webextension-polyfill': mock },
  external: ['vue', mock],
}).outputFiles[0].text
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
})
const tick = async () => {
  await nextTick()
  await new Promise(r => setImmediate(r))
}
function mount() {
  let state,
    renders = 0
  const response = ref()
  const app = renderer.createApp({
    setup() {
      state = mod.exports.useResponseRendering(
        () => response.value,
        () => renders++,
      )
      return () => null
    },
  })
  app.mount({})
  return {
    app,
    response,
    get state() {
      return state
    },
    get renders() {
      return renders
    },
  }
}
test('receiving responses never changes the inspected page by default; explicit opt-in applies only to later responses', async () => {
  const original = browser.storage.local,
    writes = []
  browser.storage.local = {
    get: async value => value,
    set: async value => writes.push(value),
  }
  const f = mount()
  try {
    await tick()
    f.response.value = { body: 'first' }
    await tick()
    assert.equal(f.renders, 0)
    await f.state.setEnabled(true)
    assert.equal(f.renders, 0)
    f.response.value = { body: 'next' }
    await tick()
    assert.equal(f.renders, 1)
    await f.state.setEnabled(false)
    f.response.value = { body: 'last' }
    await tick()
    assert.equal(f.renders, 1)
    assert.deepEqual(writes, [
      { rawModeAutoRenderEnabled: true },
      { rawModeAutoRenderEnabled: false },
    ])
  } finally {
    f.app.unmount()
    browser.storage.local = original
  }
})
test('saved rendering choices hydrate but late reads do not reverse a recent user choice', async () => {
  const original = browser.storage.local
  let resolve
  browser.storage.local = {
    get: () => new Promise(r => (resolve = r)),
    set: async () => {},
  }
  const f = mount()
  try {
    await f.state.setEnabled(false)
    resolve({ rawModeAutoRenderEnabled: true })
    await tick()
    assert.equal(f.state.enabled.value, false)
  } finally {
    f.app.unmount()
    browser.storage.local = original
  }
})
test('saving redirect preference preserves the existing rendering choice and isolates stored fields', async () => {
  const original = browser.storage.local
  let resolve
  const writes = []
  browser.storage.local = {
    get: () => new Promise(r => (resolve = r)),
    set: async value => writes.push(value),
  }
  const f = mount()
  try {
    await f.state.saveRedirects(true)
    resolve({ rawModeAutoRenderEnabled: true })
    await tick()
    assert.equal(f.state.enabled.value, true)
    assert.deepEqual(writes, [{ rawModeFollowRedirect: true }])
  } finally {
    f.app.unmount()
    browser.storage.local = original
  }
})
test('render preference failure is visible and disposed panels ignore late hydration', async () => {
  const original = browser.storage.local
  let resolve
  browser.storage.local = {
    get: () => new Promise(r => (resolve = r)),
    set: async () => {
      throw Error('offline')
    },
  }
  const f = mount()
  try {
    await f.state.setEnabled(true)
    assert.match(f.state.notice.value, /Saving failed/)
    f.app.unmount()
    resolve({ rawModeAutoRenderEnabled: false })
    await tick()
    assert.equal(f.state.enabled.value, true)
    await f.state.setEnabled(false)
    assert.equal(f.state.enabled.value, true)
  } finally {
    browser.storage.local = original
  }
})
