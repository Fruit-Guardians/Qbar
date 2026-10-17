<template>
  <section class="wb-section" :aria-label="$t('Page request picker')">
    <div class="wb-actions">
      <button class="text-action" @click="controller?.refresh()">
        {{ $t('Refresh log') }}</button
      ><button class="text-action" @click="controller?.clear()">
        {{ $t('Clear list') }}</button
      ><span>{{ rows.length }} / 200</span>
    </div>
    <input
      v-model="query"
      class="wb-input"
      type="search"
      :aria-label="$t('Filter page requests')"
      :placeholder="$t('Filter URL or method')"
    />
    <p class="wb-note">
      {{
        $t(
          'DevTools requests · memory only. Open DevTools before loading the page to capture all requests. Loading only fills the editor.',
        )
      }}
    </p>
    <p v-if="preview" class="wb-note">
      {{ $t('Development preview · sample requests, not live capture.') }}
    </p>
    <p v-if="error" class="wb-error" role="alert">{{ $t(error) }}</p>
    <p v-if="!filtered.length" class="wb-note">
      {{
        $t(
          'No matching requests. Reload the page manually, then refresh this log.',
        )
      }}
    </p>
    <article v-for="row in filtered" :key="row.id" class="wb-capture">
      <div class="wb-actions">
        <strong>{{ row.method }}</strong
        ><span>{{ row.status || '—' }}</span
        ><button
          class="text-action"
          :disabled="sending || !row.request"
          @click="load(row)"
        >
          {{ $t('Load request') }}
        </button>
      </div>
      <div class="wb-url">{{ row.url }}</div>
      <p v-if="row.error" class="wb-error">{{ $t(row.error) }}</p>
    </article>
    <p v-if="notice" role="status">{{ $t(notice) }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import browser from 'webextension-polyfill'
import {
  type CapturedRequest,
  type NetworkApi,
  createNetworkCapture,
} from '../model/network-capture'
import { useNetworkCapture } from '../model/network-context'
const props = defineProps<{ sending: boolean }>()
const emit = defineEmits<{ load: [request: BrowseRequest] }>()
const shared = useNetworkCapture()
const rows = shared?.rows ?? ref<CapturedRequest[]>([]),
  error = shared?.error ?? ref(''),
  query = ref(''),
  notice = ref('')
const preview = import.meta.env.DEV
let controller:
  | Pick<ReturnType<typeof createNetworkCapture>, 'refresh' | 'clear'>
  | undefined = shared
const filtered = computed(() =>
  rows.value.filter(r =>
    `${r.method} ${r.url}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
onMounted(() => {
  if (shared) return
  if (!browser.devtools?.network) {
    error.value = 'DevTools network API is not available in this panel.'
    return
  }
  controller = createNetworkCapture(
    browser.devtools.network as unknown as NetworkApi,
    (items, message) => {
      rows.value = items
      error.value = message
    },
  )
  ;(controller as ReturnType<typeof createNetworkCapture>).start()
})
onUnmounted(() => {
  if (!shared)
    (
      controller as ReturnType<typeof createNetworkCapture> | undefined
    )?.dispose()
})
function load(row: CapturedRequest) {
  if (props.sending || !row.request) return
  emit('load', JSON.parse(JSON.stringify(row.request)))
  notice.value = 'Request loaded into the editor. No request sent.'
}
</script>
