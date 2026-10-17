const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
const bundle = require('./helpers/bundle.cjs')
const { presentResponse } = bundle(
  path.resolve(__dirname, '..'),
  "export { presentResponse } from '@/features/request/model/response-presentation.ts'",
)
const response = (body, type = 'application/json') => ({
  protocolVersion: 'HTTP/1.1',
  statusCode: 200,
  statusMessage: 'OK',
  headers: [{ name: 'Content-Type', value: type }],
  body,
  baseUrl: 'https://fixture.test',
})
test('response formatting is display-only and preserves large numbers, duplicate keys and array order', () => {
  const r = response('{"id":9007199254740993123,"id":2,"items":[3,1,2]}'),
    before = structuredClone(r)
  const view = presentResponse(r)
  assert.equal(view.node.kind, 'object')
  assert.equal(view.node.children.length, 3)
  assert.match(view.prettyBody, /9007199254740993123/)
  assert.match(view.prettyBody, /"id": 2/)
  assert.match(view.prettyBody, /3,\n\s+1,\n\s+2/)
  assert.deepEqual(r, before)
})
test('response structure supports +json, missing JSON content type, array and primitive roots', () => {
  for (const [body, type] of [
    ['[1,{"a":true}]', 'application/problem+json; charset=utf-8'],
    ['{"ok":true}', 'text/plain'],
    ['null', 'application/json'],
    ['"hello"', 'application/json'],
    ['9007199254740993123', 'application/json'],
  ]) {
    const view = presentResponse(response(body, type))
    assert.ok(view.node)
    assert.equal(view.notice, '')
  }
})
test('invalid or truncated JSON, unavailable bodies and limits preserve the raw response', () => {
  for (const body of [
    '{"broken":',
    '['.repeat(65) + '0' + ']'.repeat(65),
    '{"text":"' + 'a'.repeat(1024 * 1024) + '"}',
  ]) {
    const r = response(body),
      view = presentResponse(r)
    assert.equal(view.node, undefined)
    assert.match(view.notice, /Raw response preserved/)
    assert.equal(r.body, body)
  }
  assert.match(
    presentResponse({ ...response('{"hidden":true}'), bodyUnavailable: true })
      .notice,
    /unavailable/,
  )
  assert.equal(
    presentResponse(response('', 'application/json')).node,
    undefined,
  )
})
test('HTML and plain-text responses stay raw, and HTML-like JSON is never rendered as markup by the tree', () => {
  for (const body of ['<h1>hello</h1>', 'plain text response']) {
    const view = presentResponse(response(body, 'text/html'))
    assert.equal(view.node, undefined)
    assert.equal(view.notice, '')
  }
  const view = presentResponse(
    response('{"text":"<img src=x onerror=alert(1)>"}'),
  )
  assert.equal(view.node.children[0].node.raw, '"<img src=x onerror=alert(1)>"')
})
