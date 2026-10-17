const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const esbuild = require('esbuild'),
  { createRenderer, nextTick, watch } = require('vue')
const { browser } = require('./helpers/browser-mock.cjs')
const root = path.resolve(__dirname, '..'),
  mock = require.resolve('./helpers/browser-mock.cjs')
const compiled = esbuild
  .build({
    stdin: {
      contents:
        "export { usePanelWorkspace } from '@/app/composables/use-panel-workspace'",
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.VITE_BUILD_TARGET': '"chrome"',
    },
    alias: {
      '@': path.join(root, 'src'),
      'webextension-polyfill': mock,
      'vuetify/framework': path.join(__dirname, 'helpers/theme-mock.cjs'),
    },
    external: ['vue', mock],
    plugins: [
      {
        name: 'workspace-ui-mocks',
        setup(build) {
          build.onResolve({ filter: /use-editor-tools$/ }, () => ({
            path: path.join(__dirname, 'helpers/editor-tools-mock.cjs'),
          }))
        },
      },
    ],
  })
  .then(result => {
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(
      require,
      mod,
      mod.exports,
    )
    return mod.exports
  })
let usePanelWorkspace
test.before(async () => {
  ;({ usePanelWorkspace } = await compiled)
})
const event = () => ({
  handlers: new Set(),
  addListener(fn) {
    this.handlers.add(fn)
  },
  removeListener(fn) {
    this.handlers.delete(fn)
  },
  emit(m) {
    for (const fn of [...this.handlers]) fn(m)
  },
})
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
let ports = [],
  copied = ''
browser.devtools = { inspectedWindow: { tabId: 99 } }
browser.storage.local = {
  get: async defaults => ({ ...defaults }),
  set: async () => {},
}
browser.runtime.connect = () => {
  const p = {
    onMessage: event(),
    onDisconnect: event(),
    sent: [],
    postMessage(m) {
      this.sent.push(m)
    },
    disconnect() {},
  }
  ports.push(p)
  return p
}
global.window = { matchMedia: () => ({ matches: false }) }
global.document = {
  documentElement: { className: '' },
  querySelector: () => null,
}
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
async function mount({ waitForPreferences = true } = {}) {
  ports = []
  let workspace
  const app = renderer.createApp({
    setup() {
      workspace = usePanelWorkspace()
      return () => null
    },
  })
  app.mount({})
  if (waitForPreferences) await tick()
  return { w: workspace, app, p: ports[0] }
}
const draft = url => ({
  url,
  method: 'GET',
  headers: [],
  body: { content: '', enctype: 'application/x-www-form-urlencoded' },
  followRedirect: false,
  timeoutMs: 30000,
})
const tick = async () => {
  await nextTick()
  await new Promise(r => setImmediate(r))
}
test('real workspace startup checks existing capture and never sends; Load is nonmodal and preserves edits', async () => {
  const { w, app, p } = await mount()
  try {
    assert.equal(w.request.url, '')
    p.onMessage.emit({ type: 'ready' })
    await tick()
    const initial = p.sent.find(m => m.type === 'load')
    assert.equal(initial.draftOnly, undefined)
    p.onMessage.emit({
      type: 'load',
      loadId: initial.loadId,
      source: 'draft',
      reason: 'no-record',
      data: draft('http://fixture.test/start'),
    })
    await tick()
    assert.equal(w.request.url, 'http://fixture.test/start')
    assert.equal(w.requestSource.value, 'URL-only GET draft')
    assert.match(w.loadNotice.value, /not captured/)
    assert.equal(w.reloadDialog, undefined)
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 0)
    w.load()
    const pending = p.sent.findLast(m => m.type === 'load')
    w.request.body.content = 'keep this edit'
    p.onMessage.emit({
      type: 'load',
      loadId: pending.loadId,
      source: 'captured',
      data: draft('http://fixture.test/new'),
    })
    await tick()
    assert.equal(w.request.url, 'http://fixture.test/start')
    assert.equal(w.request.body.content, 'keep this edit')
    assert.match(w.loadNotice.value, /editor changed/)
    assert.equal(w.loading.value, false)
  } finally {
    app.unmount()
  }
})
test('interrupted sends keep editor contents, reconnect without replay, ignore late result and copy data-free diagnostics', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    const initial = p.sent.find(m => m.type === 'load')
    p.onMessage.emit({
      type: 'load',
      loadId: initial.loadId,
      source: 'draft',
      reason: 'no-record',
      data: draft('http://fixture.test/'),
    })
    await tick()
    w.request.headers = [
      {
        enabled: true,
        name: 'Authorization',
        value: 'secret-token',
        removeIfEmptyValue: false,
        _createdAt: 1,
      },
    ]
    w.request.body.content = 'secret-body'
    w.execute()
    const sent = p.sent.find(m => m.type === 'execute')
    assert.ok(sent)
    assert.equal(w.isSending.value, true)
    p.onDisconnect.emit()
    assert.equal(w.isSending.value, false)
    assert.equal(w.executionStatus.value, 'Connection interrupted')
    assert.equal(w.request.body.content, 'secret-body')
    w.reconnect()
    const next = ports.at(-1)
    next.onMessage.emit({ type: 'ready' })
    await tick()
    assert.equal(next.sent.filter(m => m.type === 'execute').length, 0)
    next.onMessage.emit({
      type: 'execute',
      requestId: sent.data.requestId,
      data: { body: 'late' },
    })
    await tick()
    assert.equal(w.response.value, undefined)
    await w.copyDiagnostics()
    assert.ok(!/secret|fixture\.test|Authorization/i.test(copied))
    assert.match(copied, /outcome unknown/)
  } finally {
    app.unmount()
  }
})
test('permission/load errors do not terminate a running send; timeout preserves editor and shows terminal status', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    const initial = p.sent.find(m => m.type === 'load')
    p.onMessage.emit({
      type: 'load',
      loadId: initial.loadId,
      reason: 'permission',
      data: undefined,
    })
    await tick()
    assert.match(w.loadNotice.value, /Site access/)
    Object.assign(w.request, draft('http://fixture.test/send'))
    w.execute()
    const id = p.sent.find(m => m.type === 'execute').data.requestId
    p.onMessage.emit({ type: 'error', operation: 'load', data: 'load error' })
    await tick()
    assert.equal(w.isSending.value, true)
    p.onMessage.emit({
      type: 'error',
      requestId: id,
      code: 'timeout',
      data: 'Request timed out.',
    })
    await tick()
    assert.equal(w.isSending.value, false)
    assert.equal(w.executionStatus.value, 'Timed out')
    assert.equal(w.request.url, 'http://fixture.test/send')
  } finally {
    app.unmount()
  }
})

