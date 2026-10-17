#!/usr/bin/env node
// Dependency-free ZIP packaging, identical output for the same production files.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const root = path.resolve(__dirname, '..')
const target = process.argv[2]
if (!['chrome', 'firefox'].includes(target))
  throw new Error('Expected chrome or firefox.')
const directory = path.join(root, 'dist', target)
const { validateBuild } = require('./package-validation.cjs')
validateBuild(directory, target, require('../package.json').version)
const files = []
function visit(dir) {
  for (const item of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, item.name)
    if (item.isSymbolicLink())
      throw new Error('Archive source must not contain symbolic links.')
    if (item.isDirectory()) visit(file)
    else if (item.isFile()) files.push(file)
  }
}
visit(directory)
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
const crc32 = data => {
  let crc = 0xffffffff
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const local = [],
  central = []
let offset = 0
for (const file of files) {
  const name = Buffer.from(
    path.relative(directory, file).split(path.sep).join('/'),
  )
  const content = fs.readFileSync(file),
    compressed = zlib.deflateRawSync(content),
    crc = crc32(content)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x800, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(33, 12)
  header.writeUInt32LE(crc, 14)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(content.length, 22)
  header.writeUInt16LE(name.length, 26)
  local.push(header, name, compressed)
  const record = Buffer.alloc(46)
  record.writeUInt32LE(0x02014b50)
  record.writeUInt16LE(20, 4)
  record.writeUInt16LE(20, 6)
  record.writeUInt16LE(0x800, 8)
  record.writeUInt16LE(8, 10)
  record.writeUInt16LE(33, 14)
  record.writeUInt32LE(crc, 16)
  record.writeUInt32LE(compressed.length, 20)
  record.writeUInt32LE(content.length, 24)
  record.writeUInt16LE(name.length, 28)
  record.writeUInt32LE(offset, 42)
  central.push(record, name)
  offset += header.length + name.length + compressed.length
}
const index = Buffer.concat(central),
  end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(index.length, 12)
end.writeUInt32LE(offset, 16)
const output = path.join(root, `QBar-${target}.zip`)
fs.writeFileSync(output, Buffer.concat([...local, index, end]))
console.log(`PACKAGED QBar-${target}.zip (${files.length} files)`)
