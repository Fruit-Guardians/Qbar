const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const {
  applyAuth,
  applyCookiePolicy,
  prepareExecutionRequest,
  decodeJwt,
  rewriteJwt,
  comparisonPaths,
  compareBodies,
  EvidenceStore,
  exportEvidence,
  evidenceReport,
} = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/request/model/session-controls';export * from '@/features/request/model/request';export * from '@/features/tools/model/jwt';export * from '@/features/workbench/model/response-compare';export * from '@/features/evidence/model/evidence-store'",
)
const header = (name, value) => ({
  name,
  value,
  enabled: true,
  removeIfEmptyValue: false,
  _createdAt: 1,
})
const request = () => ({
  method: 'POST',
  url: 'http://127.0.0.1:8894/echo',
  headers: [
    header('Authorization', 'old'),
    header('authorization', 'duplicate'),
    header('Cookie', 'sid=old'),
  ],
  body: {
    enctype: 'application/x-www-form-urlencoded',
    content: 'name=%E4%BD%A0%E5%A5%BD&n=1',
  },
  followRedirect: false,
  timeoutMs: 5000,
})
test('auth replaces duplicate headers case-insensitively without mutating original draft', () => {
  const r = request(),
    value = applyAuth(r, 'bearer', { token: 'dummy-token' })
  assert.equal(r.headers.length, 3)
  assert.equal(
    value.headers.filter(h => h.name.toLowerCase() === 'authorization').length,
    1,
  )
  assert.equal(value.headers.at(-1).value, 'Bearer dummy-token')
  assert.equal(value.headers[0].name, 'Cookie')
  assert.equal(applyAuth(r, 'none', {}).headers.length, 1)
})
test('basic auth uses UTF-8 and rejects colon username and header injection', () => {
  const auth = applyAuth(request(), 'basic', {
    username: '用户',
    password: '密码:ok',
  }).headers.at(-1).value
  assert.equal(
    Buffer.from(auth.slice(6), 'base64').toString('utf8'),
    '用户:密码:ok',
  )
  assert.throws(() => applyAuth(request(), 'basic', { username: 'bad:name' }))
  for (const token of ['', 'bad\r\nCookie: attack', 'a b'])
    assert.throws(() => applyAuth(request(), 'bearer', { token }))
  for (const name of ['Cookie', 'Host', 'bad:name', 'Content-Length'])
    assert.throws(() => applyAuth(request(), 'custom', { name, value: 'x' }))
  assert.throws(() =>
    applyAuth(request(), 'custom', { name: 'X-Key', value: 'a\nb' }),
  )
})
test('cookie omit removes explicit and ambient cookies, forces Fetch and preserves Basic form content type', () => {
  const r = request(),
    draft = applyCookiePolicy(r, 'omit', 'ignored'),
    out = prepareExecutionRequest(draft, false)
  assert.equal(r.headers.at(-1).value, 'sid=old')
  assert.equal(out.rawMode, true)
  assert.deepEqual(
    out.request.headers
      .filter(h => h.name.toLowerCase() === 'cookie')
      .map(h => [h.value, h.removeIfEmptyValue]),
    [['', true]],
  )
  assert.equal(
    out.request.headers.find(h => h.name.toLowerCase() === 'content-type')
      .value,
    'application/x-www-form-urlencoded',
  )
  assert.equal(out.request.body.content, r.body.content)
  draft.headers.push(header('Cookie', 'attempted-late-edit'))
  assert.equal(
    prepareExecutionRequest(draft, false).request.headers.filter(
      h => h.name.toLowerCase() === 'cookie',
    ).length,
    1,
  )
})
test('explicit override forces isolated replay; default preserves current headers and legacy transport', () => {
  const r = request(),
    draft = applyCookiePolicy(r, 'override', 'sid=explicit')
  assert.equal(prepareExecutionRequest(draft, false).rawMode, true)
  assert.equal(draft.headers.at(-1).value, 'sid=explicit')
  assert.equal(
    applyCookiePolicy(draft, 'default', '').headers.at(-1).value,
    'sid=explicit',
  )
  assert.equal(prepareExecutionRequest(request(), false).rawMode, false)
  assert.throws(() => applyCookiePolicy(r, 'override', 'a\rb'))
})
const encode = v => Buffer.from(v).toString('base64url')
test('JWT local rewrite preserves exact duplicate claims and large-number token spelling; original signature stays visibly invalid', () => {
  const token = `${encode('{"alg":"HS256"}')}.${encode('{"sub":"old"}')}.AA`
  const payload = '{"id":9007199254740993123,"id":1.230e+99,"sub":"你好"}'
  const rewritten = rewriteJwt(token, '{"alg":"HS256"}', payload)
  assert.equal(
    Buffer.from(rewritten.split('.')[1], 'base64url').toString(),
    payload,
  )
  assert.equal(rewritten.split('.')[2], 'AA')
  assert.equal(decodeJwt(rewritten).header.alg, 'HS256')
  assert.throws(() => rewriteJwt(token, '[]', payload))
  assert.throws(() => rewriteJwt(token, '{"alg":"HS256"}', 'oops'))
})
test('JSON comparison ignores exact paths/key order but not duplicate keys, array indices or numeric tokens', () => {
  const paths = comparisonPaths('/timestamp, /meta/requestId\n/a~1b')
  const a =
    '{"timestamp":1,"v":9007199254740993123,"meta":{"requestId":"a"},"a/b":1}'
  const b = '{"meta":{"requestId":"b"},"v":9007199254740993123,"timestamp":2}'
  let diff = compareBodies(a, b, paths)
  assert.equal(diff.before, diff.after)
  diff = compareBodies('{"v":1,"v":2}', '{"v":2,"v":1}', [])
  assert.notEqual(diff.before, diff.after)
  diff = compareBodies('{"v":1.0}', '{"v":1}', [])
  assert.notEqual(diff.before, diff.after)
  diff = compareBodies('[1,2]', '[9,2]', ['/0'])
  assert.equal(diff.before, diff.after)
  diff = compareBodies('plain a', 'plain b', paths)
  assert.equal(diff.json, false)
  assert.equal(diff.before, 'plain a')
  for (const p of ['timestamp', '/~9', Array(51).fill('/x').join(',')])
    assert.throws(() => comparisonPaths(p))
})
function store() {
  let saved = {}
  return new EvidenceStore({
    get: async () => structuredClone(saved),
    set: async v => {
      saved = structuredClone(v)
    },
  })
}
const exchange = () => ({
  request: request(),
  response: {
    statusCode: 200,
    statusMessage: 'OK',
    protocolVersion: 'HTTP/1.1',
    baseUrl: 'http://127.0.0.1:8894',
    body: '{"secret":"private"}',
    headers: [{ name: 'Set-Cookie', value: 'sid=private' }],
  },
  durationMs: 10,
})
test('comparison evidence snapshots baseline, tags and reproduction, update preserves comparison, default report omits all secrets', async () => {
  const s = store(),
    baseline = exchange(),
    current = exchange()
  let snapshot = await s.action({
    action: 'save',
    exchange: current,
    title: 'private-title',
    notes: 'private-note',
    tags: ['private-tag'],
    reproduction: 'private-steps',
    comparison: { baseline, ignorePaths: ['/timestamp'] },
  })
  baseline.request.headers[0].value = 'changed'
  const e = snapshot.entries[0]
  assert.equal(e.comparison.baseline.request.headers[0].value, 'old')
  snapshot = await s.action({
    action: 'update',
    id: e.id,
    title: e.title,
    notes: 'updated',
    tags: ['api'],
    reproduction: 'steps',
    expectedRevision: snapshot.revision,
  })
  assert.equal(snapshot.entries[0].comparison.ignorePaths[0], '/timestamp')
  const redacted = exportEvidence(snapshot.entries[0]),
    report = evidenceReport(e)
  for (const secret of [
    'sid=private',
    'private-title',
    'private-note',
    'private-tag',
    'private-steps',
    '"secret"',
  ]) {
    assert.ok(!redacted.includes(secret))
    assert.ok(!report.includes(secret))
  }
  assert.match(evidenceReport(e, false), /private-steps/)
})
test('evidence metadata rejects oversized or invalid tags and comparison paths without corrupting existing state', async () => {
  const s = store(),
    args = { action: 'save', exchange: exchange(), title: 'ok', notes: '' }
  await assert.rejects(s.action({ ...args, tags: ['x'.repeat(33)] }))
  await assert.rejects(
    s.action({
      ...args,
      comparison: { baseline: exchange(), ignorePaths: ['bad'] },
    }),
  )
  assert.equal((await s.action({ action: 'list' })).entries.length, 0)
  const old = await s.action(args)
  assert.deepEqual(old.entries[0].tags, [])
})

test('request editor remounts on tab change and clears unapplied auth on URL change', () => {
  const fs = require('node:fs')
  const root = fs.readFileSync(
    path.resolve(__dirname, '../src/app/QBarApp.vue'),
    'utf8',
  )
  assert.match(root, /<component[\s\S]*?:key="tabs.active.value"/)
  const session = fs.readFileSync(
    path.resolve(
      __dirname,
      '../src/features/request/components/SessionEditor.vue',
    ),
    'utf8',
  )
  assert.match(session, /\(\) => \[props.request, props.request.url\]/)
})
