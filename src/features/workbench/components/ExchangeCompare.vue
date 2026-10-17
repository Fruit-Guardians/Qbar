<template>
  <section
    class="wb-section"
    :aria-label="$t('Request and response comparison')"
  >
    <div class="wb-actions">
      <label for="compare-source">{{ $t('Compare source') }}</label
      ><select id="compare-source" v-model="source" class="wb-input">
        <option value="draft">{{ $t('Current draft request') }}</option>
        <option value="exchange">{{ $t('Last completed exchange') }}</option>
      </select>
    </div>
    <p class="wb-note">
      {{
        $t(
          'Pin a baseline, edit and send another request, then compare. Completed exchanges use the actual sent request, never the currently edited draft. Snapshots stay in memory.',
        )
      }}
    </p>
    <label
      >{{ $t('Ignore JSON paths')
      }}<textarea
        v-model="ignoreInput"
        class="wb-input"
        rows="2"
        placeholder="/timestamp&#10;/meta/requestId"
        spellcheck="false"
      />
    </label>
    <p class="wb-note">
      {{
        $t(
          'Exact JSON Pointer paths only. Object key order is ignored; number tokens and duplicate keys are preserved. Non-JSON bodies use text comparison.',
        )
      }}
    </p>
    <div class="wb-actions">
      <button class="text-action" :disabled="!current" @click="pin">
        {{ $t(baseline ? 'Replace baseline' : 'Pin baseline') }}</button
      ><button
        class="text-action"
        :disabled="!baseline"
        @click="baseline = undefined"
      >
        {{ $t('Clear baseline') }}</button
      ><span v-if="sending">{{ $t('Waiting for completion…') }}</span>
    </div>
    <p v-if="!current" class="wb-note">
      {{
        $t(
          'No completed exchange yet. Raw mode returns response data; Basic navigation may not provide a response body.',
        )
      }}
    </p>
    <div class="wb-actions">
      <button
        class="text-action"
        :disabled="
          !baseline ||
          !current ||
          source !== 'exchange' ||
          sending ||
          !!pathError
        "
        @click="saveComparison"
      >
        {{ $t('Save comparison evidence') }}
      </button>
    </div>
    <p v-if="pathError" class="wb-error" role="alert">{{ $t(pathError) }}</p>
    <p v-if="error" class="wb-error" role="alert">{{ $t(error) }}</p>
    <p v-if="!baseline" class="wb-note">{{ $t('No baseline pinned.') }}</p>
    <template v-if="baseline && current">
      <p>
        {{ $t('Baseline') }} {{ baseline.durationMs ?? '—' }} ms →
        {{ $t('Current') }} {{ current.durationMs ?? '—' }} ms
      </p>
      <details
        v-for="section in comparisons"
        :key="section.name"
        :open="section.changed"
        class="wb-diff-section"
      >
        <summary>
          {{ $t(section.name) }} ·
          {{ $t(section.changed ? 'Changed' : 'Unchanged') }}
        </summary>
        <p v-if="section.diff.truncated" class="wb-note">
          {{
            $t(
              'Large diff: limited to 256 KiB per side / first 2,000 lines. Oversized text is not rendered.',
            )
          }}
        </p>
        <pre><div v-for="(line,index) in section.diff.lines" :key="index" :class="`wb-diff-${line.kind}`">{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }} {{ line.text }}</div></pre>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  type Exchange,
  cloneExchange,
  exchangeSections,
  lineDiff,
} from '../model/exchange-diff'
import { compareBodies, comparisonPaths } from '../model/response-compare'
const props = defineProps<{
  request: BrowseRequest
  exchange?: Exchange
  sending: boolean
}>()
const emit = defineEmits<{
  save: [
    value: {
      exchange: Exchange
      title: string
      notes: string
      comparison: { baseline: Exchange; ignorePaths: string[] }
    },
  ]
}>()
const ignoreInput = ref('')
const pathError = computed(() => {
  try {
    comparisonPaths(ignoreInput.value)
    return ''
  } catch (e) {
    return (e as Error).message
  }
})
const source = ref('exchange'),
  baseline = ref<Exchange>(),
  error = ref('')
const current = computed<Exchange | undefined>(() =>
  source.value === 'exchange' ? props.exchange : { request: props.request },
)
function pin() {
  if (!current.value) return
  if (
    new TextEncoder().encode(JSON.stringify(current.value)).byteLength >
    2 * 1024 * 1024
  ) {
    error.value = 'Exchange exceeds the 2 MiB baseline limit.'
    return
  }
  baseline.value = cloneExchange(current.value)
  error.value = ''
}
const comparisons = computed(() => {
  if (!baseline.value || !current.value) return []
  const before = exchangeSections(baseline.value),
    after = exchangeSections(current.value)
  if (
    baseline.value.response &&
    current.value.response &&
    !baseline.value.response.bodyUnavailable &&
    !current.value.response.bodyUnavailable &&
    !pathError.value
  ) {
    const projected = compareBodies(
      baseline.value.response.body,
      current.value.response.body,
      comparisonPaths(ignoreInput.value),
    )
    before['Response body'] = projected.before
    after['Response body'] = projected.after
  }
  return (Object.keys(before) as (keyof typeof before)[]).map(name => ({
    name,
    changed: before[name] !== after[name],
    diff: lineDiff(before[name], after[name]),
  }))
})
function saveComparison() {
  if (
    !baseline.value ||
    !current.value ||
    props.sending ||
    source.value !== 'exchange' ||
    pathError.value
  )
    return
  emit('save', {
    exchange: cloneExchange(current.value),
    title: 'Response comparison',
    notes: comparisons.value
      .map(s => `${s.name}: ${s.changed ? 'Changed' : 'Unchanged'}`)
      .join('\n'),
    comparison: {
      baseline: cloneExchange(baseline.value),
      ignorePaths: comparisonPaths(ignoreInput.value),
    },
  })
}
</script>
