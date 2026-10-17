const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const { createThemePreference, resolveThemeMode } =
  require('./helpers/bundle.cjs')(
    path.resolve(__dirname, '..'),
    "export * from '@/app/model/theme-preference'",
  )
const media = (dark = false) => ({
  matches: dark,
  handlers: new Set(),
  addEventListener(type, fn) {
    this.handlers.add(fn)
  },
  removeEventListener(type, fn) {
    this.handlers.delete(fn)
  },
  change(value) {
    this.matches = value
    for (const fn of this.handlers) fn()
  },
})
const defer = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
test('new themes default to system, valid v2 choices win legacy values and legacy manual choices survive upgrades', () => {
  assert.equal(resolveThemeMode({}), 'system')
  assert.equal(resolveThemeMode({ darkThemeEnabled: false }), 'light')
  assert.equal(resolveThemeMode({ darkThemeEnabled: true }), 'dark')
  assert.equal(
    resolveThemeMode({ uiThemeMode: 'system', darkThemeEnabled: true }),
    'system',
  )
  for (const value of ['auto', '__proto__', null, {}, true])
    assert.equal(
      resolveThemeMode({ uiThemeMode: value, darkThemeEnabled: 'true' }),
      'system',
    )
})
test('system theme reacts without reload or storage writes; fixed light/dark ignore OS changes', async () => {
  const m = media(),
    applied = [],
    writes = [],
    c = createThemePreference(
      { set: async value => writes.push(value) },
      m,
      value => applied.push(value),
    )
  try {
    assert.equal(c.mode.value, 'system')
    assert.equal(applied.at(-1), false)
    m.change(true)
    assert.equal(applied.at(-1), true)
    assert.equal(writes.length, 0)
    await c.select('light')
    m.change(false)
    m.change(true)
    assert.equal(applied.at(-1), false)
    await c.select('dark')
    m.change(false)
    assert.equal(applied.at(-1), true)
    await c.select('system')
    assert.equal(applied.at(-1), false)
    m.change(true)
    assert.equal(applied.at(-1), true)
    assert.deepEqual(writes, [
      { uiThemeMode: 'light' },
      { uiThemeMode: 'dark' },
      { uiThemeMode: 'system' },
    ])
  } finally {
    c.dispose()
  }
})
test('late hydration never overwrites an explicit choice and queued storage events do not flash stale themes', async () => {
  const first = defer(),
    writes = [],
    m = media(),
    applied = [],
    c = createThemePreference(
      {
        set: data => {
          writes.push(data)
          return writes.length === 1 ? first.promise : Promise.resolve()
        },
      },
      m,
      v => applied.push(v),
    )
  const a = c.select('dark'),
    b = c.select('light')
  await Promise.resolve()
  await Promise.resolve()
  c.hydrate({ uiThemeMode: 'dark' })
  c.receive('dark')
  assert.equal(c.mode.value, 'light')
  assert.equal(applied.at(-1), false)
  first.resolve()
  await Promise.all([a, b])
  assert.deepEqual(writes, [{ uiThemeMode: 'dark' }, { uiThemeMode: 'light' }])
  c.receive('system')
  m.change(true)
  assert.equal(applied.at(-1), true)
  c.dispose()
})
test('theme save errors are visible, retry works and no request data is written', async () => {
  let failed = true
  const writes = [],
    c = createThemePreference(
      {
        set: async value => {
          writes.push(value)
          if (failed) throw Error('quota')
        },
      },
      media(),
      () => {},
    )
  await c.select('dark')
  assert.equal(c.mode.value, 'dark')
  assert.match(c.notice.value, /Saving failed/)
  failed = false
  await c.select('dark')
  assert.match(c.notice.value, /saved/)
  await c.select('invalid')
  assert.equal(writes.length, 2)
  assert.deepEqual(Object.keys(writes[0]), ['uiThemeMode'])
  c.dispose()
})
test('theme listeners are removed and late completions never mutate a closed panel', async () => {
  const pending = defer(),
    m = media(),
    applied = [],
    c = createThemePreference({ set: () => pending.promise }, m, v =>
      applied.push(v),
    )
  const save = c.select('dark')
  c.dispose()
  assert.equal(m.handlers.size, 0)
  const count = applied.length
  c.hydrate({ uiThemeMode: 'light' })
  c.receive('light')
  m.change(true)
  await c.select('system')
  pending.resolve()
  await save
  assert.equal(applied.length, count)
})
