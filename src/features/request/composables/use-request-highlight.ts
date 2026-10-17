import {
  type Ref,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import {
  highlightRequest,
  requestLineNumbers,
} from '../model/request-highlight'

export function useRequestHighlight(
  source: () => string,
  input: Ref<HTMLTextAreaElement | undefined>,
) {
  const preview = ref<HTMLPreElement>()
  const gutter = ref<HTMLPreElement>()
  const lineNumbers = computed(() => requestLineNumbers(source()))
  const composing = ref(false)
  const syntax = computed(() => highlightRequest(source()))
  let observer: ResizeObserver | undefined
  let alive = true
  function syncScroll() {
    if (!alive || !input.value || !preview.value) return
    preview.value.style.width = `${input.value.clientWidth}px`
    preview.value.style.height = `${input.value.clientHeight}px`
    if (gutter.value) gutter.value.scrollTop = input.value.scrollTop
    preview.value.scrollTop = input.value.scrollTop
    preview.value.scrollLeft = input.value.scrollLeft
  }
  watch(
    [source, composing],
    () => {
      void nextTick(syncScroll)
    },
    { flush: 'post' },
  )
  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined' && input.value) {
      observer = new ResizeObserver(syncScroll)
      observer.observe(input.value)
    }
    syncScroll()
  })
  onUnmounted(() => {
    alive = false
    observer?.disconnect()
  })
  return { preview, gutter, lineNumbers, syntax, composing, syncScroll }
}
