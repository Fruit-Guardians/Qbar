<template>
  <section class="wb-section" :aria-label="$t('JSON tools')">
    <div class="wb-actions">
      <label for="json-source">{{ $t('Source') }}</label
      ><select
        id="json-source"
        v-model="source"
        class="wb-input"
        @change="read"
      >
        <option value="body">{{ $t('Request body') }}</option>
        <option value="response">{{ $t('Response body') }}</option>
        <option value="scratch">{{ $t('Scratch') }}</option></select
      ><button class="text-action" @click="read">
        {{ $t('Read source') }}
      </button>
    </div>
    <p class="wb-note">
      {{
        $t(
          'Formatting preserves number tokens, duplicate keys and array order. The request changes only when you click Use in body.',
        )
      }}
    </p>
    <textarea
      v-model="text"
      class="wb-input wb-json-input"
      :aria-label="$t('JSON document')"
      :placeholder="$t('Paste JSON here')"
      spellcheck="false"
    />
    <div class="wb-actions">
      <button class="text-action" @click="validate">{{ $t('Validate') }}</button
      ><button class="text-action" @click="format(false)">
        {{ $t('Format') }}</button
      ><button class="text-action" @click="format(true)">
        {{ $t('Minify') }}</button
      ><button class="text-action" :disabled="!parsed.node" @click="copy(text)">
        {{ $t('Copy JSON') }}
      </button>
    </div>
    <p v-if="parsed.error" class="wb-error" role="alert">
      {{ $t(parsed.error) }}
    </p>
    <div v-if="parsed.node" class="wb-json-tree">
      <JsonTree
        :node="parsed.node"
        label="$"
        path="$"
        :depth="0"
        @copy="copy"
      />
    </div>
    <button
      class="text-action"
      :disabled="
        sending ||
        !parsed.node ||
        source !== 'body' ||
        stale ||
        ['GET', 'HEAD'].includes(request.method)
      "
      @click="apply"
    >
      {{ $t('Use in body') }}
    </button>
    <p v-if="stale && source === 'body'" class="wb-note">
      {{
        $t('Request changed since Read source. Read it again before applying.')
      }}
    </p>
    <p v-if="notice" role="status">{{ $t(notice) }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseJson, printJson } from '../model/json-document'
import JsonTree from './JsonTree.vue'
const props = defineProps<{
  request: BrowseRequest
  response?: BrowseResponse
  sending: boolean
}>()
const emit = defineEmits<{ apply: [value: BrowseRequest] }>()
const source = ref('body'),
  text = ref(props.request.body.content),
  notice = ref('')
const fingerprint = () =>
  JSON.stringify([props.request.method, props.request.url, props.request.body])
const captured = ref(fingerprint())
const stale = computed(() => captured.value !== fingerprint())
const parsed = computed(() => {
  if (!text.value.trim()) return { node: null, error: '' }
  try {
    return { node: parseJson(text.value), error: '' }
  } catch (e) {
    return {
      node: null,
      error: e instanceof Error ? e.message : 'Invalid JSON.',
    }
  }
})
function read() {
  notice.value = ''
  if (source.value === 'body') {
    text.value = props.request.body.content
    captured.value = fingerprint()
  } else if (source.value === 'response') {
    text.value = props.response?.bodyUnavailable
      ? ''
      : props.response?.body || ''
    if (!props.response || props.response.bodyUnavailable)
      notice.value = 'No response body is available.'
  }
}
function validate() {
  notice.value = parsed.value.node
    ? 'Valid JSON.'
    : parsed.value.error || 'Enter a JSON document.'
}
function format(compact: boolean) {
  if (parsed.value.node) {
    text.value = printJson(parsed.value.node, compact)
    notice.value = compact ? 'JSON minified.' : 'JSON formatted.'
  }
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    notice.value = 'Copied.'
  } catch {
    notice.value = 'Copy failed. Select and copy manually.'
  }
}
function apply() {
  if (
    props.sending ||
    stale.value ||
    !parsed.value.node ||
    source.value !== 'body' ||
    ['GET', 'HEAD'].includes(props.request.method)
  )
    return
  emit('apply', {
    ...props.request,
    body: { ...props.request.body, content: text.value },
  })
  captured.value = JSON.stringify([
    props.request.method,
    props.request.url,
    { ...props.request.body, content: text.value },
  ])
  notice.value = 'Request body updated. No request sent.'
}
</script>
