const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  sass = require('sass')
const root = path.resolve(__dirname, '..'),
  read = file => fs.readFileSync(path.join(root, file), 'utf8')
const styles = sass.compile(
  path.join(root, 'src/app/styles/design-tokens.scss'),
).css
function tokens(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(escaped + '\\s*\\{([^}]+)\\}').exec(styles)[1]
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [
      m[1],
      m[2].trim(),
    ]),
  )
}
function luminance(hex) {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = [...hex].map(c => c + c).join('')
  return [0, 2, 4]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(n => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0)
}
const contrast = (a, b) => {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
test('shared light/dark visual tokens compile and maintain readable text, selection and syntax contrast', () => {
  const light = tokens('.qbar-app'),
    dark = { ...light, ...tokens('.qbar-app.v-theme--dark') }
  for (const t of [light, dark]) {
    for (const bg of [
      '--native-surface',
      '--native-canvas',
      '--native-toolbar',
    ]) {
      assert.ok(contrast(t['--native-text'], t[bg]) >= 7, `primary text ${bg}`)
      assert.ok(
        contrast(t['--native-muted'], t[bg]) >= 4.5,
        `secondary text ${bg}`,
      )
    }
    assert.ok(
      contrast(t['--native-on-selection'], t['--native-selection']) >= 4.5,
    )
    assert.ok(contrast(t['--native-on-primary'], t['--native-primary']) >= 4.5)
    for (const color of ['key', 'string', 'number', 'literal'])
      assert.ok(
        contrast(t[`--native-json-${color}`], t['--native-surface']) >= 4.5,
        color,
      )
  }
})
test('toolbar is workflow-first, utilities retain each menu and Settings hides unrelated editing controls', () => {
  const app = read('src/app/QBarApp.vue'),
    utilities = read('src/features/tools/components/UtilitiesMenu.vue')
  assert.match(app, /<UtilitiesMenu/)
  assert.match(app, /v-show="!settingsOpen"/)
  for (const name of ['Encoding', 'Hashing', 'Payloads', 'CustomPayload']) {
    assert.match(utilities, new RegExp(`<${name}Menu\\s+submenu`), name)
    assert.match(
      read(`src/features/tools/components/${name}Menu.vue`),
      /:submenu="submenu"/,
    )
  }
  assert.ok(app.split('\n').length < 350)
})
test('Settings and About use semantic surfaces rather than gradients or decorative shadows; tree actions support focus and touch', () => {
  for (const name of ['SettingsPage', 'AboutQBar']) {
    const file = read(`src/app/components/${name}.vue`)
    assert.match(file, /var\(--native-/)
    assert.doesNotMatch(file, /linear-gradient|box-shadow/)
  }
  const css = read('src/app/styles/panel.scss')
  assert.match(css, /:focus-within/)
  assert.match(css, /@media \(hover: none\), \(forced-colors: active\)/)
  assert.match(
    read('src/features/request/components/request-highlight.scss'),
    /12px\/18px Menlo/,
  )
})
