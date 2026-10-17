<template>
  <aside
    v-show="shown"
    id="request-tools"
    class="workbench-tools"
    :aria-label="$t('Request tools')"
    @keydown.esc="close"
  >
    <header class="wb-heading">
      <strong>{{ $t('Tools') }}</strong
      ><button
        class="text-action"
        :aria-label="$t('Close request tools')"
        @click="close"
      >
        ×
      </button>
    </header>
    <div class="wb-tabs" role="tablist" :aria-label="$t('Request tools tabs')">
      <button
        v-for="name in tabs"
        :id="`tool-tab-${name}`"
        :key="name"
        role="tab"
        :aria-selected="tab === name"
        :aria-controls="`tool-panel-${name}`"
        :tabindex="tab === name ? 0 : -1"
        @click="select(name)"
        @keydown="navigate($event, name)"
      >
        {{ $t(name) }}
      </button>
    </div>
    <div class="wb-panels">
      <div
        v-for="name in tabs"
        v-show="tab === name"
        :id="`tool-panel-${name}`"
        :key="name"
        role="tabpanel"
        :aria-labelledby="`tool-tab-${name}`"
      >
        <NetworkPicker
          v-if="name === 'Requests' && shown && visitedRequests"
          :sending="sending"
          @load="$emit('load', $event)"
        />
        <QueryEditor
          v-if="name === 'Params'"
          :url="request.url"
          :sending="sending"
          @update="$emit('apply', { ...request, url: $event })"
        />
        <JsonTools
          v-if="name === 'JSON' && visitedJson"
          :request="request"
          :response="response"
          :sending="sending"
          @apply="$emit('apply', $event)"
        />
        <ExchangeCompare
          v-if="name === 'Compare'"
          :request="request"
          :exchange="exchange"
          :sending="sending"
          @save="$emit('save-comparison', $event)"
        />
        <JwtInspector
          v-if="name === 'JWT' && shown && tab === 'JWT'"
          :request="request"
          :sending="sending"
          @apply="$emit('apply', $event)"
          @close="close"
        />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Exchange } from '../model/exchange-diff'
import ExchangeCompare from './ExchangeCompare.vue'
import JsonTools from './JsonTools.vue'
import NetworkPicker from './NetworkPicker.vue'
import QueryEditor from './QueryEditor.vue'
import JwtInspector from '@/features/tools/components/JwtInspector.vue'
defineProps<{
  request: BrowseRequest
  response?: BrowseResponse
  exchange?: Exchange
  sending: boolean
}>()
defineEmits<{
  load: [request: BrowseRequest]
  'save-comparison': [
    value: {
      exchange: Exchange
      title: string
      notes: string
      comparison: { baseline: Exchange; ignorePaths: string[] }
    },
  ]
  apply: [request: BrowseRequest]
}>()
const tabs = ['Requests', 'Params', 'JSON', 'Compare', 'JWT'] as const
type Tab = (typeof tabs)[number]
const shown = ref(false),
  tab = ref<Tab>('Requests'),
  visitedRequests = ref(false),
  visitedJson = ref(false)
function select(name: Tab) {
  tab.value = name
  if (name === 'Requests') visitedRequests.value = true
  if (name === 'JSON') visitedJson.value = true
}
function toggle() {
  shown.value = !shown.value
  if (shown.value) select(tab.value)
  void nextTick(() => {
    if (shown.value) document.getElementById(`tool-tab-${tab.value}`)?.focus()
  })
}
function close() {
  shown.value = false
  document.getElementById('request-tools-toggle')?.focus()
}
function navigate(event: KeyboardEvent, name: Tab) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (tabs.indexOf(name) +
            (event.key === 'ArrowRight' ? 1 : -1) +
            tabs.length) %
          tabs.length
  select(tabs[index])
  void nextTick(() =>
    document.getElementById(`tool-tab-${tabs[index]}`)?.focus(),
  )
}
defineExpose({
  toggle,
  shown,
  hide: () => {
    shown.value = false
  },
})
</script>

<style src="./workbench.scss" lang="scss" />
