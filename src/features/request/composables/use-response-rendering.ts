import { onMounted, onUnmounted, ref, watch } from 'vue'
import browser from 'webextension-polyfill'
/** Reading a response stays inside QBar unless the user explicitly enables page rendering. */
export function useResponseRendering(
  response: () => BrowseResponse | undefined,
  render: () => void,
) {
  const enabled = ref(false),
    notice = ref('')
  let revision = 0,
    renderRevision = 0,
    disposed = false,
    writes = Promise.resolve()
  onMounted(async () => {
    try {
      const saved = await browser.storage.local.get({
        rawModeAutoRenderEnabled: false,
      })
      if (!disposed && !renderRevision)
        enabled.value = saved.rawModeAutoRenderEnabled === true
    } catch {
      /* Page rendering remains opt-in when storage cannot be read. */
    }
  })
  onUnmounted(() => {
    disposed = true
  })
  watch(response, value => {
    if (value && enabled.value) render()
  })
  async function save(
    key: 'rawModeAutoRenderEnabled' | 'rawModeFollowRedirect',
    value: boolean,
  ) {
    if (disposed) return
    const id = ++revision
    try {
      const write = writes
        .catch(() => {})
        .then(() => browser.storage.local.set({ [key]: value }))
      writes = write
      await write
      if (!disposed && id === revision) notice.value = ''
    } catch {
      if (!disposed && id === revision)
        notice.value =
          'Preference applies to this panel. Saving failed; select it again to retry.'
    }
  }
  function setEnabled(value: boolean) {
    if (disposed) return Promise.resolve()
    renderRevision++
    enabled.value = value
    return save('rawModeAutoRenderEnabled', value)
  }
  const saveRedirects = (value: boolean) => save('rawModeFollowRedirect', value)
  return { enabled, setEnabled, saveRedirects, notice }
}
