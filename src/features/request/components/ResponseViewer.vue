<template>
  <div :class="$style.root">
    <VInput
      class="monospaced"
      :class="themeName === 'dark' ? $style.dark : $style.light"
      :hide-details="hideDetails"
      :messages="messages"
    >
      <VField
        :label="label"
        :variant="variant"
        :active="isActive"
        :focused="isFocused"
      >
        <pre
          ref="htmlArea"
          class="v-field__input"
          :class="$style.htmlArea"
          tabindex="0"
          @focus="onFocus"
          @blur="onBlur"
          v-html="html"
        />
      </VField>
    </VInput>
    <div
      v-if="response"
      :class="$style.tools"
      class="d-flex flex-column align-end"
    >
      <div ref="iconPanel">
        <VBtn
          variant="plain"
          icon
          :aria-label="$t('Select all response')"
          @click="onSelectAll"
        >
          <VIcon :icon="mdiSelectAll" />
          <VTooltip location="top" activator="parent">
            {{ $t('Select all') }}
          </VTooltip>
        </VBtn>
        <VBtn
          variant="plain"
          icon
          :aria-label="$t('Search response')"
          @click="searchOptions.enabled = !searchOptions.enabled"
        >
          <VIcon :icon="mdiFileSearchOutline" />
          <VTooltip location="top" activator="parent">
            {{ $t('Search') }}
          </VTooltip>
        </VBtn>
        <VBtn
          variant="plain"
          icon
          :aria-label="$t('Render response')"
          @click="$emit('render')"
        >
          <VIcon :icon="mdiMonitorDashboard" />
          <VTooltip location="top" activator="parent">
            {{ $t('Render') }}
          </VTooltip>
        </VBtn>
      </div>
      <VToolbar
        v-show="searchOptions.enabled"
        class="w-100"
        density="compact"
        :elevation="1"
        :style="searchPanelStyle"
        rounded
      >
        <VTextField
          ref="searchInput"
          v-model="searchOptions.keyword"
          v-disable-prevent-default.keydown
          :aria-label="$t('Search response text')"
          class="ml-2 monospaced"
          :class="$style.searchInput"
          density="compact"
          :suffix="searchInputSuffix"
          variant="plain"
          single-line
          hide-details
        />
        <VDivider inset vertical />
        <VBtn
          class="ml-1"
          density="comfortable"
          :disabled="!searchResult.ranges.length"
          size="small"
          :icon="mdiChevronUp"
          :aria-label="$t('Previous match')"
          @click="previousSearchResult"
        />
        <VBtn
          density="comfortable"
          :disabled="!searchResult.ranges.length"
          size="small"
          :icon="mdiChevronDown"
          :aria-label="$t('Next match')"
          @click="nextSearchResult"
        />
        <VBtn
          :class="{ 'v-btn--active': searchOptions.caseSensitive }"
          density="comfortable"
          size="small"
          :icon="mdiFormatLetterCase"
          :aria-label="$t('Match case')"
          @click="searchOptions.caseSensitive = !searchOptions.caseSensitive"
        />
        <VBtn
          :class="{ 'v-btn--active': searchOptions.regexp }"
          density="comfortable"
          size="small"
          :icon="mdiRegex"
          :aria-label="$t('Use regular expression')"
          @click="searchOptions.regexp = !searchOptions.regexp"
        />
        <VBtn
          class="mr-1"
          density="comfortable"
          size="small"
          :icon="mdiClose"
          :aria-label="$t('Close search')"
          @click="searchOptions.enabled = !searchOptions.enabled"
        />
      </VToolbar>
    </div>
  </div>
</template>

