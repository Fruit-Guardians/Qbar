import { computed, ref } from 'vue'
export type ThemeMode = 'system' | 'light' | 'dark'
export function resolveThemeMode(saved: Record<string, unknown>): ThemeMode {
  if (['system', 'light', 'dark'].includes(saved.uiThemeMode as string))
    return saved.uiThemeMode as ThemeMode
  return typeof saved.darkThemeEnabled === 'boolean'
    ? saved.darkThemeEnabled
      ? 'dark'
      : 'light'
    : 'system'
}
type Storage = { set(values: Record<string, unknown>): Promise<void> }
type Media = {
  matches: boolean
  addEventListener?(type: 'change', listener: () => void): void
  removeEventListener?(type: 'change', listener: () => void): void
}
/** Presentation-only preference; system changes never write storage or touch a request. */
export function createThemePreference(
  storage: Storage,
  media: Media,
  apply: (dark: boolean) => void,
) {
  const mode = ref<ThemeMode>('system'),
    systemDark = ref(media.matches),
    notice = ref('')
  const dark = computed(() =>
    mode.value === 'system' ? systemDark.value : mode.value === 'dark',
  )
  let disposed = false,
    revision = 0,
    pending = 0,
    writes = Promise.resolve()
  const update = () => {
    if (!disposed) apply(dark.value)
  }
  const systemChanged = () => {
    systemDark.value = media.matches
    update()
  }
  media.addEventListener?.('change', systemChanged)
  update()
  function hydrate(saved: Record<string, unknown>) {
    if (disposed || revision) return
    mode.value = resolveThemeMode(saved)
    systemChanged()
  }
  function receive(value: unknown) {
    if (
      disposed ||
      pending ||
      !['system', 'light', 'dark'].includes(value as string)
    )
      return
    revision++
    mode.value = value as ThemeMode
    notice.value = ''
    systemChanged()
  }
  async function select(value: unknown) {
    if (disposed || !['system', 'light', 'dark'].includes(value as string))
      return
    const id = ++revision
    mode.value = value as ThemeMode
    notice.value = 'Saving preference…'
    systemChanged()
    pending++
    try {
      const write = writes
        .catch(() => {})
        .then(() => storage.set({ uiThemeMode: value }))
      writes = write
      await write
      if (!disposed && id === revision)
        notice.value = 'Preference saved on this device.'
    } catch {
      if (!disposed && id === revision)
        notice.value =
          'Preference applies to this panel. Saving failed; select it again to retry.'
    } finally {
      pending--
    }
  }
  function dispose() {
    disposed = true
    media.removeEventListener?.('change', systemChanged)
  }
  return { mode, dark, notice, hydrate, receive, select, dispose }
}
