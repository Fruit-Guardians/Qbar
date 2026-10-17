const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const { createPanelConnection, createLoadGuard, loadFeedback } = bundle(
  path.resolve(__dirname, '..'),
  `
export { createPanelConnection } from '@/app/composables/panel-connection.ts'
export { createLoadGuard, loadFeedback } from '@/features/request/model/load-feedback.ts'
`,
)
const event = () => ({
  handlers: new Set(),
  addListener(fn) {
    this.handlers.add(fn)
  },
  removeListener(fn) {
    this.handlers.delete(fn)
  },
  emit(value) {
    for (const fn of [...this.handlers]) fn(value)
  },
})
function fixture(fail = 0) {
  let now = 0,
    id = 0
  const timers = new Map(),
    ports = [],
    states = [],
    received = []
  const client = createPanelConnection({
    tabId: 10,
    connect() {
      if (fail-- > 0) throw Error('worker unavailable')
      const p = {
        onMessage: event(),
        onDisconnect: event(),
        sent: [],
        disconnects: 0,
        postMessage(m) {
          if (this.fail) throw Error('disconnected')
          this.sent.push(m)
        },
        disconnect() {
          this.disconnects++
        },
      }
      ports.push(p)
      return p
    },
    onState: s => states.push(s),
    onMessage: m => received.push(m),
    schedule: (fn, ms) => {
      const key = ++id
      timers.set(key, { fn, at: now + ms })
      return key
    },
    unschedule: key => timers.delete(key),
  })
  const advance = ms => {
    now += ms
    for (const [key, t] of [...timers])
      if (t.at <= now) {
        timers.delete(key)
        t.fn()
      }
  }
  return { client, ports, states, received, timers, advance }
}
test('connection requires ready handshake and retries without replaying a request', () => {
  const f = fixture()
  f.client.start()
  const old = f.ports[0]
  assert.deepEqual(old.sent, [{ type: 'init', tabId: 10 }])
  assert.equal(f.client.send({ type: 'execute' }), false)
  old.onMessage.emit({ type: 'ready' })
  assert.equal(f.states.at(-1), 'connected')
  assert.equal(f.client.send({ type: 'execute', requestId: 'once' }), true)
  old.onDisconnect.emit()
  old.onDisconnect.emit()
  assert.equal(f.states.at(-1), 'reconnecting')
  assert.equal(old.onMessage.handlers.size, 0)
  assert.equal(old.onDisconnect.handlers.size, 0)
  f.advance(499)
  assert.equal(f.ports.length, 1)
  f.advance(1)
  assert.equal(f.ports.length, 2)
  assert.deepEqual(f.ports[1].sent, [{ type: 'init', tabId: 10 }])
  f.ports[1].onMessage.emit({ type: 'ready' })
  assert.equal(f.timers.size, 0)
  f.client.dispose()
  assert.equal(f.ports[1].onMessage.handlers.size, 0)
})
test('failed connects use bounded exponential backoff and manual reconnect cancels retries', () => {
  const f = fixture(9)
  f.client.start()
  for (const delay of [500, 1000, 2000, 4000, 8000, 10000]) f.advance(delay)
  assert.equal(f.states.at(-1), 'offline')
  assert.equal(f.timers.size, 1)
  const remaining = [...f.timers.values()][0].at
  f.client.dispose()
  f.advance(100000)
  assert.equal(f.ports.length, 0)
  assert.equal(f.timers.size, 0)
  assert.ok(remaining > 0)
  const g = fixture()
  g.client.start()
  g.ports[0].onDisconnect.emit()
  g.client.reconnect()
  assert.equal(g.ports.length, 2)
  g.ports[1].onMessage.emit({ type: 'ready' })
  g.advance(100000)
  assert.equal(g.ports.length, 2)
  g.client.dispose()
})
test('silent handshake and postMessage failure reconnect asynchronously with no recursion or action replay', () => {
  const f = fixture()
  f.client.start()
  f.advance(5000)
  assert.equal(f.ports.length, 1)
  f.advance(500)
  assert.equal(f.ports.length, 2)
  f.ports[1].onMessage.emit({ type: 'ready' })
  f.ports[1].fail = true
  assert.equal(f.client.send({ type: 'render', data: 'never replay' }), false)
  f.advance(500)
  assert.equal(f.ports.length, 3)
  assert.deepEqual(f.ports[2].sent, [{ type: 'init', tabId: 10 }])
  f.client.dispose()
  assert.equal(f.timers.size, 0)
})
const request = () => ({
  url: 'https://fixture.test/',
  method: 'GET',
  headers: [],
  body: { content: '', enctype: 'application/x-www-form-urlencoded' },
  followRedirect: false,
})
test('load guard rejects superseded responses and preserves edits, history and import state', () => {
  const guard = createLoadGuard(),
    r = request()
  guard.begin('a', r)
  guard.begin('b', r)
  assert.equal(guard.accept('a', r), false)
  assert.equal(guard.accept('b', r), true)
  assert.equal(guard.accept('b', r), false)
  guard.begin('c', r)
  r.body.content = 'user edit'
  assert.equal(guard.accept('c', r), false)
  guard.begin('d', r)
  guard.clear()
  assert.equal(guard.accept('d', r), false)
  assert.equal(guard.accept(undefined, r), false)
})
test('feedback distinguishes real capture, URL-only draft, unsupported page, permission and navigation', () => {
  assert.match(loadFeedback({ source: 'draft' }), /URL-only GET draft/)
  assert.match(loadFeedback({ source: 'captured' }), /Captured/)
  assert.match(loadFeedback({ reason: 'permission' }), /Site access/)
  assert.match(loadFeedback({ reason: 'unsupported' }), /not HTTP/)
  assert.match(loadFeedback({ reason: 'navigating' }), /navigating/)
  assert.match(loadFeedback({ reason: 'unavailable' }), /unavailable/)
})
