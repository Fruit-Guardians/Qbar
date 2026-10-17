/** Capture availability is separate from an actual zero-byte HTTP body. */
export function responseBodyState(response: {
  body: string
  bodyUnavailable?: boolean
}): 'available' | 'empty' | 'unavailable' {
  return response.bodyUnavailable
    ? 'unavailable'
    : response.body.length === 0
      ? 'empty'
      : 'available'
}
