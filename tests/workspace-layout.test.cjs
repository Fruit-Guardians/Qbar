const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const {
  clampSplit,
  readWorkspacePreference,
  workspaceDirection,
  splitFromPointer,
  responseBodyState,
} = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/request/model/workspace-layout'; export * from '@/features/request/model/response-state'",
)
test('layout preferences tolerate missing, invalid and corrupt saved fields', () => {
  for (const value of [
    undefined,
    null,
    true,
    'bad',
    {},
    { layout: 'unknown', ratio: '70' },
  ])
    assert.deepEqual(readWorkspacePreference(value), {
      layout: 'auto',
      ratio: 50,
    })
  assert.deepEqual(readWorkspacePreference({ layout: 'stacked', ratio: 35 }), {
    layout: 'stacked',
    ratio: 35,
  })
  assert.deepEqual(readWorkspacePreference({ layout: 'side', ratio: 1000 }), {
    layout: 'side',
    ratio: 80,
  })
})
test('split ratios remain bounded including NaN and infinite values', () => {
  assert.equal(clampSplit(-1), 20)
  assert.equal(clampSplit(99), 80)
  assert.equal(clampSplit(NaN), 50)
  assert.equal(clampSplit(Infinity), 50)
  assert.equal(clampSplit(37.5), 37.5)
})
test('narrow docks stack even when side layout is selected without overwriting preference', () => {
  for (const layout of ['auto', 'side', 'stacked'])
    assert.equal(workspaceDirection(layout, 400), 'stacked')
  assert.equal(workspaceDirection('auto', 900), 'side')
  assert.equal(workspaceDirection('side', 900), 'side')
  assert.equal(workspaceDirection('stacked', 900), 'stacked')
})
test('pointer geometry respects container origin and guards zero size', () => {
  assert.equal(splitFromPointer(300, 100, 400), 50)
  assert.equal(splitFromPointer(10000, 100, 400), 80)
  assert.equal(splitFromPointer(-50, 100, 400), 20)
  assert.equal(splitFromPointer(200, 100, 0), 50)
})
test('empty response and missing capture are distinct; whitespace is actual body content', () => {
  assert.equal(responseBodyState({ body: '' }), 'empty')
  assert.equal(
    responseBodyState({ body: '', bodyUnavailable: true }),
    'unavailable',
  )
  assert.equal(
    responseBodyState({ body: ' ', bodyUnavailable: false }),
    'available',
  )
  assert.equal(
    responseBodyState({ body: 'metadata', bodyUnavailable: true }),
    'unavailable',
  )
})

const fs = require('node:fs')
const { parse, compileScript } = require('@vue/compiler-sfc')
const esbuild = require('esbuild')
const { createRenderer, h, nextTick } = require('vue')
const { browser } = require('./helpers/browser-mock.cjs')
browser.storage.local = { get: async () => ({}), set: async () => {} }
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
async function splitComponent() {
  const filename = path.resolve(
    __dirname,
    '../src/features/request/components/WorkspaceSplit.vue',
  )
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const contents = compileScript(descriptor, { id: 'split-test' }).content
  const mock = require.resolve('./helpers/browser-mock.cjs')
  const result = await esbuild.build({
    stdin: { contents, resolveDir: path.dirname(filename), loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['vue', mock],
    alias: { 'webextension-polyfill': mock },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    mod,
    mod.exports,
  )
  return { ...mod.exports.default, render: () => null }
}
function mountSplit(Component, pane = 'raw') {
  const app = renderer.createApp({ render: () => h(Component, { pane }) })
  const vm = app.mount({})
  return { app, s: vm.$.subTree.component.setupState }
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
  await nextTick()
}
test('split late hydration never overwrites an interaction; save failure remains recoverable', async () => {
  const Component = await splitComponent(),
    get = browser.storage.local.get,
    set = browser.storage.local.set
  let resolveGet,
    fail = true,
    saved = []
  browser.storage.local.get = () =>
    new Promise(r => {
      resolveGet = r
    })
  browser.storage.local.set = async value => {
    if (fail) throw Error('disk full')
    saved.push(value)
  }
  const { app, s } = mountSplit(Component)
  try {
    s.width = 900
    s.adjust({ key: 'ArrowRight', shiftKey: false, preventDefault() {} })
    resolveGet({ 'qbarWorkspaceLayout-raw': { layout: 'stacked', ratio: 75 } })
    await flush()
    assert.equal(s.preference.ratio, 52)
    assert.equal(s.preference.layout, 'auto')
    assert.equal(s.notice, 'Layout applies to this panel only.')
    fail = false
    s.reset()
    await flush()
    assert.equal(s.notice, '')
    assert.equal(saved[0]['qbarWorkspaceLayout-raw'].ratio, 50)
  } finally {
    app.unmount()
    browser.storage.local.get = get
    browser.storage.local.set = set
  }
})
test('split queued writes preserve order and unmounted hydration has no effect', async () => {
  const Component = await splitComponent(),
    get = browser.storage.local.get,
    set = browser.storage.local.set
  let resolveGet,
    saved = []
  browser.storage.local.get = () =>
    new Promise(r => {
      resolveGet = r
    })
  browser.storage.local.set = async value => {
    saved.push(value)
  }
  const { app, s } = mountSplit(Component, 'basic')
  try {
    s.width = 900
    s.adjust({ key: 'End', preventDefault() {} })
    s.adjust({ key: 'Home', preventDefault() {} })
    await flush()
    assert.deepEqual(
      saved.map(v => v['qbarWorkspaceLayout-basic'].ratio),
      [80, 20],
    )
    app.unmount()
    resolveGet({
      'qbarWorkspaceLayout-basic': { layout: 'stacked', ratio: 70 },
    })
    await flush()
    assert.equal(s.preference.ratio, 20)
  } finally {
    browser.storage.local.get = get
    browser.storage.local.set = set
  }
})
