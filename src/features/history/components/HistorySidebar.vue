<template>
  <aside
    class="history-panel"
    :aria-label="$t('Request history')"
    @keydown.esc="$emit('close')"
  >
    <div class="history-heading">
      <h2>
        {{ $t('History') }}
        <span v-if="snapshot">{{ snapshot.entries.length }}</span>
      </h2>
      <button class="text-action" :disabled="!snapshot" @click="refreshHistory">
        {{ $t('Refresh') }}
      </button>
      <button
        class="history-close"
        :aria-label="$t('Close request history')"
        @click="$emit('close')"
      >
        ×
      </button>
    </div>
    <div class="history-controls">
      <input
        ref="searchInput"
        v-model="query"
        class="native-host"
        type="search"
        autocomplete="off"
        spellcheck="false"
        :aria-label="$t('Search request history')"
        :placeholder="$t('Filter by URL, method or status')"
      />
      <div class="history-actions">
        <label class="native-checkbox"
          ><input
            type="checkbox"
            :checked="snapshot?.enabled ?? true"
            :disabled="!snapshot"
            @change="
              $emit('action', {
                action: 'recording',
                enabled: ($event.target as HTMLInputElement).checked,
              })
            "
          />{{ $t('Record requests') }}</label
        >
        <button
          class="text-action"
          :disabled="!snapshot?.entries.length"
          @click="confirmClear = !confirmClear"
        >
          {{ $t('Clear all') }}
        </button>
      </div>
      <p class="history-note">
        {{
          $t(
            'Saved locally with headers and body · latest 100 · 2 MB limit. Responses are not stored.',
          )
        }}
      </p>
      <div
        v-if="confirmClear"
        class="history-confirm"
        role="group"
        :aria-label="$t('Confirm clearing history')"
      >
        <span>{{ $t('Delete all saved requests?') }}</span>
        <button class="text-action" @click="clearHistory">
          {{ $t('Confirm clear') }}
        </button>
        <button class="text-action" @click="confirmClear = false">
          {{ $t('Cancel') }}
        </button>
      </div>
      <p v-if="error" class="history-error" role="alert">
        {{ $t(error) }}
        <button
          class="text-action"
          @click="$emit('action', { action: 'list' })"
        >
          {{ $t('Retry history') }}
        </button>
      </p>
    </div>
    <div class="history-list" :aria-label="$t('Saved requests')">
      <p v-if="!snapshot && !error" class="empty-note">
        {{ $t('Loading history…') }}
      </p>
      <p v-else-if="!snapshot?.entries.length" class="empty-note">
        {{
          $t(
            snapshot?.enabled === false
              ? 'Recording is paused.'
              : 'No saved requests yet. Send a request to begin.',
          )
        }}
      </p>
      <p v-else-if="!filtered.length" class="empty-note">
        {{ $t('No matching requests.') }}
      </p>
      <article
        v-for="entry in filtered"
        :key="entry.id"
        class="history-entry"
        :class="statusClass(entry)"
      >
        <div class="history-entry-top">
          <strong class="history-method">{{ entry.request.method }}</strong
          ><span
            class="history-outcome"
            :class="{
              'history-failed': ['failed', 'timeout', 'interrupted'].includes(
                entry.status,
              ),
            }"
            >{{ outcome(entry) }}</span
          ><span class="history-mode">{{
            $t(entry.rawMode ? 'Raw' : 'Basic')
          }}</span>
        </div>
        <div class="history-url" :title="entry.request.url">
          {{ entry.request.url }}
        </div>
        <div class="history-meta">
          <time
            :datetime="new Date(entry.createdAt).toISOString()"
            :title="new Date(entry.createdAt).toLocaleString()"
            >{{ new Date(entry.createdAt).toLocaleTimeString() }}</time
          ><span v-if="entry.durationMs !== undefined"
            >{{ entry.durationMs }} ms</span
          >
        </div>
        <p
          v-if="entry.error"
          class="history-entry-error"
          :title="$t(entry.error)"
        >
          {{ $t(entry.error) }}
        </p>
        <div class="history-entry-actions">
          <button
            class="text-action"
            :disabled="sending"
            :aria-label="
              $t('Restore {method} {url}', {
                method: entry.request.method,
                url: entry.request.url,
              })
            "
            :title="$t('Restore in editor without sending')"
            @click="$emit('restore', entry)"
          >
            {{ $t('Restore') }}
          </button>
          <button
            class="text-action"
            :aria-label="
              $t('Copy cURL {method} {url}', {
                method: entry.request.method,
                url: entry.request.url,
              })
            "
            @click="$emit('copy', entry)"
          >
            {{ $t('Copy cURL') }}
          </button>
          <button
            class="text-action history-delete"
            :aria-label="
              $t('Delete history {method} {url}', {
                method: entry.request.method,
                url: entry.request.url,
              })
            "
            @click="$emit('action', { action: 'remove', id: entry.id })"
          >
            {{ $t('Delete') }}
          </button>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type {
  HistoryAction,
  HistoryEntry,
  HistorySnapshot,
} from '@/features/history/model/request-history'
import { usePanelLocale } from '@/shared/i18n'
const { t } = usePanelLocale()
const props = defineProps<{
  snapshot?: HistorySnapshot
  error: string
  sending: boolean
}>()
const emit = defineEmits<{
  close: []
  action: [action: HistoryAction]
  restore: [entry: HistoryEntry]
  copy: [entry: HistoryEntry]
}>()
const query = ref('')
const confirmClear = ref(false)
const refreshHistory = () => {
  confirmClear.value = false
  emit('action', { action: 'list' })
}
const clearHistory = () => {
  confirmClear.value = false
  emit('action', { action: 'clear' })
}
const searchInput = ref<HTMLInputElement>()
const outcome = (entry: HistoryEntry) =>
  entry.statusCode === undefined
    ? t(entry.status)
    : `${entry.statusCode} · ${t(entry.status)}`
const filtered = computed(() => {
  const words = query.value.toLowerCase().trim().split(/\s+/)
  return (props.snapshot?.entries ?? []).filter(entry =>
    words.every(word =>
      `${entry.request.method} ${entry.request.url} ${entry.status} ${outcome(entry)}`
        .toLowerCase()
        .includes(word),
    ),
  )
})
function statusClass(entry: HistoryEntry) {
  if (['failed', 'timeout', 'interrupted'].includes(entry.status))
    return 'status-failed'
  if (entry.statusCode === undefined) return ''
  if (entry.statusCode < 400) return 'status-success'
  if (entry.statusCode < 500) return 'status-client-error'
  return 'status-server-error'
}
onMounted(() => searchInput.value?.focus())
</script>
