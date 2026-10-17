const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  esbuild = require('esbuild')
const { createRenderer, ref, nextTick } = require('vue')
const root = path.resolve(__dirname, '..')
const code = esbuild.buildSync({
  stdin: {
    contents:
      "export {useRequestHighlight} from '@/features/request/composables/use-request-highlight'",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['vue'],
  alias: { '@': path.join(root, 'src') },
}).outputFiles[0].text
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
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
test('highlight composable tracks source, scroll, resize and composition without modifying native selection or text', async () => {
  const original = global.ResizeObserver
  let resize,
    observed,
    disconnected = false,
    state
  global.ResizeObserver = class {
    constructor(fn) {
      resize = fn
    }
    observe(el) {
      observed = el
    }
    disconnect() {
      disconnected = true
    }
  }
  const input = ref({
      clientWidth: 300,
      clientHeight: 200,
      scrollTop: 54,
      scrollLeft: 25,
      value: 'unchanged',
      selectionStart: 2,
      selectionEnd: 8,
    }),
    source = ref('GET / HTTP/1.1\n\n'),
    preview = { style: {}, scrollTop: 0, scrollLeft: 0 }
  const app = renderer.createApp({
    setup() {
      state = mod.exports.useRequestHighlight(() => source.value, input)
      state.preview.value = preview
      return () => null
    },
  })
  try {
    app.mount({})
    assert.equal(observed, input.value)
    assert.equal(preview.scrollTop, 54)
    assert.equal(preview.scrollLeft, 25)
    assert.equal(preview.style.width, '300px')
    assert.match(state.syntax.value.html, /request-method/)
    input.value.clientWidth = 500
    input.value.scrollTop = 100
    resize()
    assert.equal(preview.style.width, '500px')
    assert.equal(preview.scrollTop, 100)
    source.value = 'POST /api HTTP/1.1\n\n{"n":9007199254740993123}'
    state.composing.value = true
    await nextTick()
    await nextTick()
    assert.match(state.syntax.value.html, /9007199254740993123/)
    assert.equal(input.value.value, 'unchanged')
    assert.equal(input.value.selectionStart, 2)
    assert.equal(input.value.selectionEnd, 8)
    app.unmount()
    assert.equal(disconnected, true)
    input.value.scrollTop = 900
    state.syncScroll()
    assert.equal(preview.scrollTop, 100)
  } finally {
    if (!disconnected) app.unmount()
    global.ResizeObserver = original
  }
})
