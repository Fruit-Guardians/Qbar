const fs = require('node:fs')
const path = require('node:path')

function validateBuild(directory, target, version) {
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8')
  const manifest = JSON.parse(read('manifest.json'))
  if (
    manifest.name !== 'QBar' ||
    manifest.version !== version ||
    manifest.manifest_version !== 3 ||
    manifest.devtools_page !== 'devtools.html'
  )
    throw new Error(
      'Manifest does not match the current QBar version; rebuild.',
    )
  const chrome = manifest.background?.service_worker === 'background.js'
  const firefox =
    manifest.background?.scripts?.[0] === 'background.js' &&
    manifest.browser_specific_settings?.gecko?.id === 'qbar@extensions.local'
  if (
    (target === 'chrome' && (!chrome || firefox)) ||
    (target === 'firefox' && (!firefox || chrome))
  )
    throw new Error('Manifest does not match the requested browser; rebuild.')
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
  ]) {
    const file = path.join(directory, name)
    if (
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      fs.statSync(file).size === 0
    )
      throw new Error(`Missing or empty production asset: ${name}`)
  }
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name)
      if (item.isSymbolicLink())
        throw new Error('Archive source must not contain symbolic links.')
      if (
        item.name.startsWith('.') ||
        item.name.endsWith('.map') ||
        ['node_modules', 'main.html'].includes(item.name)
      )
        throw new Error(`Unexpected development asset: ${item.name}`)
      if (item.isDirectory()) visit(file)
      else if (
        /\.(js|html)$/.test(item.name) &&
        /qbar-ui-preview|Local UI fixture\. No network request was sent\./.test(
          fs.readFileSync(file, 'utf8'),
        )
      )
        throw new Error('Preview adapter found in production assets.')
    }
  }
  visit(directory)
}
module.exports = { validateBuild }
