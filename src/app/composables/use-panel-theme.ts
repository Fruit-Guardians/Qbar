import { type Ref, onMounted, onUnmounted, watch } from 'vue'
import { useTheme } from 'vuetify/framework'
import browser from 'webextension-polyfill'
import { defaultRequestTimeout } from '../model/panel-preferences'
import { createThemePreference } from '../model/theme-preference'
export function usePanelTheme(request: BrowseRequest, isRawMode: Ref<boolean>) {
  const theme = useTheme()
  const preference = createThemePreference(
    browser.storage.local,
    window.matchMedia('(prefers-color-scheme: dark)'),
    dark => {
      theme.global.name.value = dark ? 'dark' : 'light'
    },
  )
  let disposed = false
  const changed = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area === 'local' && changes.uiThemeMode)
      preference.receive(changes.uiThemeMode.newValue)
  }
  browser.storage.onChanged?.addListener(changed)
  onUnmounted(() => {
    disposed = true
    preference.dispose()
    browser.storage.onChanged?.removeListener(changed)
  })
  watch(
    theme.global.name,
    name => {
      const root = document.documentElement
      if (root.classList) {
        root.classList.toggle('v-theme--light', name === 'light')
        root.classList.toggle('v-theme--dark', name === 'dark')
      } else root.className = `v-theme--${name}`
    },
    { immediate: true },
  )
  // Complete hydration before Load fingerprints the request. User theme choices win late reads.
  const preferencesReady = new Promise<void>(resolve => {
    onMounted(async () => {
      try {
        const saved = await browser.storage.local.get({
          uiThemeMode: null,
          darkThemeEnabled: null,
          rawModeEnabled: false,
          rawModeFollowRedirect: false,
          defaultRequestTimeoutMs: 30000,
        })
        if (!disposed) {
          preference.hydrate(saved)
          isRawMode.value = saved.rawModeEnabled === true
          request.followRedirect = saved.rawModeFollowRedirect === true
          request.timeoutMs = defaultRequestTimeout(
            saved.defaultRequestTimeoutMs,
          )
        }
      } catch {
        /* The editor keeps usable defaults if local storage is unavailable. */
      } finally {
        resolve()
      }
    })
  })
  return {
    theme,
    themeMode: preference.mode,
    themeNotice: preference.notice,
    setThemeMode: preference.select,
    enableDarkTheme: (enabled: boolean) => {
      void preference.select(enabled ? 'dark' : 'light')
    },
    preferencesReady,
  }
}
