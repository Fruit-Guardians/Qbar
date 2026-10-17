const esbuild = require('esbuild'),
  path = require('node:path')
module.exports = (root, entries) => {
  const code = esbuild.buildSync({
    stdin: { contents: entries, resolveDir: root },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    define: {
      'import.meta.env.VITE_BUILD_TARGET': '"chrome"',
      'import.meta.glob': '__testGlob',
    },
    alias: {
      '@': path.join(root, 'src'),
      'webextension-polyfill': path.resolve(__dirname, 'browser-mock.cjs'),
    },
    external: [path.resolve(__dirname, 'browser-mock.cjs')],
    logLevel: 'silent',
  }).outputFiles[0].text
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports)
  return mod.exports
}
