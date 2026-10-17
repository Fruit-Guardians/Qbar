import { ref } from 'vue'
import type { EvidenceAction, EvidenceSnapshot } from '../model/evidence-store'
export function useEvidence(send: (message: object) => boolean) {
  const opened = ref(false),
    snapshot = ref<EvidenceSnapshot>(),
    error = ref(''),
    busy = ref(false),
    notice = ref(''),
    completed = ref<{ action: EvidenceAction; revision: number }>()
  let pendingAction: EvidenceAction | undefined
  let pending = '',
    timer: ReturnType<typeof setTimeout> | undefined
  function action(data: EvidenceAction) {
    if (busy.value) return
    error.value = ''
    notice.value = ''
    busy.value = true
    pending = crypto.randomUUID()
    pendingAction = JSON.parse(JSON.stringify(data))
    timer = setTimeout(() => {
      busy.value = false
      pending = ''
      error.value =
        'Evidence operation timed out. Refresh the list before retrying.'
    }, 10000)
    try {
      if (!send({ type: 'evidence', actionId: pending, data })) disconnected()
    } catch {
      disconnected()
    }
  }
  function receive(message: DevtoolsEvidenceMessage) {
    if (
      message.data &&
      (!snapshot.value || message.data.revision >= snapshot.value.revision)
    )
      snapshot.value = message.data
    if (!pending || message.actionId !== pending) return
    clearTimeout(timer)
    if (!message.error && message.data && pendingAction)
      completed.value = {
        action: pendingAction,
        revision: message.data.revision,
      }
    pendingAction = undefined
    pending = ''
    busy.value = false
    error.value = message.error ?? ''
    notice.value = message.error ? '' : 'Evidence updated on this device.'
  }
  function disconnected() {
    if (!busy.value) return
    clearTimeout(timer)
    pending = ''
    busy.value = false
    error.value =
      'Evidence operation interrupted. Refresh the list before retrying.'
  }
  function toggle() {
    opened.value = !opened.value
    if (opened.value) action({ action: 'list' })
  }
  return {
    opened,
    snapshot,
    error,
    busy,
    notice,
    completed,
    action,
    receive,
    disconnected,
    toggle,
    close: () => {
      opened.value = false
    },
    dispose: () => clearTimeout(timer),
  }
}
