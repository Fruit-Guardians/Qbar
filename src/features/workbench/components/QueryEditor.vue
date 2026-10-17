<template>
  <section class="wb-section" :aria-label="$t('Query parameters')">
    <div class="wb-actions">
      <strong>{{ $t('Query parameters') }}</strong
      ><button class="text-action" :disabled="sending || !!error" @click="add">
        {{ $t('Add parameter') }}
      </button>
    </div>
    <p class="wb-note">
      {{
        $t(
          'Changes update the URL immediately. Duplicate names, order and untouched encoding are preserved. Disabled rows stay here until the URL is changed elsewhere.',
        )
      }}
    </p>
    <p v-if="error" class="wb-error" role="alert">{{ $t(error) }}</p>
    <div v-for="row in rows" :key="row.id" class="wb-query-row">
      <input
        v-model="row.enabled"
        type="checkbox"
        :aria-label="$t('Enable parameter {index}', { index: row.id + 1 })"
        :disabled="sending"
        @change="commit"
      />
      <input
        v-model="row.name"
        class="wb-input"
        :aria-label="$t('Parameter name {index}', { index: row.id + 1 })"
        :disabled="sending"
        :placeholder="$t('Name')"
        @input="commit"
      />
      <input
        v-model="row.value"
        class="wb-input"
        :aria-label="$t('Parameter value {index}', { index: row.id + 1 })"
        :disabled="sending"
        :placeholder="$t('Value')"
        @input="commit"
      />
      <button
        class="text-action"
        :aria-label="$t('Delete parameter {index}', { index: row.id + 1 })"
        :disabled="sending"
        @click="remove(row.id)"
      >
        ×
      </button>
    </div>
    <p v-if="!rows.length && !error" class="wb-note">
      {{ $t('No query parameters.') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  type QueryRow,
  newQueryRow,
  readQuery,
  writeQuery,
} from '../model/query-params'
const props = defineProps<{ url: string; sending: boolean }>()
const emit = defineEmits<{ update: [url: string] }>()
const rows = ref<QueryRow[]>([]),
  error = ref('')
let ownUrl: string | undefined,
  id = 0
watch(
  () => props.url,
  value => {
    if (value === ownUrl) {
      ownUrl = undefined
      return
    }
    try {
      rows.value = readQuery(value)
      id = rows.value.length
      error.value = ''
    } catch {
      rows.value = []
      error.value =
        'URL contains invalid percent encoding or is too large. Fix it in the request editor first.'
    }
  },
  { immediate: true, flush: 'sync' },
)
function commit() {
  if (props.sending) return
  try {
    const value = writeQuery(props.url, rows.value)
    error.value = ''
    if (value !== props.url) {
      ownUrl = value
      emit('update', value)
    }
  } catch {
    error.value = 'Parameter contains an invalid Unicode sequence.'
  }
}
function add() {
  rows.value.push(newQueryRow(id++))
  commit()
}
function remove(id: number) {
  rows.value = rows.value.filter(r => r.id !== id)
  commit()
}
</script>
