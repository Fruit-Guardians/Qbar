const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
test('address-bar send retains empty URL, disconnected and in-flight guards', () => {
  const app = read('src/app/QBarApp.vue')
  const send = read('src/features/request/components/SendAction.vue')
  assert.equal((app.match(/<SendAction/g) || []).length, 1)
  assert.match(send, /disabled \|\| sending \|\| !url.trim\(\)/)
  assert.equal(
    (app.match(/:disabled="connectionState !== 'connected'"/g) || []).length,
    1,
  )
  assert.equal((app.match(/@send="execute"/g) || []).length, 1)
  assert.doesNotMatch(app, /class="send-button"/)
})
test('configuration panels retain drafts and expose keyboard-accessible tabs', () => {
  const source = read('src/features/request/components/BasicRequestEditor.vue')
  for (const tab of ['Params', 'Headers', 'Body']) {
    assert.ok(source.includes(`v-show="activeTab === '${tab}'"`))
    assert.ok(source.includes(`id="config-panel-${tab}"`))
  }
  assert.match(source, /role="tablist"/)
  assert.match(source, /:aria-controls=/)
  assert.match(source, /ArrowLeft.*ArrowRight.*Home.*End/)
  assert.match(source, /<QueryEditor/)
  assert.match(source, /@update="request.url = \$event"/)
})
test('basic and raw response views share the existing response renderer', () => {
  for (const file of ['BasicRequestEditor.vue', 'RawRequestEditor.vue']) {
    const source = read('src/features/request/components/' + file)
    assert.match(source, /<ResponseContent/)
    assert.match(source, /:response="response"/)
    assert.match(source, /<slot name="actions"/)
  }
})