test('comparison exchange keeps the sent request rather than edits made during flight or after completion', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(
      {
        ...draft('http://fixture.test/sent'),
        method: 'POST',
        body: {
          enctype: 'application/json',
          content: '{"id":9007199254740993123}',
        },
      },
      { rawMode: true },
    )
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 0)
    w.execute()
    const id = p.sent.findLast(m => m.type === 'execute').data.requestId
    w.request.url = 'http://fixture.test/edited-during-send'
    const response = {
      protocolVersion: 'HTTP/1.1',
      statusCode: 200,
      statusMessage: 'OK',
      headers: [],
      baseUrl: 'http://fixture.test',
      body: '{"ok":true}',
    }
    p.onMessage.emit({
      type: 'execute',
      requestId: id,
      durationMs: 25,
      data: response,
    })
    await tick()
    assert.equal(w.lastExchange.value.request.url, 'http://fixture.test/sent')
    assert.equal(
      w.lastExchange.value.request.body.content,
      '{"id":9007199254740993123}',
    )
    assert.equal(w.lastExchange.value.response.statusCode, 200)
    response.body = 'changed outside'
    w.request.body.content = 'changed draft'
    assert.equal(w.lastExchange.value.response.body, '{"ok":true}')
    assert.equal(w.lastExchange.value.durationMs, 25)
  } finally {
    app.unmount()
  }
})
test('failed or interrupted requests do not replace the last completed exchange; Load preserves it without sending', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(draft('http://fixture.test/first'), { rawMode: true })
    w.execute()
    const first = p.sent.findLast(m => m.type === 'execute').data.requestId
    p.onMessage.emit({
      type: 'execute',
      requestId: first,
      durationMs: 10,
      data: undefined,
    })
    await tick()
    assert.equal(w.lastExchange.value.request.url, 'http://fixture.test/first')
    w.loadFrom(draft('http://fixture.test/second'), { rawMode: true })
    w.execute()
    const second = p.sent.findLast(m => m.type === 'execute').data.requestId
    p.onMessage.emit({
      type: 'error',
      requestId: second,
      code: 'timeout',
      data: 'timeout',
    })
    await tick()
    assert.equal(w.lastExchange.value.request.url, 'http://fixture.test/first')
    p.onMessage.emit({
      type: 'execute',
      requestId: first,
      data: { body: 'late' },
    })
    await tick()
    assert.equal(w.lastExchange.value.request.url, 'http://fixture.test/first')
  } finally {
    app.unmount()
  }
})

