const esbuild = require('esbuild')
const path = require('node:path')
module.exports = async root => {
  const adapter = path.resolve(__dirname, 'native-bash-parser.cjs')
  const { outputFiles } = await esbuild.build({
    stdin: {
      contents:
        "export {importCurl} from '@/features/request/model/curl-import.ts'",
      resolveDir: root,
    },
    bundle: true,
    alias: { '@': path.join(root, 'src') },
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'test-native-parser',
        setup(build) {
          build.onResolve({ filter: /webParser\.js$/ }, () => ({
            path: adapter,
            external: true,
          }))
        },
      },
    ],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(
    require,
    mod,
    mod.exports,
  )
  return mod.exports
}
