const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  fs = require('node:fs')
const esbuild = require('esbuild'),
  { createRenderer } = require('vue')
const root = path.resolve(__dirname, '..')
const code = esbuild.buildSync({
  stdin: {
    contents:
      "export {useJwtInspector} from '@/features/tools/composables/use-jwt-inspector'",
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['vue'],
  alias: { '@': path.join(root, 'src') },
}).outputFiles[0].text
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
const { useJwtInspector } = mod.exports
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
const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url')
const input = `${enc({ alg: 'HS256' })}.${enc({ sub: 'fixture' })}`
const token = `${input}.${crypto.createHmac('sha256', 'secret').update(input).digest('base64url')}`
function fixture() {
  let state,
    sending = false,
    applied = []
  const request = {
    method: 'GET',
    url: 'http://127.0.0.1/',
    body: { content: '', enctype: '' },
    headers: [
      {
        name: 'Authorization',
        value: `Bearer ${token}`,
        enabled: true,
        _createdAt: 1,
      },
    ],
    followRedirect: false,
  }
  const app = renderer.createApp({
    setup() {
      state = useJwtInspector(
        () => request,
        () => sending,
        v => applied.push(v),
      )
      return () => null
    },
  })
  app.mount({})
  return {
    state,
    app,
    applied,
    request,
    setSending(v) {
      sending = v
    },
  }
}
test('JWT opens empty, reads Authorization only on action, never sends and refuses application during Send', () => {
  const f = fixture()
  try {
    assert.equal(f.state.token.value, '')
    f.state.loadBearer()
    assert.equal(f.state.token.value, token)
    f.setSending(true)
    f.state.applyBearer()
    assert.equal(f.applied.length, 0)
    f.setSending(false)
    f.state.applyBearer()
    assert.equal(f.applied.length, 1)
    assert.match(f.state.notice.value, /No request sent/)
    assert.notEqual(f.applied[0], f.request)
  } finally {
    f.app.unmount()
  }
})
test('JWT verdict resets on token/key/algorithm changes, stale verification cannot replace new state, close wipes keys', async () => {
  const f = fixture(),
    s = f.state
  try {
    s.loadBearer()
    s.material.value = 'secret'
    await s.verify()
    assert.equal(s.status.value, 'Signature valid')
    s.material.value = 'wrong'
    assert.equal(s.status.value, 'Not verified')
    await s.verify()
    assert.equal(s.status.value, 'Signature invalid')
    s.material.value = 'secret'
    const pending = s.verify()
    s.token.value = 'bad'
    await pending
    assert.equal(s.status.value, 'Not verified')
    s.token.value = token
    s.algorithm.value = 'RS256'
    assert.equal(s.material.value, '')
    assert.equal(s.status.value, 'Not verified')
    await s.verify()
    assert.match(s.status.value, /does not match/)
  } finally {
    f.app.unmount()
  }
  assert.equal(s.material.value, '')
  assert.equal(s.token.value, '')
})
test('copy token reports clipboard failure without leaking key and no implicit storage/network APIs exist', async () => {
  const f = fixture()
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw Error('denied')
        },
      },
    },
  })
  try {
    f.state.loadBearer()
    await f.state.copyToken()
    assert.match(f.state.notice.value, /Copy failed/)
  } finally {
    f.app.unmount()
    if (old) Object.defineProperty(globalThis, 'navigator', old)
    else delete globalThis.navigator
  }
  for (const file of [
    'src/features/tools/model/jwt.ts',
    'src/features/tools/composables/use-jwt-inspector.ts',
  ])
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, file), 'utf8'),
      /\bfetch\(|localStorage|storage\.local|postMessage/,
    )
})
test('toolbar replaces seven top-level payload menus with one submenu group; original actions and data remain', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8')
  const app = read('src/app/QBarApp.vue'),
    group = read('src/features/tools/components/PayloadsMenu.vue')
  assert.match(app, /<RequestTools\b/)
  assert.match(app, /<UtilitiesMenu\b/)
  assert.match(
    read('src/features/tools/components/UtilitiesMenu.vue'),
    /<PayloadsMenu\b/,
  )
  for (const name of [
    'SqlInjection',
    'Xss',
    'Lfi',
    'Ssrf',
    'Ssti',
    'Shell',
    'Test',
  ]) {
    assert.doesNotMatch(app, new RegExp(`<${name}Menu`))
    assert.match(group, new RegExp(`<${name}Menu`))
    const menu = read(`src/features/tools/components/${name}Menu.vue`)
    assert.match(menu, /<VMenu submenu>/)
    assert.match(menu, /<VListItem[\s\S]*?:append-icon="mdiChevronRight"/)
    assert.match(menu, /@click=/)
  }
  assert.match(
    read('src/features/tools/components/UtilitiesMenu.vue'),
    /<CustomPayloadMenu/,
  )
  assert.match(app, /<HistorySidebar/)
})