test('saved Raw mode and follow-redirect preferences hydrate before startup Load; no false edit conflict', async () => {
  let resolvePreferences
  const originalGet = browser.storage.local.get
  browser.storage.local.get = () =>
    new Promise(resolve => {
      resolvePreferences = resolve
    })
  const { w, app } = await mount({ waitForPreferences: false })
  try {
    assert.equal(ports.length, 0)
    resolvePreferences({
      darkThemeEnabled: true,
      rawModeEnabled: true,
      rawModeFollowRedirect: true,
      defaultRequestTimeoutMs: 60000,
    })
    await tick()
    assert.equal(w.isRawMode.value, true)
    assert.equal(w.request.followRedirect, true)
    assert.equal(w.theme.global.name.value, 'dark')
    assert.equal(w.request.timeoutMs, 60000)
    const p = ports[0]
    p.onMessage.emit({ type: 'ready' })
    await tick()
    const initial = p.sent.find(m => m.type === 'load')
    assert.equal(initial.draftOnly, undefined)
    p.onMessage.emit({
      type: 'load',
      loadId: initial.loadId,
      source: 'draft',
      reason: 'no-record',
      data: draft('http://fixture.test/saved-preferences'),
    })
    await tick()
    assert.equal(w.request.url, 'http://fixture.test/saved-preferences')
    assert.doesNotMatch(w.loadNotice.value, /editor changed/)
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 0)
  } finally {
    app.unmount()
    browser.storage.local.get = originalGet
  }
})
test('preference read/write errors do not block connection or theme switching; malformed preferences use defaults', async () => {
  const original = { ...browser.storage.local }
  for (const get of [
    async () => {
      throw new Error('storage unavailable')
    },
    async () => ({
      rawModeEnabled: 'false',
      darkThemeEnabled: 'no',
      rawModeFollowRedirect: 1,
    }),
  ]) {
    browser.storage.local.get = get
    browser.storage.local.set = async () => {
      throw new Error('storage unavailable')
    }
    const { w, app, p } = await mount()
    try {
      assert.ok(p)
      assert.equal(w.isRawMode.value, false)
      assert.equal(w.request.followRedirect, false)
      w.enableDarkTheme(true)
      await tick()
      assert.equal(w.theme.global.name.value, 'dark')
    } finally {
      app.unmount()
      Object.assign(browser.storage.local, original)
    }
  }
})
test('unmount during preference read never opens a connection or mutates the destroyed panel', async () => {
  let resolvePreferences
  const originalGet = browser.storage.local.get
  browser.storage.local.get = () =>
    new Promise(resolve => {
      resolvePreferences = resolve
    })
  const { w, app } = await mount({ waitForPreferences: false })
  app.unmount()
  try {
    resolvePreferences({
      darkThemeEnabled: true,
      rawModeEnabled: true,
      rawModeFollowRedirect: true,
    })
    await tick()
    assert.equal(ports.length, 0)
    assert.equal(w.isRawMode.value, false)
    assert.equal(w.request.followRedirect, false)
  } finally {
    browser.storage.local.get = originalGet
  }
})

test('edits made while preferences load prevent automatic startup draft replacement', async () => {
  let resolvePreferences
  const originalGet = browser.storage.local.get
  browser.storage.local.get = () =>
    new Promise(resolve => {
      resolvePreferences = resolve
    })
  const { w, app } = await mount({ waitForPreferences: false })
  try {
    w.request.url = 'http://fixture.test/user-draft'
    resolvePreferences({ rawModeEnabled: true, rawModeFollowRedirect: true })
    await tick()
    const p = ports[0]
    p.onMessage.emit({ type: 'ready' })
    await tick()
    assert.equal(w.request.url, 'http://fixture.test/user-draft')
    assert.equal(
      p.sent.filter(m => ['load', 'execute'].includes(m.type)).length,
      0,
    )
  } finally {
    app.unmount()
    browser.storage.local.get = originalGet
  }
})

