export const TIMEOUT_OPTIONS = [5000, 10000, 30000, 60000, 120000] as const
export function defaultRequestTimeout(value: unknown): number {
  return typeof value === 'number' && TIMEOUT_OPTIONS.some(n => n === value)
    ? value
    : 30000
}
export function preparePreference(
  key: 'followRedirect' | 'timeoutMs',
  value: unknown,
) {
  if (key === 'followRedirect' && typeof value === 'boolean')
    return {
      request: { followRedirect: value },
      storage: { rawModeFollowRedirect: value },
    }
  if (
    key === 'timeoutMs' &&
    typeof value === 'number' &&
    TIMEOUT_OPTIONS.some(n => n === value)
  )
    return {
      request: { timeoutMs: value },
      storage: { defaultRequestTimeoutMs: value },
    }
  throw new Error('Invalid preference value.')
}
