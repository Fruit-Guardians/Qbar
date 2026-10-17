const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path')
const root = path.resolve(__dirname, '..'),
  read = file => fs.readFileSync(path.join(root, file), 'utf8')
test('QBar product identity, panel entry and browser-specific registration are explicit', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.name, 'qbar')
  assert.equal(pkg.displayName, 'QBar')
  assert.equal(pkg.version, '0.2.0')
  assert.ok(
    read('src/entrypoints/devtools.ts').includes(
      "panels.create('QBar', 'icon.png', 'panel.html')",
    ),
  )
  assert.ok(read('panel.html').includes('<title>QBar</title>'))
  assert.ok(
    read('build/plugins/extension-manifest.ts').includes(
      'packageJson.displayName',
    ),
  )
  assert.ok(
    read('build/plugins/extension-manifest.ts').includes(
      'qbar@extensions.local',
    ),
  )
  for (const dir of [
    'src/background-worker',
    'src/components',
    'src/utils',
    'src/processors',
    'src/plugins',
    'src/styles',
    'typings',
  ])
    assert.ok(!fs.existsSync(path.join(root, dir)), dir)
})
test('source is separated into app, features, extension and shared boundaries with explicit processors', () => {
  for (const file of [
    'src/app/QBarApp.vue',
    'src/app/composables/use-panel-workspace.ts',
    'src/app/composables/use-panel-theme.ts',
    'src/app/composables/use-editor-tools.ts',
    'src/features/request/components/BasicRequestEditor.vue',
    'src/features/request/components/CurlImportDialog.vue',
    'src/features/history/components/HistorySidebar.vue',
    'src/extension/background/executors/navigation-executor.ts',
    'src/shared/http-headers.ts',
  ])
    assert.ok(fs.existsSync(path.join(root, file)), file)
  assert.ok(
    !read('src/features/request/processors/index.ts').includes(
      'import.meta.glob',
    ),
  )
  assert.ok(read('src/app/QBarApp.vue').includes('<script setup lang="ts">'))
  assert.ok(!read('src/app/QBarApp.vue').includes('postMessage'))
  assert.ok(read('src/app/QBarApp.vue').split('\n').length < 350)
})
test('runtime injected script names match actual content-script entry paths', () => {
  const background = read('src/extension/background/index.ts'),
    navigation = read(
      'src/extension/background/executors/navigation-executor.ts',
    ),
    menu = read('src/features/tools/components/TestMenu.vue')
  assert.ok(background.includes('requests/render-response.js'))
  assert.ok(navigation.includes('requests/post-form.js'))
  assert.ok(menu.includes('tools/path-test.js'))
  for (const file of [
    'requests/render-response.ts',
    'requests/post-form.ts',
    'tools/path-test.ts',
  ])
    assert.ok(
      fs.existsSync(path.join(root, 'src/extension/content-scripts', file)),
    )
  assert.ok(read('vite.config.ts').includes('/src/extension/content-scripts'))
})
test('QBar provenance and reproducible packaging are documented without old marketplace claims', () => {
  assert.ok(read('NOTICE.md').includes('0140454/hackbar'))
  assert.ok(!read('README.md').includes('ginpbkfigcoaokgflihfhhmglmbchinc'))
  assert.ok(read('README.md').includes('QBar-chrome.zip'))
  assert.ok(read('scripts/package-extension.cjs').includes('deflateRawSync'))
  assert.ok(read('.github/workflows/test_build.yaml').includes('yarn test'))
  assert.ok(read('.github/workflows/release.yaml').includes('QBar-firefox.zip'))
})
test('product source and filenames no longer carry the previous brand; Q vector and PNG are present', () => {
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name)
      assert.ok(!/hackbar/i.test(item.name), file)
      if (item.isDirectory()) visit(file)
      else assert.ok(!/hackbar/i.test(fs.readFileSync(file, 'utf8')), file)
    }
  }
  visit(path.join(root, 'src'))
  const icon = fs.readFileSync(path.join(root, 'public/icon.png'))
  assert.equal(icon.subarray(1, 4).toString(), 'PNG')
  assert.equal(icon.readUInt32BE(16), 128)
  assert.equal(icon.readUInt32BE(20), 128)
  assert.match(read('public/icon.svg'), /viewBox="0 0 128 128"/)
  assert.equal((read('public/icon.svg').match(/<path /g) || []).length, 2)
  assert.doesNotMatch(read('public/icon.svg'), /<circle/)
})