test('a recent user theme choice wins late preference reads and never sends a request', async () => {
  const original = { ...browser.storage.local }
  let resolve
  browser.storage.local.get = () => new Promise(r => (resolve = r))
  const { w, app } = await mount({ waitForPreferences: false })
  try {
    await w.setThemeMode('light')
    resolve({ uiThemeMode: 'dark' })
    await tick()
    assert.equal(w.themeMode.value, 'light')
    assert.equal(w.theme.global.name.value, 'light')
    assert.equal(ports[0].sent.filter(m => m.type === 'execute').length, 0)
  } finally {
    app.unmount()
    Object.assign(browser.storage.local, original)
  }
})
test('remote theme changes synchronize appearance only, preserving request edits and cleaning listeners', async () => {
  const old = browser.storage.onChanged,
    storageEvent = event()
  browser.storage.onChanged = storageEvent
  const { w, app, p } = await mount()
  try {
    w.request.url = 'http://fixture.test/untouched'
    w.request.body.content = 'private'
    const before = JSON.stringify(w.request)
    for (const fn of storageEvent.handlers)
      fn({ uiThemeMode: { newValue: 'dark' } }, 'local')
    assert.equal(w.theme.global.name.value, 'dark')
    assert.equal(JSON.stringify(w.request), before)
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 0)
  } finally {
    app.unmount()
    assert.equal(storageEvent.handlers.size, 0)
    browser.storage.onChanged = old
  }
})

test('P0 tabs preserve sent snapshots, response and edited drafts; switching never sends or renders', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(
      {
        ...draft('https://fixture.test/one'),
        method: 'POST',
        body: {
          enctype: 'application/json',
          content: ' {"id":9007199254740993123}\n',
        },
      },
      { rawMode: true },
    )
    w.execute()
    const id = p.sent.findLast(m => m.type === 'execute').data.requestId
    const response = {
      protocolVersion: 'HTTP/1.1',
      statusCode: 403,
      statusMessage: 'Forbidden',
      headers: [],
      body: '{"ok":false}',
      baseUrl: w.request.url,
    }
    p.onMessage.emit({
      type: 'execute',
      requestId: id,
      data: response,
      durationMs: 5,
    })
    await tick()
    assert.equal(w.executionStatus.value, 'HTTP error response')
    assert.equal(w.lastAttempt.value.response.statusCode, 403)
    w.request.body.content = 'edited draft'
    w.tabs.add()
    w.request.url = 'https://fixture.test/two'
    w.tabs.activate('1')
    w.onRenderRequested()
    await tick()
    assert.equal(w.request.body.content, 'edited draft')
    assert.equal(
      w.lastAttempt.value.request.body.content,
      ' {"id":9007199254740993123}\n',
    )
    assert.equal(w.response.value.statusCode, 403)
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 1)
    assert.equal(p.sent.filter(m => m.type === 'render').length, 0)
    w.tabs.activate('2')
    assert.equal(w.request.url, 'https://fixture.test/two')
    assert.equal(w.response.value, undefined)
  } finally {
    app.unmount()
  }
})
test('P0 errors and cancellation create separate immutable evidence attempts; late terminal errors are ignored', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(draft('https://fixture.test/timeout'), { rawMode: true })
    w.execute()
    const id = p.sent.findLast(m => m.type === 'execute').data.requestId
    w.tabs.add()
    assert.equal(w.tabs.tabs.value.length, 1)
    w.cancelRequest()
    assert.equal(w.executionStatus.value, 'Cancelling…')
    p.onMessage.emit({
      type: 'error',
      requestId: id,
      code: 'cancelled',
      data: 'Request cancelled.',
    })
    await tick()
    assert.equal(w.lastAttempt.value.outcome, 'Cancelled')
    assert.equal(w.lastAttempt.value.response, undefined)
    p.onMessage.emit({
      type: 'error',
      requestId: id,
      code: 'timeout',
      data: 'late timeout',
    })
    await tick()
    assert.equal(w.executionStatus.value, 'Cancelled')
    w.tabs.add()
    assert.equal(w.tabs.tabs.value.length, 2)
  } finally {
    app.unmount()
  }
})
test('P0 evidence actions are correlated, stale replies cannot clear a current action and disconnects unlock controls', async () => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.evidence.toggle()
    let message = p.sent.findLast(m => m.type === 'evidence')
    assert.ok(message.actionId)
    assert.equal(w.evidence.busy.value, true)
    p.onMessage.emit({
      type: 'evidence',
      actionId: 'stale',
      data: { version: 1, revision: 1, entries: [] },
    })
    await tick()
    assert.equal(w.evidence.busy.value, true)
    p.onMessage.emit({
      type: 'evidence',
      actionId: message.actionId,
      data: { version: 1, revision: 2, entries: [] },
    })
    await tick()
    assert.equal(w.evidence.busy.value, false)
    w.evidence.action({ action: 'list' })
    p.onDisconnect.emit()
    await tick()
    assert.equal(w.evidence.busy.value, false)
    assert.match(w.evidence.error.value, /interrupted/)
    assert.equal(p.sent.filter(m => m.type === 'execute').length, 0)
  } finally {
    app.unmount()
  }
})
test('P0 capture stays active while tools are closed, uses only the latest document capture, and cleans listeners', async () => {
  const old = browser.devtools.network,
    finished = event(),
    navigated = event()
  let entries = [
    {
      _resourceType: 'document',
      request: {
        url: 'https://fixture.test/document',
        method: 'POST',
        headers: [],
        bodySize: 3,
        postData: {
          text: 'a=1',
          mimeType: 'application/x-www-form-urlencoded',
        },
      },
      response: { status: 200 },
    },
  ]
  browser.devtools.network = {
    getHAR(cb) {
      queueMicrotask(() => cb({ entries }))
    },
    onRequestFinished: finished,
    onNavigated: navigated,
  }
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    const load = p.sent.findLast(m => m.type === 'load')
    p.onMessage.emit({
      type: 'load',
      loadId: load.loadId,
      source: 'draft',
      reason: 'no-record',
      data: draft('https://fixture.test/document'),
    })
    await tick()
    assert.equal(w.request.method, 'POST')
    assert.equal(w.request.body.content, 'a=1')
    assert.equal(w.requestSource.value, 'Captured page request')
    assert.equal(finished.handlers.size, 1)
    entries.push({
      _resourceType: 'document',
      request: {
        url: 'https://fixture.test/document',
        method: 'POST',
        headers: [],
        bodySize: 99,
      },
      response: { status: 200 },
    })
    w.load()
    const next = p.sent.findLast(m => m.type === 'load')
    p.onMessage.emit({
      type: 'load',
      loadId: next.loadId,
      source: 'draft',
      reason: 'partial',
      data: draft('https://fixture.test/document'),
    })
    await tick()
    assert.equal(w.request.method, 'GET')
    assert.equal(w.request.body.content, '')
    assert.equal(w.loadReason.value, 'partial')
  } finally {
    app.unmount()
    browser.devtools.network = old
  }
  assert.equal(finished.handlers.size, 0)
  assert.equal(navigated.handlers.size, 0)
})

