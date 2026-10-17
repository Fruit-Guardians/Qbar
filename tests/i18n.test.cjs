const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs')
const root = path.resolve(__dirname, '..'),
  bundle = require('./helpers/bundle.cjs')
const { createLocaleController, resolveLocale, translate, zhCN } = bundle(
  root,
  "export * from '@/shared/i18n/locale'; export {zhCN} from '@/shared/i18n/zh-CN'",
)
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
test('locale resolution accepts only supported saved values and detects Chinese browser variants', () => {
  for (const lang of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans'])
    assert.equal(resolveLocale(null, lang), 'zh-CN')
  for (const lang of ['en', 'en-US', 'de', 'zhack'])
    assert.equal(resolveLocale(null, lang), 'en')
  assert.equal(resolveLocale('en', 'zh-CN'), 'en')
  assert.equal(resolveLocale('zh-CN', 'en'), 'zh-CN')
  for (const value of ['fr', {}, true, '__proto__'])
    assert.equal(resolveLocale(value, 'en'), 'en')
})
test('dictionary has nonempty Chinese resources and exact parameter parity; data placeholders are inserted only once', () => {
  assert.ok(Object.keys(zhCN).length > 450)
  for (const key of [
    'About',
    'General',
    'Language',
    'Send',
    'Settings',
    'Basic',
    'Raw',
    'Pretty',
    'Tree',
    'History',
    'Params',
    'Compare',
    'Requests',
    'Not verified',
  ])
    assert.ok(Object.hasOwn(zhCN, key), key)
  for (const [key, value] of Object.entries(zhCN)) {
    assert.ok(value.trim(), key)
    const slots = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
    assert.deepEqual(slots(value), slots(key), key)
    assert.equal(translate('en', key), key)
  }
  assert.equal(
    translate('zh-CN', 'Copy path {path}', { path: '$["{index}<img>"]' }),
    '复制路径 $["{index}<img>"]',
  )
  for (const value of [
    'toString',
    '__proto__',
    'constructor',
    'GET /?message=Send HTTP/1.1',
    '{"Send":"中文","id":9007199254740993123}',
  ])
    assert.equal(translate('zh-CN', value), value)
})
test('known JSON diagnostics translate without losing positions or changing external diagnostics', () => {
  assert.equal(
    translate('zh-CN', 'Expected a JSON value at line 2, column 4 (offset 9).'),
    '缺少 JSON 值：第 2 行，第 4 列（偏移 9）。',
  )
  assert.match(
    translate(
      'zh-CN',
      'JSON view unavailable: JSON exceeds the 1 MiB tool limit. Raw response preserved.',
    ),
    /JSON 视图不可用.*已保留原始响应/,
  )
  assert.equal(
    translate('zh-CN', 'Server said: Send / Raw'),
    'Server said: Send / Raw',
  )
})
test('saved language hydrates, switches immediately, and writes only a locale preference', async () => {
  const writes = [],
    c = createLocaleController(
      {
        get: async () => ({ uiLanguage: 'zh-CN' }),
        set: async data => writes.push(data),
      },
      'en',
    )
  await c.ready
  assert.equal(c.locale.value, 'zh-CN')
  assert.equal(c.t('Send'), '发送')
  const promise = c.setLocale('en')
  assert.equal(c.t('Send'), 'Send')
  await promise
  assert.deepEqual(writes, [{ uiLanguage: 'en' }])
  assert.equal(c.notice.value, 'Language saved on this device.')
  await c.setLocale('fr')
  assert.equal(c.locale.value, 'en')
  assert.equal(writes.length, 1)
})
test('late storage hydration never overwrites a user selection; concurrent writes preserve final choice', async () => {
  const read = deferred(),
    first = deferred(),
    writes = []
  const c = createLocaleController(
    {
      get: () => read.promise,
      set: data => {
        writes.push(data)
        return writes.length === 1 ? first.promise : Promise.resolve()
      },
    },
    'en',
  )
  const a = c.setLocale('zh-CN'),
    b = c.setLocale('en')
  read.resolve({ uiLanguage: 'zh-CN' })
  await c.ready
  assert.equal(c.locale.value, 'en')
  assert.equal(writes.length, 1)
  first.resolve()
  await Promise.all([a, b])
  assert.deepEqual(writes, [{ uiLanguage: 'zh-CN' }, { uiLanguage: 'en' }])
  assert.equal(c.locale.value, 'en')
})
test('storage failures leave the selected interface usable and allow a later retry', async () => {
  let fail = true
  const c = createLocaleController(
    {
      get: async () => {
        throw Error('offline')
      },
      set: async () => {
        if (fail) throw Error('quota')
      },
    },
    'zh-CN',
  )
  await c.ready
  assert.equal(c.locale.value, 'zh-CN')
  await c.setLocale('en')
  assert.equal(c.locale.value, 'en')
  assert.match(c.notice.value, /Saving failed/)
  fail = false
  await c.setLocale('en')
  assert.equal(c.notice.value, 'Language saved on this device.')
})
test('locale changes never mutate request, response, raw lexemes, keys, credentials or generated payloads', async () => {
  const request = {
    method: 'POST',
    url: 'https://example.com/?q=Send',
    headers: [{ name: 'Authorization', value: 'Bearer Basic' }],
    body: { content: '{"Raw":9007199254740993123,"Load":"中文"}' },
  }
  const response = {
    body: '{"Send":"Request","Send":"Response"}',
    statusMessage: 'OK',
  }
  const before = JSON.stringify({ request, response }),
    c = createLocaleController()
  await c.setLocale('zh-CN')
  assert.equal(c.t('Request'), '请求')
  await c.setLocale('en')
  assert.equal(JSON.stringify({ request, response }), before)
  const tree = fs.readFileSync(
    path.join(root, 'src/features/workbench/components/JsonTree.vue'),
    'utf8',
  )
  assert.match(tree, /\{\{ node.raw \}\}/)
  assert.match(tree, /\{\{ label \}\}/)
  assert.doesNotMatch(tree, /\$t\((node.raw|label)\)/)
  const jwt = fs.readFileSync(
    path.join(root, 'src/features/tools/components/JwtInspector.vue'),
    'utf8',
  )
  assert.match(jwt, /JSON.stringify\(decoded.value.payload/)
})

test('language follows browser only in system mode; fixed choices and remote updates are distinct', async () => {
  const writes = [],
    c = createLocaleController(
      {
        get: async () => ({ uiLanguage: 'system' }),
        set: async value => writes.push(value),
      },
      'en-US',
    )
  await c.ready
  assert.equal(c.mode.value, 'system')
  c.browserLanguageChanged('zh-TW')
  assert.equal(c.locale.value, 'zh-CN')
  assert.equal(writes.length, 0)
  await c.setLocale('en')
  c.browserLanguageChanged('zh-CN')
  assert.equal(c.locale.value, 'en')
  c.receive('zh-CN')
  assert.equal(c.t('Settings'), '设置')
  c.receive('system')
  c.browserLanguageChanged('en-US')
  assert.equal(c.locale.value, 'en')
  assert.deepEqual(writes, [{ uiLanguage: 'en' }])
})
test('disposing language state blocks late storage hydration and browser events', async () => {
  const read = deferred(),
    c = createLocaleController(
      { get: () => read.promise, set: async () => {} },
      'en',
    )
  c.dispose()
  read.resolve({ uiLanguage: 'zh-CN' })
  await c.ready
  c.receive('zh-CN')
  c.browserLanguageChanged('zh-CN')
  await c.setLocale('zh-CN')
  assert.equal(c.locale.value, 'en')
})
