import { ref } from 'vue'
import { zhCN } from './zh-CN'
export type Locale = 'en' | 'zh-CN'
export type LanguagePreference = Locale | 'system'
export type Params = Record<string, string | number>
export interface LocaleStorage {
  get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}
export function resolveLocale(value: unknown, preferred = 'en'): Locale {
  if (value === 'en' || value === 'zh-CN') return value
  return /^zh(?:-|$)/i.test(preferred) ? 'zh-CN' : 'en'
}
export function translate(
  locale: Locale,
  message: string,
  params: Params = {},
) {
  if (locale === 'zh-CN' && !Object.hasOwn(zhCN, message)) {
    const position =
      /^(.*) at line (\d+), column (\d+) \(offset (\d+)\)\.$/.exec(message)
    if (position && Object.hasOwn(zhCN, position[1]))
      return translate(
        locale,
        '{message} at line {line}, column {column} (offset {offset}).',
        {
          message: zhCN[position[1]],
          line: position[2],
          column: position[3],
          offset: position[4],
        },
      )
    const response =
      /^JSON view unavailable: (.*) Raw response preserved\.$/.exec(message)
    if (response)
      return translate(
        locale,
        'JSON view unavailable: {message} Raw response preserved.',
        { message: translate(locale, response[1]) },
      )
  }
  const text =
    locale === 'zh-CN' && Object.hasOwn(zhCN, message) ? zhCN[message] : message
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match,
  )
}
export function createLocaleController(
  storage?: LocaleStorage,
  preferred = 'en',
) {
  const mode = ref<LanguagePreference>('system')
  const locale = ref<Locale>(resolveLocale(undefined, preferred))
  const notice = ref('')
  let revision = 0,
    pending = 0,
    disposed = false
  let writes = Promise.resolve()
  const t = (message: string, params?: Params) =>
    translate(locale.value, message, params)
  const valid = (value: unknown): value is LanguagePreference =>
    value === 'en' || value === 'zh-CN' || value === 'system'
  const apply = (value: unknown) => {
    mode.value = valid(value) ? value : 'system'
    locale.value = resolveLocale(mode.value, preferred)
  }
  const ready = storage
    ? Promise.resolve()
        .then(() => storage.get({ uiLanguage: null }))
        .then(saved => {
          if (!disposed && !revision) apply(saved.uiLanguage)
        })
        .catch(() => {})
    : Promise.resolve()
  async function setLocale(value: unknown) {
    if (disposed || !valid(value)) return
    const id = ++revision
    apply(value)
    notice.value = 'Saving preference…'
    pending++
    try {
      const write = writes
        .catch(() => {})
        .then(() => storage?.set({ uiLanguage: value }))
      writes = write
      await write
      if (!disposed && id === revision)
        notice.value = 'Language saved on this device.'
    } catch {
      if (!disposed && id === revision)
        notice.value =
          'Language changed for this panel. Saving failed; select it again to retry.'
    } finally {
      pending--
    }
  }
  function receive(value: unknown) {
    if (disposed || pending || !valid(value)) return
    revision++
    apply(value)
    notice.value = ''
  }
  function browserLanguageChanged(value: string) {
    if (disposed) return
    preferred = value
    if (mode.value === 'system') apply('system')
  }
  function dispose() {
    disposed = true
  }
  return {
    locale,
    mode,
    notice,
    t,
    ready,
    setLocale,
    receive,
    browserLanguageChanged,
    dispose,
  }
}
export type LocaleController = ReturnType<typeof createLocaleController>
