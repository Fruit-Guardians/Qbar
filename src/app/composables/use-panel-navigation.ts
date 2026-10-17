import { type Ref, nextTick, ref } from 'vue'
type Tools = { toggle(): void; hide(): void }
export function usePanelNavigation(
  tools: Ref<Tools | undefined>,
  historyOpen: Ref<boolean>,
  toggleHistory: () => void,
  closeHistory: () => void,
  closeEvidence: () => void = () => {},
) {
  const settingsOpen = ref(false)
  const closeSettings = () => {
    settingsOpen.value = false
    void nextTick(() =>
      document.getElementById('qbar-settings-toggle')?.focus(),
    )
  }
  const toggleSettings = () => {
    closeEvidence()
    if (settingsOpen.value) {
      closeSettings()
      return
    }
    tools.value?.hide()
    historyOpen.value = false
    settingsOpen.value = true
  }
  const toggleTools = () => {
    closeEvidence()
    settingsOpen.value = false
    closeHistory()
    tools.value?.toggle()
  }
  const toggleRecords = () => {
    closeEvidence()
    settingsOpen.value = false
    tools.value?.hide()
    toggleHistory()
  }
  return {
    settingsOpen,
    closeSettings,
    toggleSettings,
    toggleTools,
    toggleRecords,
  }
}
