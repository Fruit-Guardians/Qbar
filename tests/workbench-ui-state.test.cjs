const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs')
const esbuild = require('esbuild'),
  { parse, compileScript } = require('@vue/compiler-sfc'),
  { createRenderer, h, reactive, nextTick } = require('vue')
const root = path.resolve(__dirname, '..')
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
async function loadComponent(name) {
  const filename = path.join(
    root,
    'src/features/workbench/components',
    name + '.vue',
  )
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const script = compileScript(descriptor, { id: name }).content
  const result = await esbuild.build({
    stdin: {
      contents: script,
      resolveDir: path.dirname(filename),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['vue', require.resolve('./helpers/browser-mock.cjs')],
    alias: {
      'webextension-polyfill': require.resolve('./helpers/browser-mock.cjs'),
    },
    plugins: [
      {
        name: 'component-stubs',
        setup(build) {
          build.onLoad({ filter: /\.vue$/ }, () => ({
            contents: 'export default {}',
            loader: 'js',
          }))
        },
      },
    ],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    mod,
    mod.exports,
  )
  return { ...mod.exports.default, render: () => null }
}
function mount(Component, props) {
  const emitted = []
  const state = reactive(props)
  const app = renderer.createApp({
    render: () =>
      h(Component, {
        ...state,
        onUpdate: value => {
          emitted.push(value)
          state.url = value
        },
        onRequestPreference: value => {
          emitted.push(value)
          Object.assign(state.request, value)
        },
        onApply: value => {
          emitted.push(value)
          state.request = value
        },
      }),
  })
  app.mount({})
  const child = app._instance.subTree.component
  return { state, bindings: child.setupState, emitted, app }
}
let Query, Json, Tools, Response, Settings
test.before(async () => {
  Query = await loadComponent('QueryEditor')
  Json = await loadComponent('JsonTools')
  Tools = await loadComponent('RequestTools')
  Response = await loadComponent('../../request/components/ResponseContent')
  Settings = await loadComponent('../../../app/components/SettingsPage')
})
test('actual QueryEditor keeps disabled rows across own URL edits and rebuilds on external URL change', async () => {
  const f = mount(Query, { url: 'https://x/?a=1&a=2#frag', sending: false }),
    s = f.bindings
  try {
    s.rows[0].enabled = false
    s.commit()
    await nextTick()
    assert.equal(f.state.url, 'https://x/?a=2#frag')
    assert.equal(s.rows.length, 2)
    assert.equal(s.rows[0].enabled, false)
    s.rows[1].value = 'three'
    s.commit()
    await nextTick()
    assert.equal(f.state.url, 'https://x/?a=three#frag')
    assert.equal(s.rows.length, 2)
    s.rows[0].enabled = true
    s.commit()
    await nextTick()
    assert.equal(f.state.url, 'https://x/?a=1&a=three#frag')
    f.state.url = 'https://new/?b=1'
    await nextTick()
    assert.equal(s.rows.length, 1)
    assert.equal(s.rows[0].name, 'b')
    f.state.sending = true
    await nextTick()
    s.rows[0].value = 'blocked'
    s.commit()
    assert.equal(f.state.url, 'https://new/?b=1')
  } finally {
    f.app.unmount()
  }
})
test('actual JSON tools format explicitly, preserve big integers and apply only to unchanged non-GET body', async () => {
  const request = {
    method: 'POST',
    url: 'https://x/',
    headers: [],
    body: {
      content: '{"id":9007199254740993123,"id":2}',
      enctype: 'application/json',
    },
    followRedirect: false,
  }
  const f = mount(Json, { request, sending: false }),
    s = f.bindings
  try {
    s.format(false)
    assert.match(s.text, /9007199254740993123/)
    assert.equal(f.emitted.length, 0)
    s.apply()
    await nextTick()
    assert.equal(f.emitted.length, 1)
    assert.equal(s.stale, false)
    f.state.request.body.content = '{"external":true}'
    await nextTick()
    assert.equal(s.stale, true)
    s.apply()
    assert.equal(f.emitted.length, 1)
    s.read()
    s.format(true)
    s.apply()
    await nextTick()
    assert.equal(f.emitted.length, 2)
    f.state.request.method = 'GET'
    await nextTick()
    s.read()
    s.apply()
    assert.equal(f.emitted.length, 2)
    f.state.request.method = 'POST'
    f.state.sending = true
    await nextTick()
    s.read()
    s.apply()
    assert.equal(f.emitted.length, 2)
    s.source = 'response'
    s.read()
    assert.equal(s.text, '')
    assert.match(s.notice, /No response/)
  } finally {
    f.app.unmount()
  }
})
test('tools use embedded tabpanels rather than JWT modal, and browser permissions/dependencies remain unchanged', () => {
  const read = p => fs.readFileSync(path.join(root, p), 'utf8')
  assert.doesNotMatch(read('src/app/QBarApp.vue'), /<JwtTool/)
  assert.match(read('src/app/QBarApp.vue'), /v-show="!settingsOpen"/)
  assert.match(
    read('src/features/workbench/components/RequestTools.vue'),
    /role="tabpanel"/,
  )
  assert.match(
    read('src/features/workbench/components/RequestTools.vue'),
    /<JwtInspector/,
  )
  assert.match(
    read('src/features/workbench/components/JsonTree.vue'),
    /v-if="expanded"/,
  )
  assert.ok(
    !fs.existsSync(
      path.join(root, 'src/features/tools/components/JwtTool.vue'),
    ),
  )
})

test('all workspace and tools Vue templates compile, including multi-action toolbar handlers', () => {
  const { compileTemplate } = require('@vue/compiler-sfc')
  const paths = [
    'src/app/QBarApp.vue',
    'src/app/components/SettingsPage.vue',
    'src/app/components/PanelControls.vue',
    'src/app/components/AboutQBar.vue',
    'src/features/request/components/ResponseContent.vue',
    'src/features/request/components/ResponseViewer.vue',
    'src/features/request/components/RawRequestEditor.vue',
    ...fs
      .readdirSync(path.join(root, 'src/features/workbench/components'))
      .filter(f => f.endsWith('.vue'))
      .map(f => 'src/features/workbench/components/' + f),
  ]
  for (const p of paths) {
    const filename = path.join(root, p)
    const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), {
      filename,
    })
    const result = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: p,
      compilerOptions: { expressionPlugins: ['typescript'] },
    })
    assert.deepEqual(result.errors, [], p)
  }
})

