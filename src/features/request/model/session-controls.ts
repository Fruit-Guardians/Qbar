export type AuthMode = 'bearer' | 'basic' | 'custom' | 'none'
export type CookiePolicy = 'default' | 'omit' | 'override'
export function applyAuth(
  source: BrowseRequest,
  mode: AuthMode,
  values: {
    token?: string
    username?: string
    password?: string
    name?: string
    value?: string
  },
): BrowseRequest {
  const result: BrowseRequest = JSON.parse(JSON.stringify(source))
  const name = mode === 'custom' ? (values.name || '').trim() : 'Authorization'
  if (
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
    ['cookie', 'host', 'content-length', 'transfer-encoding'].includes(
      name.toLowerCase(),
    )
  )
    throw Error('Invalid authentication header name.')
  let value = ''
  if (mode === 'bearer') {
    if (!values.token?.trim() || /\s/.test(values.token.trim()))
      throw Error('Bearer token must be non-empty and contain no whitespace.')
    value = `Bearer ${values.token.trim()}`
  } else if (mode === 'basic') {
    if ((values.username || '').includes(':'))
      throw Error('Basic username must not contain a colon.')
    const bytes = new TextEncoder().encode(
      `${values.username || ''}:${values.password || ''}`,
    )
    value = `Basic ${btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))}`
  } else if (mode === 'custom') value = values.value || ''
  if (/[\r\n\0]/.test(value))
    throw Error('Authentication value must not contain line breaks.')
  result.headers = result.headers.filter(
    h => h.name.toLowerCase() !== name.toLowerCase(),
  )
  if (mode !== 'none')
    result.headers.push({
      name,
      value,
      enabled: true,
      removeIfEmptyValue: false,
      _createdAt: Date.now(),
    })
  return result
}
/** Explicit policies force isolated Fetch replay; they never write the browser cookie jar. */
export function applyCookiePolicy(
  source: BrowseRequest,
  policy: CookiePolicy,
  value: string,
): BrowseRequest {
  if (!['default', 'omit', 'override'].includes(policy))
    throw Error('Invalid cookie policy.')
  if (policy === 'override' && /[\r\n\0]/.test(value))
    throw Error('Cookie value must not contain line breaks.')
  const result: BrowseRequest = JSON.parse(JSON.stringify(source))
  result.cookiePolicy = policy
  if (policy !== 'default') {
    result.headers = result.headers.filter(
      h => h.name.toLowerCase() !== 'cookie',
    )
    result.headers.push({
      name: 'Cookie',
      value: policy === 'override' ? value : '',
      enabled: true,
      removeIfEmptyValue: policy === 'omit',
      _createdAt: Date.now(),
    })
  }
  return result
}
