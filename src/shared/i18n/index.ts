import { type App, type InjectionKey, inject, watch } from 'vue'
import browser from 'webextension-polyfill'
import {
  type Locale,
  type LocaleController,
  type Params,
  createLocaleController,
} from './locale'
const key: InjectionKey<LocaleController> = Symbol('qbar-locale')
const fallback = createLocaleController()
export const usePanelLocale = () => inject(key, fallback)
export default {
  install(app: App, onChange?: (locale: Locale) => void) {
    const controller = createLocaleController(
      browser.storage.local,
      navigator.language,
    )
    app.provide(key, controller)
    app.config.globalProperties.$t = controller.t
    const changed = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area === 'local' && changes.uiLanguage)
        controller.receive(changes.uiLanguage.newValue)
    }
    const languageChanged = () =>
      controller.browserLanguageChanged(navigator.language)
    browser.storage.onChanged?.addListener(changed)
    window.addEventListener('languagechange', languageChanged)
    const stop = watch(
      controller.locale,
      value => {
        document.documentElement.lang = value
        onChange?.(value)
      },
      { immediate: true },
    )
    app.onUnmount(() => {
      stop()
      controller.dispose()
      browser.storage.onChanged?.removeListener(changed)
      window.removeEventListener('languagechange', languageChanged)
    })
  },
}
declare module 'vue' {
  interface ComponentCustomProperties {
    $t(message: string, params?: Params): string
  }
}