test('JSON tool initializes on first visit instead of capturing the empty startup draft, and keeps its state afterwards', () => {
  const f = mount(Tools, {
    request: {
      method: 'POST',
      url: 'https://x/',
      body: { content: '{"ready":true}', enctype: 'application/json' },
      headers: [],
    },
    sending: false,
  })
  try {
    const s = f.bindings
    assert.equal(s.visitedJson, false)
    s.select('JSON')
    assert.equal(s.visitedJson, true)
    s.select('Compare')
    assert.equal(s.visitedJson, true)
    const template = fs.readFileSync(
      path.join(root, 'src/features/workbench/components/RequestTools.vue'),
      'utf8',
    )
    assert.match(template, /v-if="name === 'JSON' && visitedJson"/)
  } finally {
    f.app.unmount()
  }
})

test('response UI defaults to Pretty, supports Tree/Raw, copies exact original body and falls back on invalid JSON', async () => {
  let copied
  const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async text => {
          copied = text
        },
      },
    },
  })
  const body = '{"id":9007199254740993123,"id":2}'
  const response = {
    protocolVersion: 'HTTP/1.1',
    statusCode: 200,
    statusMessage: 'OK',
    headers: [],
    body,
    baseUrl: 'https://x/',
  }
  const f = mount(Response, { response }),
    s = f.bindings
  try {
    assert.equal(s.effectiveView, 'Pretty')
    assert.match(s.displayResponse.body, /\n/)
    assert.equal(f.state.response.body, body)
    await s.copyBody()
    assert.equal(copied, body)
    s.mode = 'Tree'
    assert.equal(s.effectiveView, 'Tree')
    s.mode = 'Raw'
    assert.equal(s.displayResponse.body, body)
    f.state.response = { ...response, body: '{"broken":' }
    await nextTick()
    s.mode = 'Tree'
    assert.equal(s.effectiveView, 'Raw')
    assert.equal(s.displayResponse.body, '{"broken":')
    assert.match(s.presentation.notice, /Raw response preserved/)
  } finally {
    f.app.unmount()
    if (originalNavigator)
      Object.defineProperty(global, 'navigator', originalNavigator)
    else delete global.navigator
  }
})

test('settings update only explicit draft preferences, report save failures and do not persist request data', async () => {
  const { browser } = require('./helpers/browser-mock.cjs'),
    original = browser.storage.local
  const writes = []
  browser.storage.local = {
    set: async value => {
      writes.push(value)
    },
  }
  const f = mount(Settings, {
      request: {
        method: 'POST',
        url: 'https://x/private',
        headers: [{ name: 'Authorization', value: 'secret' }],
        body: { content: 'private' },
        timeoutMs: 30000,
        followRedirect: false,
      },
      rawMode: true,
      dark: false,
      sending: false,
      connected: true,
      historyError: '',
    }),
    s = f.bindings
  try {
    await s.savePreference('timeoutMs', 60000)
    await nextTick()
    assert.equal(f.state.request.timeoutMs, 60000)
    assert.deepEqual(writes, [{ defaultRequestTimeoutMs: 60000 }])
    assert.match(s.notice, /Saved locally/)
    browser.storage.local.set = async () => {
      throw new Error('denied')
    }
    await s.savePreference('followRedirect', true)
    await nextTick()
    assert.equal(f.state.request.followRedirect, true)
    assert.match(s.notice, /Saving failed/)
    f.state.sending = true
    await nextTick()
    const count = f.emitted.length
    await s.savePreference('timeoutMs', 5000)
    assert.equal(f.emitted.length, count)
    assert.equal(f.state.request.timeoutMs, 60000)
    assert.ok(!JSON.stringify(writes).includes('private'))
  } finally {
    f.app.unmount()
    browser.storage.local = original
  }
})
