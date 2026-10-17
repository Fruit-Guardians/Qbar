import { computed, ref } from 'vue'
import type { Exchange } from './exchange-diff'
export type RepeaterDraft = {
  request: BrowseRequest
  rawMode: boolean
  response?: BrowseResponse
  exchange?: Exchange
  attempt?: Exchange
  status: string
  duration: number | null
  source: string
}
type Tab = { id: string; title: string; draft: RepeaterDraft; clean: string }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const fingerprint = (d: RepeaterDraft) => JSON.stringify([d.request, d.rawMode])
/** In-memory tabs. Switching never executes or persists a request. */
export function createRepeaterTabs(options: {
  read(): RepeaterDraft
  apply(draft: RepeaterDraft): void
  empty(): RepeaterDraft
  busy(): boolean
}) {
  let counter = 1
  const first = options.read(),
    tabs = ref<Tab[]>([
      {
        id: '1',
        title: 'Request 1',
        draft: clone(first),
        clean: fingerprint(first),
      },
    ]),
    active = ref('1'),
    pendingClose = ref(''),
    notice = ref('')
  const current = () => tabs.value.find(t => t.id === active.value)!
  const dirty = computed(() => fingerprint(options.read()) !== current().clean)
  const capture = () => {
    current().draft = clone(options.read())
  }
  function activate(id: string) {
    if (options.busy() || id === active.value) return
    const tab = tabs.value.find(t => t.id === id)
    if (!tab) return
    capture()
    active.value = id
    pendingClose.value = ''
    options.apply(clone(tab.draft))
  }
  function add(duplicate = false) {
    if (options.busy()) return
    if (tabs.value.length >= 20) {
      notice.value =
        'Maximum 20 request tabs. Close a tab before adding another.'
      return
    }
    capture()
    const draft = duplicate ? clone(options.read()) : options.empty()
    if (duplicate) {
      draft.response = undefined
      draft.exchange = undefined
      draft.attempt = undefined
      draft.status = 'Ready'
      draft.duration = null
    }
    const id = String(++counter)
    tabs.value.push({
      id,
      title: `Request ${id}`,
      draft: clone(draft),
      clean: duplicate ? '' : fingerprint(draft),
    })
    active.value = id
    pendingClose.value = ''
    options.apply(draft)
  }
  function close(id: string, discard = false) {
    if (options.busy()) return
    capture()
    const tab = tabs.value.find(t => t.id === id)
    if (!tab) return
    if (
      !discard &&
      (fingerprint(tab.draft) !== tab.clean ||
        tab.draft.attempt ||
        tab.draft.exchange)
    ) {
      pendingClose.value = id
      return
    }
    const index = tabs.value.indexOf(tab)
    tabs.value.splice(index, 1)
    pendingClose.value = ''
    if (!tabs.value.length) {
      const draft = options.empty(),
        next = String(++counter)
      tabs.value.push({
        id: next,
        title: `Request ${next}`,
        draft,
        clean: fingerprint(draft),
      })
    }
    if (id === active.value) {
      const next = tabs.value[Math.min(index, tabs.value.length - 1)]
      active.value = next.id
      options.apply(clone(next.draft))
    }
  }
  return {
    tabs,
    active,
    dirty,
    pendingClose,
    notice,
    activate,
    add,
    close,
    cancelClose: () => {
      pendingClose.value = ''
    },
    isDirty: (id: string) =>
      id === active.value
        ? dirty.value
        : (() => {
            const t = tabs.value.find(t => t.id === id)!
            return fingerprint(t.draft) !== t.clean
          })(),
  }
}
