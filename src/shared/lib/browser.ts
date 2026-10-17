import browser from 'webextension-polyfill'

export function isChrome() {
  return import.meta.env.VITE_BUILD_TARGET != 'firefox'
}

export async function checkExtensionPermission() {
  return await browser.permissions.contains({ origins: ['*://*/*'] })
}

export function openExtensionPermissionGrantPage() {
  const permissionGrantPageUrl = browser.runtime.getURL('/permissions.html')
  browser.tabs.create({ url: permissionGrantPageUrl })
}

export function isSelfOrigin(val: string | URL | undefined) {
  if (!val) {
    return false
  }

  try {
    const origin = val instanceof URL ? val.origin : new URL(val).origin
    const selfOrigin = new URL(browser.runtime.getURL('/')).origin
    return selfOrigin === origin
  } catch (_) {
    return false
  }
}
