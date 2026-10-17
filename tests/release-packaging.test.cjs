const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path')
const { validateBuild } = require('../scripts/package-validation.cjs')
const { checkRelease } = require('../scripts/check-release.cjs')
const version = require('../package.json').version
const root = path.resolve(__dirname, '..')
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbar-package-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  for (const name of [
    'devtools.html',
    'devtools.js',
    'panel.html',
    'panel.js',
    'background.js',
    'permissions.html',
    'permissions.js',
    'icon.png',
    'assets/panel.css',
    'assets/tree-sitter.wasm',
    'assets/tree-sitter-bash.wasm',
    'requests/post-form.js',
    'requests/render-response.js',
    'tools/path-test.js',
  ])
    write(name, 'fixture')
  const manifest = {
    name: 'QBar',
    version,
    manifest_version: 3,
    devtools_page: 'devtools.html',
    background: { service_worker: 'background.js' },
  }
  const save = () => write('manifest.json', JSON.stringify(manifest))
  save()
  return { dir, write, manifest, save }
}
test('release metadata requires the exact version tag and matching changelog / notes', t => {
  assert.equal(
    checkRelease(root, `v${version}`),
    `RELEASE METADATA OK v${version}`,
  )
  assert.throws(() => checkRelease(root, 'v9.9.9'), /tag must equal/)
  const { dir, write } = fixture(t)
  write('package.json', JSON.stringify({ version }))
  write('CHANGELOG.md', '# No release entry\n')
  assert.throws(() => checkRelease(dir, `v${version}`), /CHANGELOG/)
  write('CHANGELOG.md', `# Changelog\n\n## ${version}\n`)
  write(`docs/releases/v${version}.md`, '# Wrong title\n')
  assert.throws(() => checkRelease(dir, `v${version}`), /title/)
})
test('packaging rejects stale and wrong-browser manifests', t => {
  const f = fixture(t)
  validateBuild(f.dir, 'chrome', version)
  assert.throws(() => validateBuild(f.dir, 'firefox', version), /browser/)
  f.manifest.version = '9.9.9'
  f.save()
  assert.throws(() => validateBuild(f.dir, 'chrome', version), /version/)
  f.manifest.version = version
  f.manifest.background = { scripts: ['background.js'] }
  f.manifest.browser_specific_settings = {
    gecko: { id: 'qbar@extensions.local' },
  }
  f.save()
  validateBuild(f.dir, 'firefox', version)
  assert.throws(() => validateBuild(f.dir, 'chrome', version), /browser/)
})
test('packaging requires production assets and rejects preview, source maps and symlinks', t => {
  const f = fixture(t)
  fs.rmSync(path.join(f.dir, 'assets/tree-sitter.wasm'))
  assert.throws(
    () => validateBuild(f.dir, 'chrome', version),
    /Missing or empty/,
  )
  f.write('assets/tree-sitter.wasm', 'fixture')
  f.write('panel.js', 'const storageKey="qbar-ui-preview"')
  assert.throws(
    () => validateBuild(f.dir, 'chrome', version),
    /Preview adapter/,
  )
  f.write('panel.js', 'fixture')
  f.write('debug.js.map', '{}')
  assert.throws(
    () => validateBuild(f.dir, 'chrome', version),
    /development asset/,
  )
  fs.rmSync(path.join(f.dir, 'debug.js.map'))
  fs.symlinkSync(path.join(f.dir, 'panel.js'), path.join(f.dir, 'linked.js'))
  assert.throws(() => validateBuild(f.dir, 'chrome', version), /symbolic links/)
})