<script lang="ts">
import {
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiFileSearchOutline,
  mdiFormatLetterCase,
  mdiMonitorDashboard,
  mdiRegex,
  mdiSelectAll,
} from '@mdi/js'
import {
  MaybeComputedElementRef,
  onKeyStroke,
  useElementBounding,
  useElementSize,
  useEventListener,
} from '@vueuse/core'
import hljs from 'highlight.js/lib/core'
import css from 'highlight.js/lib/languages/css'
import http from 'highlight.js/lib/languages/http'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import httpZ from 'http-z'
import { inRange } from 'lodash'
import debounce from 'lodash/debounce'
import escapeRegExp from 'lodash/escapeRegExp'
import {
  PropType,
  StyleValue,
  computed,
  defineComponent,
  inject,
  nextTick,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { VTextField } from 'vuetify/components'
import { useTheme } from 'vuetify/framework'
import { AppBarKey } from '@/app/context'
import { isChrome } from '@/shared/lib/browser'
import { binarySearch } from '@/shared/lib/collections'
import { createRandomToken } from '@/shared/lib/random'

hljs.registerLanguage('css', css)
hljs.registerLanguage('http', http)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)

export default defineComponent({
  name: 'ResponseViewer',
  inheritAttrs: false,
  props: {
    bodyOnly: Boolean,
    label: {
      type: String,
      default: '',
    },
    variant: {
      type: String as PropType<
        'filled' | 'outlined' | 'plain' | 'underlined' | 'solo'
      >,
      default: 'filled',
    },
    response: {
      type: undefined as unknown as PropType<BrowseResponse | undefined>,
      required: true,
    },
    messages: {
      type: [Array, String] as PropType<string | string[]>,
      default: () => [],
    },
    hideDetails: {
      type: [Boolean, String] as PropType<boolean | 'auto'>,
      default: false,
    },
  },
  emits: ['render'],
  setup(props) {
    const theme = useTheme()
    let disposed = false

    /* DOM element and refs */
    const htmlArea = ref<HTMLPreElement>()
    const iconPanel = ref<HTMLDivElement>()
    const searchInput = ref<
      InstanceType<typeof VTextField> & { focus: () => void }
    >()
    const appBar = inject(AppBarKey)

    /* State */
    const isFocused = ref(false)
    const isDirty = computed(() => !!props.response)
    const isActive = computed(() => isFocused.value || isDirty.value)

    /* Response */
    const html = computed(() => {
      const reasonPhrasePlaceholder = createRandomToken(16)
      const bodyPlaceholder = createRandomToken(16)

      if (!props.response) {
        return ''
      }

      const prettyBody = hljs.highlightAuto(props.response.body, [
        'css',
        'javascript',
        'json',
        'xml',
      ]).value
      if (props.bodyOnly) return prettyBody
      const builtResponse = httpZ
        .build({
          protocolVersion: props.response.protocolVersion,
          statusCode: props.response.statusCode,
          statusMessage:
            props.response.statusMessage || reasonPhrasePlaceholder,
          headers: props.response.headers,
          body: {
            text: bodyPlaceholder,
          },
        } as any)
        .replace(` ${reasonPhrasePlaceholder}`, '')

      return hljs
        .highlight(builtResponse, {
          language: 'http',
          ignoreIllegals: true,
        })
        .value.replace(bodyPlaceholder, prettyBody)
    })

    onUnmounted(() => {
      disposed = true
      debouncedSearch.cancel()
      onScroll.cancel()
      if (isChrome() && typeof CSS !== 'undefined' && CSS.highlights) {
        CSS.highlights.delete('searchResult')
        CSS.highlights.delete('searchResultCurrent')
      }
    })

    /* Search */
    const searchOptions = reactive({
      enabled: false,
      keyword: '',
      caseSensitive: false,
      regexp: false,
    })
    const searchResult = reactive({
      current: 0,
      ranges: [] as Array<Range>,
    })
    const searchInputSuffix = computed(() => {
      if (!searchOptions.keyword.length) {
        return ''
      } else if (!searchResult.ranges.length) {
        return '0/0'
      }

      return `${searchResult.current + 1}/${searchResult.ranges.length}`
    })

    const { height: appBarHeight } = useElementSize(
      appBar as MaybeComputedElementRef,
    )
    const { bottom: iconPanelBottom } = useElementBounding(iconPanel)
    const searchPanelStyle = computed(() => {
      const result: StyleValue = {}

      if (iconPanelBottom.value <= appBarHeight.value) {
        result['position'] = 'fixed'
        result['top'] = `${appBarHeight.value}px`
      }

      return result
    })

    const nextSearchResult = () => {
      searchResult.current =
        (searchResult.current + 1 + searchResult.ranges.length) %
        searchResult.ranges.length
    }
    const previousSearchResult = () => {
      searchResult.current =
        (searchResult.current - 1 + searchResult.ranges.length) %
        searchResult.ranges.length
    }
    const getResponseViewport = () => {
      const container =
        htmlArea.value?.closest<HTMLElement>('.response-content')
      const rect = container?.getBoundingClientRect()
      return {
        container,
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? window.innerHeight,
      }
    }
    const highlightInViewportSearchResult = () => {
      if (disposed || !htmlArea.value) return [0, 0]
      const viewport = getResponseViewport()

      const lowerBound = binarySearch(searchResult.ranges, range => {
        const rect = range.getBoundingClientRect()
        return rect.bottom - viewport.top
      })
      const upperBound = binarySearch(searchResult.ranges, range => {
        const rect = range.getBoundingClientRect()
        return rect.top - viewport.bottom
      })

      const visibleRanges = searchResult.ranges.slice(
        lowerBound,
        upperBound,
      ) as Array<Range>
      if (isChrome()) {
        CSS.highlights.set('searchResult', new Highlight(...visibleRanges))
      }

      return [lowerBound, upperBound]
    }
    const highlightCurrentSearchResult = () => {
      if (disposed || !searchResult.ranges.length) {
        return
      }

      const range = searchResult.ranges[searchResult.current] as Range
      const rect = range.getBoundingClientRect()

      if (isChrome()) {
        const highlight = new Highlight(range)
        highlight.priority = 999
        CSS.highlights.set('searchResultCurrent', highlight)
      }

      const viewport = getResponseViewport()
      if (rect.top < viewport.top || rect.bottom > viewport.bottom) {
        if (viewport.container) {
          viewport.container.scrollTop +=
            rect.top - viewport.top - viewport.container.clientHeight / 2
        } else {
          window.scrollTo({
            top: rect.top + window.scrollY - window.innerHeight / 2,
          })
        }
      }
    }
    const performSearch = () => {
      if (isChrome()) {
        CSS.highlights.clear()
      }

      if (!searchOptions.keyword.length || !searchOptions.enabled) {
        searchResult.current = 0
        searchResult.ranges = []
        return
      }

      const pattern = searchOptions.regexp
        ? searchOptions.keyword
        : escapeRegExp(searchOptions.keyword)
      const flags = searchOptions.caseSensitive ? 'g' : 'gi'
      const regexp = new RegExp(pattern, flags)

      const offsets = [...htmlArea.value!.innerText.matchAll(regexp)].map(m => {
        return {
          start: m.index!,
          end: m.index! + m[0].length,
        }
      })
      const walker = document.createTreeWalker(
        htmlArea.value!,
        NodeFilter.SHOW_TEXT,
      )

      const results = offsets.map(() => {
        const range = document.createRange()
        range.setStart(htmlArea.value!, 0)
        range.collapse(true)

        return {
          startFound: false,
          range,
        }
      })

      let currentOffset = 0
      let finishedResultsIndex = -1
      let node: Node | null
      while ((node = walker.nextNode())) {
        const textStart = currentOffset
        const textEnd = textStart + (node as Text).length

        for (let idx = finishedResultsIndex + 1; idx < results.length; idx++) {
          const record = results[idx]
          const resultStart = offsets[idx].start
          const resultEnd = offsets[idx].end

          if (resultStart > textEnd) {
            break
          }

          if (
            !record.startFound &&
            resultStart >= textStart &&
            resultStart < textEnd
          ) {
            record.range.setStart(node, resultStart - textStart)
            record.startFound = true
          }
          if (
            record.startFound &&
            resultEnd >= textStart &&
            resultEnd <= textEnd
          ) {
            record.range.setEnd(node, resultEnd - textStart)

            finishedResultsIndex = idx
          }
        }

        currentOffset = textEnd
      }

      searchResult.ranges = results.map(result => result.range)
      const [inViewportStartIndex, inViewportEndIndex] =
        highlightInViewportSearchResult()

      searchResult.current = inRange(
        searchResult.current,
        inViewportStartIndex,
        inViewportEndIndex,
      )
        ? searchResult.current
        : inViewportStartIndex
    }

    const startNewSearch = () => {
      if (disposed) return
      performSearch()
      highlightCurrentSearchResult()
    }
    const debouncedSearch = debounce(startNewSearch, 256)
    watch(() => searchOptions.keyword, debouncedSearch)
    watch(
      () => searchOptions.enabled,
      () => {
        nextTick(() => {
          searchInput.value?.focus()
        })
      },
    )
    watch(() => {
      return `${searchOptions.enabled}-${searchOptions.caseSensitive}-${searchOptions.regexp}`
    }, startNewSearch)
    watch(() => searchResult.current, highlightCurrentSearchResult)
    watch(
      () => props.response,
      () => {
        nextTick(startNewSearch)
      },
    )

    onKeyStroke(
      ['Enter', 'Shift+Enter', 'F3', 'Shift+F3'],
      (event: KeyboardEvent) => {
        if (!['Enter', 'F3'].includes(event.code)) {
          return
        }

        if (event.shiftKey) {
          previousSearchResult()
        } else {
          nextSearchResult()
        }
      },
      { target: searchInput },
    )

    /* Events */
    const onFocus = () => {
      isFocused.value = true
    }
    const onBlur = () => {
      isFocused.value = false
    }

    const onSelectAll = () => {
      const selection = document.getSelection()
      if (!selection) {
        return
      }

      const range = new Range()
      range.selectNodeContents(htmlArea.value!)

      selection.removeAllRanges()
      selection.addRange(range)
    }

    const onScroll = debounce(highlightInViewportSearchResult, 32)

    useEventListener(window, 'scroll', onScroll, { capture: true })
    onKeyStroke(
      (event: KeyboardEvent) => {
        return (
          event.code === 'Escape' ||
          event.code === 'F3' ||
          ((event.ctrlKey || event.metaKey) && event.code === 'KeyF')
        )
      },
      (event: KeyboardEvent) => {
        if (!htmlArea.value?.getClientRects().length) return
        event.preventDefault()
        event.stopPropagation()

        searchOptions.enabled = event.code != 'Escape'
      },
      { target: window },
    )

    return {
      mdiChevronDown,
      mdiChevronUp,
      mdiClose,
      mdiFileSearchOutline,
      mdiFormatLetterCase,
      mdiMonitorDashboard,
      mdiRegex,
      mdiSelectAll,

      htmlArea,
      iconPanel,
      searchInput,

      isActive,
      isFocused,

      themeName: theme.global.name,

      html,

      searchOptions,
      searchResult,
      searchInputSuffix,
      searchPanelStyle,
      nextSearchResult,
      previousSearchResult,

      onFocus,
      onBlur,

      onSelectAll,
    }
  },
})
</script>

<style lang="scss" module>
.light :global {
  @import 'highlight.js/scss/github.scss';
}
.dark :global {
  @import 'highlight.js/scss/github-dark.scss';
}
.root {
  position: relative;
}
.tools {
  position: absolute;
  right: 0;
  top: 0;
  width: 100%;

  &,
  > * {
    max-width: 380px !important;
  }
}
.searchInput {
  min-width: 70px;
  width: 100%;

  :global {
    .v-field__field {
      align-items: center;
    }
    .v-field__input {
      line-height: 16px;
      padding: 0;
    }
    .v-text-field__suffix {
      line-height: 17px;
      padding: 0 8px 0 12px;
    }
  }
}
.htmlArea {
  display: block;
  white-space: pre-wrap;
  word-break: break-all;
}
::highlight(searchResult) {
  background-color: yellow;
  color: black;
}
::highlight(searchResultCurrent) {
  background-color: orange;
  color: black;
}
</style>
