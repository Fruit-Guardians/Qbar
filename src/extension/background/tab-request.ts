import browser from 'webextension-polyfill'
import store from './session-store'
import { requestTarget } from '@/features/request/model/request'
import { checkExtensionPermission } from '@/shared/lib/browser'

// A URL-only draft is never described as a captured request.
export async function loadTabRequest(
  tabId: number,
  draftOnly = false,
): Promise<Omit<DevtoolsLoadMessage, 'loadId'>> {
  const empty = (reason: DevtoolsLoadMessage['reason']) => ({
    type: 'load' as const,
    data: undefined,
    reason,
  })
  try {
    const tab = await browser.tabs.get(tabId)
    const url = tab.pendingUrl || tab.url
    if (url && !/^https?:\/\//i.test(url)) return empty('unsupported')
    if (!(await checkExtensionPermission())) return empty('permission')
    if (!url) return empty('unavailable')
    const captured = draftOnly ? undefined : await store.getBrowseRequest(tabId)
    const current = await browser.tabs.get(tabId)
    if (
      requestTarget(current.pendingUrl || current.url || '') !==
      requestTarget(url)
    )
      return empty('navigating')
    if (current.status === 'loading' && !draftOnly) return empty('navigating')
    if (
      captured &&
      store.captureComplete(tabId) &&
      requestTarget(captured.url) === requestTarget(url)
    ) {
      return { type: 'load', data: captured, source: 'captured' }
    }
    return {
      type: 'load',
      source: 'draft',
      reason:
        captured && requestTarget(captured.url) === requestTarget(url)
          ? 'partial'
          : 'no-record',
      data: {
        method: 'GET',
        url,
        headers: [],
        body: { content: '', enctype: 'application/x-www-form-urlencoded' },
        followRedirect: false,
        timeoutMs: 30000,
      },
    }
  } catch (_) {
    return empty('unavailable')
  }
}

export async function reloadTabRequest(tabId: number) {
  const initial = await loadTabRequest(tabId, true)
  if (!initial.data) return initial
  try {
    await new Promise<void>((resolve, reject) => {
      let finished = false
      let sawLoading = false
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        browser.tabs.onUpdated.removeListener(updated)
        if (error) reject(error)
        else resolve()
      }
      const updated = (
        id: number,
        change: browser.Tabs.OnUpdatedChangeInfoType,
      ) => {
        if (id !== tabId) return
        if (change.status === 'loading') sawLoading = true
        if (sawLoading && change.status === 'complete') finish()
      }
      const timer = setTimeout(
        () => finish(new Error('Page reload timed out.')),
        15000,
      )
      browser.tabs.onUpdated.addListener(updated)
      browser.tabs.reload(tabId).catch(error => finish(error))
    })
    return await loadTabRequest(tabId)
  } catch (_) {
    return {
      type: 'load' as const,
      data: undefined,
      reason: 'unavailable' as const,
    }
  }
}
