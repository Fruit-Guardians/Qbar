export const loadFeedback = (message: DevtoolsLoadMessage) => {
  if (message.source === 'captured') return 'Captured page request loaded.'
  if (message.reason === 'partial')
    return 'Request capture is incomplete. Only the URL was loaded; use the DevTools request log or import cURL for the complete request.'
  if (message.source === 'draft')
    return 'URL-only GET draft · headers and body were not captured. Refresh the page, then Load to capture its request.'
  switch (message.reason) {
    case 'permission':
      return 'Site access is missing. Open extension permissions, grant access, then retry Load.'
    case 'unsupported':
      return 'This page is not HTTP/HTTPS. Open a normal webpage to load its request.'
    case 'navigating':
      return 'The page is navigating. Wait for it to finish, then retry Load.'
    default:
      return 'Page information is unavailable. Check site access or reopen DevTools, then retry Load.'
  }
}

// Suppress late loads after a newer load, edits, import, or history restoration.
export function createLoadGuard() {
  let pending: { id: string; fingerprint: string } | undefined
  return {
    begin(id: string, request: BrowseRequest) {
      pending = { id, fingerprint: JSON.stringify(request) }
    },
    accept(id: string | undefined, request: BrowseRequest) {
      if (!pending || id !== pending.id) return false
      const unchanged = pending.fingerprint === JSON.stringify(request)
      pending = undefined
      return unchanged
    },
    clear() {
      pending = undefined
    },
  }
}