test('P0 an unacknowledged cancel is bounded, preserves an unknown-outcome attempt and never retries', async t => {
  const { w, app, p } = await mount()
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(draft('https://fixture.test/no-ack'), { rawMode: true })
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
    w.execute()
    w.cancelRequest()
    t.mock.timers.tick(5001)
    await tick()
    assert.equal(w.isSending.value, false)
    assert.equal(w.executionStatus.value, 'Connection interrupted')
    assert.match(w.lastAttempt.value.error, /outcome unknown/)
    assert.equal(
      ports.flatMap(p => p.sent).filter(m => m.type === 'execute').length,
      1,
    )
  } finally {
    app.unmount()
    t.mock.timers.reset()
  }
})

test('P0 tab restoration suppresses automatic page rendering through the response watcher flush', async () => {
  const { w, app, p } = await mount()
  let stop
  try {
    p.onMessage.emit({ type: 'ready' })
    await tick()
    w.loadFrom(draft('https://fixture.test/tab-render'), { rawMode: true })
    w.execute()
    const id = p.sent.findLast(m => m.type === 'execute').data.requestId
    p.onMessage.emit({
      type: 'execute',
      requestId: id,
      data: {
        protocolVersion: 'HTTP/1.1',
        statusCode: 200,
        statusMessage: 'OK',
        headers: [],
        body: 'saved',
        baseUrl: 'https://fixture.test',
      },
      durationMs: 1,
    })
    await tick()
    w.tabs.add()
    await tick()
    stop = watch(w.response, value => {
      if (value) w.onRenderRequested()
    })
    w.tabs.activate('1')
    await tick()
    assert.equal(w.response.value.body, 'saved')
    assert.equal(p.sent.filter(m => m.type === 'render').length, 0)
    w.onRenderRequested()
    assert.equal(
      p.sent.filter(m => m.type === 'render').length,
      1,
      'explicit render still works after the flush',
    )
  } finally {
    stop?.()
    app.unmount()
  }
})
