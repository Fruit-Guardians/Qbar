const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib')
const root = path.resolve(__dirname, '..'),
  read = file => fs.readFileSync(path.join(root, file)),
  svg = read('public/icon.svg').toString()
test('logo uses portable self-contained vector geometry with a transparent background', () => {
  assert.match(svg, /viewBox="0 0 128 128"/)
  assert.equal((svg.match(/<path /g) || []).length, 2)
  for (const color of ['#4285f4', '#34a853']) assert.ok(svg.includes(color))
  assert.doesNotMatch(
    svg,
    /<(?:circle|rect|image|script|foreignObject|filter|linearGradient|text)\b|(?:href|onload)=/,
  )
})
test('extension PNG is a complete 128px RGBA icon with transparent corners and visible artwork', () => {
  const png = read('public/icon.png')
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  let cursor = 8,
    size,
    depth,
    color,
    ended = false
  const chunks = []
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor),
      type = png.toString('ascii', cursor + 4, cursor + 8),
      data = png.subarray(cursor + 8, cursor + 8 + length)
    assert.ok(cursor + 12 + length <= png.length)
    if (type === 'IHDR') {
      size = [data.readUInt32BE(0), data.readUInt32BE(4)]
      depth = data[8]
      color = data[9]
    }
    if (type === 'IDAT') chunks.push(data)
    if (type === 'IEND') ended = true
    cursor += 12 + length
  }
  assert.deepEqual(size, [128, 128])
  assert.equal(depth, 8)
  assert.equal(color, 6)
  assert.ok(ended)
  const decoded = zlib.inflateSync(Buffer.concat(chunks)),
    stride = 128 * 4,
    pixels = Buffer.alloc(128 * stride)
  for (let y = 0; y < 128; y++) {
    const filter = decoded[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0,
        b = y ? pixels[(y - 1) * stride + x] : 0,
        c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      let predictor = 0
      if (filter === 1) predictor = a
      if (filter === 2) predictor = b
      if (filter === 3) predictor = Math.floor((a + b) / 2)
      if (filter === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c)
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      assert.ok(filter <= 4)
      pixels[y * stride + x] =
        (decoded[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  for (const [x, y] of [
    [0, 0],
    [127, 0],
    [0, 127],
    [127, 127],
    [60, 60],
  ])
    assert.equal(pixels[y * stride + x * 4 + 3], 0)
  for (const [x, y, expected] of [
    [60, 22, [66, 133, 244, 255]],
    [102, 102, [52, 168, 83, 255]],
  ])
    assert.deepEqual(
      [...pixels.subarray(y * stride + x * 4, y * stride + x * 4 + 4)],
      expected,
    )
})
test('About, DevTools and manifests keep their existing icon wiring', () => {
  assert.match(
    read('src/app/components/AboutQBar.vue').toString(),
    /src="\/icon.svg"/,
  )
  assert.match(
    read('src/entrypoints/devtools.ts').toString(),
    /'QBar', 'icon.png'/,
  )
  assert.match(
    read('build/plugins/extension-manifest.ts').toString(),
    /'128': 'icon.png'/,
  )
})
test('README header shares exactly the same two mark paths, with accessible self-contained SVG', () => {
  const header = read('docs/assets/qbar-header.svg').toString()
  for (const match of svg.matchAll(/<path[^>]*d="([^"]+)"/g))
    assert.ok(header.includes(match[1]))
  assert.match(header, /<title[^>]*>QBar<\/title>/)
  assert.match(header, /<desc/)
  assert.doesNotMatch(header, /<script|<image|href=/)
  assert.ok(
    read('README.md').toString().includes('docs/assets/qbar-header.svg'),
  )
  assert.ok(!fs.existsSync(path.join(root, 'docs/assets/qbar-header.png')))
})
