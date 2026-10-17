/** Local inspection of compact JWS JWTs. Decoding is not authentication. */
export type JwtObject = Record<string, unknown>
export type JwtAlgorithm = 'HS256' | 'RS256' | 'ES256'
const decoder = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid Base64URL encoding.')
  }
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  // Reject non-canonical trailing bits instead of accepting ambiguous tokens.
  const canonical = btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  if (canonical !== value) throw new Error('Invalid Base64URL trailing bits.')
  return bytes
}

function jsonObject(segment: string, label: string): JwtObject {
  try {
    const value: unknown = JSON.parse(decoder.decode(decodeBase64Url(segment)))
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JwtObject
    }
  } catch {
    throw new Error(`${label} must be a Base64URL-encoded UTF-8 JSON object.`)
  }
  throw new Error(`${label} must be a JSON object.`)
}

export function decodeJwt(input: string) {
  const token = input.trim().replace(/^Bearer\s+/i, '')
  if (token.length > 65536)
    throw new Error('Token exceeds the 64 KiB inspection limit.')
  const parts = token.split('.')
  if (parts.length === 5)
    throw new Error(
      'Encrypted JWT (JWE): decryption is not available in this inspector.',
    )
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Expected a compact JWT: header.payload.signature.')
  }
  const header = jsonObject(parts[0], 'Header')
  const payload = jsonObject(parts[1], 'Payload')
  if (typeof header.alg !== 'string' || !header.alg)
    throw new Error('Header must declare an algorithm (alg).')
  const signature = decodeBase64Url(parts[2])
  return {
    token,
    header,
    payload,
    signature,
    signingInput: `${parts[0]}.${parts[1]}`,
  }
}

export function jwtDates(payload: JwtObject, now = Date.now()) {
  return (['exp', 'nbf', 'iat'] as const)
    .filter(name => name in payload)
    .map(name => {
      const value = payload[name]
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.abs(value * 1000) > 8.64e15
      ) {
        return { name, date: 'Invalid NumericDate', state: 'Invalid' }
      }
      return {
        name,
        date: new Date(value * 1000).toISOString(),
        state:
          name === 'exp'
            ? now >= value * 1000
              ? 'Expired'
              : 'Not expired'
            : name === 'nbf'
              ? now < value * 1000
                ? 'Not active yet'
                : 'Active'
              : now < value * 1000
                ? 'Issued in the future'
                : 'Issued',
      }
    })
}

function publicKeyBytes(pem: string): Uint8Array<ArrayBuffer> {
  const match = pem
    .trim()
    .match(
      /^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PUBLIC KEY-----$/,
    )
  if (!match)
    throw new Error('Provide an SPKI PEM public key (BEGIN PUBLIC KEY).')
  try {
    return Uint8Array.from(atob(match[1].replace(/\s/g, '')), c =>
      c.charCodeAt(0),
    )
  } catch {
    throw new Error('Invalid PEM public key encoding.')
  }
}

export async function verifyJwt(
  input: string,
  algorithm: JwtAlgorithm,
  material: string,
) {
  const jwt = decodeJwt(input)
  if (jwt.header.alg !== algorithm)
    throw new Error('Token algorithm does not match the selected algorithm.')
  if (Object.hasOwn(jwt.header, 'crit') || Object.hasOwn(jwt.header, 'b64')) {
    throw new Error(
      'Critical / b64 header extensions are not supported for verification.',
    )
  }
  if (!material.trim()) throw new Error('Provide a secret or public key.')
  if (!jwt.signature.length) throw new Error('Token has no signature.')
  const subtle = globalThis.crypto.subtle
  let key: CryptoKey
  let parameters: AlgorithmIdentifier | EcdsaParams
  if (algorithm === 'HS256') {
    if (/-----BEGIN [A-Z ]*KEY-----/.test(material))
      throw new Error('HS256 expects a shared secret, not a PEM key.')
    key = await subtle.importKey(
      'raw',
      encoder.encode(material),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    parameters = 'HMAC'
  } else if (algorithm === 'RS256') {
    key = await subtle.importKey(
      'spki',
      publicKeyBytes(material),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    parameters = 'RSASSA-PKCS1-v1_5'
  } else if (algorithm === 'ES256') {
    key = await subtle.importKey(
      'spki',
      publicKeyBytes(material),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    parameters = { name: 'ECDSA', hash: 'SHA-256' }
  } else {
    throw new Error('Select HS256, RS256 or ES256.')
  }
  // Only signature integrity is checked; issuer, audience and time are separate.
  return subtle.verify(
    parameters,
    key,
    jwt.signature,
    encoder.encode(jwt.signingInput),
  )
}

export function requestBearer(request: BrowseRequest) {
  return (
    request.headers
      .find(
        h =>
          h.enabled &&
          h.name.trim().toLowerCase() === 'authorization' &&
          /^Bearer\s+/i.test(h.value.trim()),
      )
      ?.value.trim()
      .replace(/^Bearer\s+/i, '') || ''
  )
}

export function withBearer(
  request: BrowseRequest,
  input: string,
): BrowseRequest {
  const { token } = decodeJwt(input)
  const current = request.headers.find(
    h => h.name.trim().toLowerCase() === 'authorization',
  )
  const header: Header = {
    name: 'Authorization',
    value: `Bearer ${token}`,
    enabled: true,
    removeIfEmptyValue: false,
    _createdAt: current?._createdAt ?? Date.now() * 1000,
  }
  return {
    ...request,
    headers: [
      ...request.headers.filter(
        h => h.name.trim().toLowerCase() !== 'authorization',
      ),
      header,
    ],
  }
}

/** Editing claims invalidates the existing signature; keep it visibly unverified. */
export function rewriteJwt(
  input: string,
  headerText: string,
  payloadText: string,
): string {
  const parsed = decodeJwt(input)
  if (headerText.length + payloadText.length > 48000)
    throw Error('Token exceeds the 64 KiB inspection limit.')
  const encode = (text: string) =>
    btoa(
      Array.from(new TextEncoder().encode(text), b =>
        String.fromCharCode(b),
      ).join(''),
    )
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const token = `${encode(headerText)}.${encode(payloadText)}.${parsed.token.split('.')[2]}`
  decodeJwt(token)
  return token
}
