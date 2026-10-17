const fs = require('node:fs')
const path = require('node:path')

function checkRelease(root, tag) {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json')),
  ).version
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    version
      .split('.')
      .some(n => Number(n) > 65535 || (n.length > 1 && n.startsWith('0')))
  )
    throw new Error(
      'Expected a stable browser-extension version: major.minor.patch.',
    )
  if (tag !== `v${version}`)
    throw new Error(`Release tag must equal v${version}.`)
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  if (!changelog.includes(`\n## ${version}\n`))
    throw new Error('Version is missing from CHANGELOG.md.')
  const notes = fs.readFileSync(
    path.join(root, 'docs/releases', `${tag}.md`),
    'utf8',
  )
  if (!notes.startsWith(`# QBar ${tag}\n`))
    throw new Error('Release notes title does not match the tag.')
  return `RELEASE METADATA OK ${tag}`
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  const tag = process.argv[2] ?? `v${require('../package.json').version}`
  console.log(checkRelease(root, tag))
}
module.exports = { checkRelease }
