const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  crypto = require('node:crypto')
const bundle = require('./helpers/bundle.cjs')
const { decodeJwt, jwtDates, verifyJwt, requestBearer, withBearer } = bundle(
  path.resolve(__dirname, '..'),
  "export * from '@/features/tools/model/jwt.ts'",
)
const enc = value =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).toString('base64url')
function token(
  payload = { sub: 'local', exp: 2000 },
  alg = 'HS256',
  extra = {},
) {
  const input = `${enc({ alg, typ: 'JWT', ...extra })}.${enc(payload)}`
  return `${input}.${crypto.createHmac('sha256', 'test-secret').update(input).digest('base64url')}`
}
test('JWT decodes UTF-8 and optional Bearer prefix without changing token bytes', () => {
  const value = token({ message: '你好 🌱', exp: 2000 })
  const decoded = decodeJwt(`  Bearer ${value}  `)
  assert.equal(decoded.token, value)
  assert.equal(decoded.payload.message, '你好 🌱')
  assert.equal(decoded.header.alg, 'HS256')
  const big = token('{"id":9007199254740993123}')
  assert.equal(decodeJwt(big).token, big)
})
test('JWT rejects malformed structure, JWE, non-object / non-UTF8 JSON and oversized input', () => {
  for (const value of [
    '',
    'abc',
    'a.b',
    'a.b.c.d.e',
    `${enc([])}.${enc({})}.AA`,
    `${enc({ alg: 'HS256' })}.${enc('null')}.AA`,
    `${enc({ alg: 'HS256' })}.${Buffer.from([255]).toString('base64url')}.AA`,
    'a'.repeat(65537),
    `${enc({})}.${enc({})}.AA`,
  ])
    assert.throws(() => decodeJwt(value), Error)
})
test('Base64URL rejects padding, standard alphabet, whitespace and noncanonical trailing bits', () => {
  for (const part of ['a', 'AA=', 'A+', 'A/', 'A A', 'AB'])
    assert.throws(() =>
      decodeJwt(`${enc({ alg: 'HS256' })}.${enc({})}.${part}`),
    )
})
test('unsecured / unsupported algorithms can be inspected, never verified as HS256', async () => {
  const value = `${enc({ alg: 'none' })}.${enc({})}.`
  assert.equal(decodeJwt(value).signature.length, 0)
  await assert.rejects(verifyJwt(value, 'HS256', 'secret'), /does not match/)
  await assert.rejects(verifyJwt(token(), 'none', 'secret'), /does not match/)
})
test('HS256 verification detects wrong secrets, payload tampering and missing signatures', async () => {
  const value = token()
  assert.equal(await verifyJwt(value, 'HS256', 'test-secret'), true)
  assert.equal(await verifyJwt(value, 'HS256', 'wrong'), false)
  const parts = value.split('.')
  parts[1] = enc({ sub: 'changed' })
  assert.equal(await verifyJwt(parts.join('.'), 'HS256', 'test-secret'), false)
  await assert.rejects(
    verifyJwt(value, 'RS256', 'test-secret'),
    /does not match/,
  )
  await assert.rejects(verifyJwt(value, 'HS256', ''), /Provide/)
  await assert.rejects(
    verifyJwt(value.replace(/[^.]+$/, ''), 'HS256', 'test-secret'),
    /no signature/,
  )
})
test('explicit algorithm blocks asymmetric-key confusion and unsupported JOSE extensions', async () => {
  for (const extra of [
    { crit: ['custom'] },
    { crit: [] },
    { b64: false },
    { b64: true },
  ])
    await assert.rejects(
      verifyJwt(token({}, 'HS256', extra), 'HS256', 'test-secret'),
      /extensions/,
    )
  await assert.rejects(
    verifyJwt(
      token(),
      'HS256',
      '-----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----',
    ),
    /shared secret/,
  )
  // jku/jwk are ignored: the explicit local key is always required, and no URL is fetched.
  assert.equal(
    await verifyJwt(
      token({}, 'HS256', { jku: 'https://invalid.example/key' }),
      'HS256',
      'test-secret',
    ),
    true,
  )
})
for (const alg of ['RS256', 'ES256'])
  test(`${alg} verifies independent Node signatures using a supplied SPKI public key`, async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync(
      alg === 'RS256' ? 'rsa' : 'ec',
      alg === 'RS256' ? { modulusLength: 2048 } : { namedCurve: 'prime256v1' },
    )
    const input = `${enc({ alg })}.${enc({ sub: 'test' })}`
    const signature = crypto
      .sign('sha256', Buffer.from(input), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64url')
    const pem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
    assert.equal(await verifyJwt(`${input}.${signature}`, alg, pem), true)
    assert.equal(
      await verifyJwt(
        `${enc({ alg })}.${enc({ sub: 'tamper' })}.${signature}`,
        alg,
        pem,
      ),
      false,
    )
    await assert.rejects(
      verifyJwt(`${input}.${signature}`, alg, 'invalid key'),
      /SPKI/,
    )
  })
test('NumericDate uses seconds, exact exp / nbf boundaries, UTC and invalid-type reporting', () => {
  assert.equal(jwtDates({ exp: 1 }, 999)[0].state, 'Not expired')
  assert.equal(jwtDates({ exp: 1 }, 1000)[0].state, 'Expired')
  assert.equal(jwtDates({ nbf: 1 }, 999)[0].state, 'Not active yet')
  assert.equal(jwtDates({ nbf: 1 }, 1000)[0].state, 'Active')
  assert.equal(jwtDates({ iat: 1 }, 1000)[0].date, '1970-01-01T00:00:01.000Z')
  assert.equal(jwtDates({ iat: 2 }, 1000)[0].state, 'Issued in the future')
  for (const value of ['1', null, Infinity, 1e30])
    assert.equal(jwtDates({ exp: value })[0].state, 'Invalid')
  assert.deepEqual(jwtDates({}), [])
})
test('Bearer helper reads only enabled Authorization and replaces duplicates without mutating request', () => {
  const value = token()
  const request = {
    method: 'POST',
    url: 'http://127.0.0.1/',
    body: { content: 'a=1&a=2', enctype: 'application/x-www-form-urlencoded' },
    followRedirect: false,
    headers: [
      {
        name: ' authorization ',
        value: 'Bearer old',
        enabled: false,
        _createdAt: 1,
      },
      {
        name: 'AUTHORIZATION',
        value: `Bearer ${value}`,
        enabled: true,
        _createdAt: 2,
      },
      { name: 'X-Test', value: 'keep', enabled: true, _createdAt: 3 },
    ],
  }
  const original = JSON.stringify(request)
  assert.equal(requestBearer(request), value)
  const changed = withBearer(request, `Bearer ${value}`)
  assert.equal(JSON.stringify(request), original)
  assert.equal(changed.headers.length, 2)
  assert.equal(changed.headers[0].name, 'X-Test')
  assert.equal(changed.headers[1].value, `Bearer ${value}`)
  assert.equal(changed.headers[1].enabled, true)
  assert.equal(changed.body.content, 'a=1&a=2')
  assert.equal(requestBearer({ ...request, headers: [] }), '')
  assert.throws(() => withBearer(request, 'invalid'))
})
