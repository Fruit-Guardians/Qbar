<template>
  <aside
    v-if="controller.opened.value"
    id="evidence-shelf"
    class="evidence-shelf"
    :aria-label="$t('Evidence library')"
    @keydown.esc="close"
  >
    <header class="wb-heading">
      <strong
        >{{ $t('Evidence') }} ·
        {{ controller.snapshot.value?.entries.length ?? 0 }} / 50</strong
      ><button
        class="text-action"
        :aria-label="$t('Close evidence')"
        @click="close"
      >
        ×
      </button>
    </header>
    <div class="evidence-content">
      <p class="wb-note">
        {{
          $t(
            'Saved locally only when you click Save. Includes full request, response and notes; may contain credentials. Tabs are temporary.',
          )
        }}
      </p>
      <p v-if="controller.error.value" class="wb-error" role="alert">
        {{ $t(controller.error.value) }}
      </p>
      <p v-if="controller.notice.value" role="status">
        {{ $t(controller.notice.value) }}
      </p>
      <div class="wb-actions">
        <button
          class="text-action"
          :disabled="controller.busy.value"
          @click="controller.action({ action: 'list' })"
        >
          {{ $t('Refresh list') }}</button
        ><button class="text-action" @click="choose()">
          {{ $t('Current result') }}
        </button>
      </div>
      <label
        >{{ $t('Filter evidence')
        }}<input
          v-model="query"
          class="wb-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
      /></label>
      <div class="evidence-list">
        <button
          v-for="item in filtered"
          :key="item.id"
          class="evidence-item"
          :aria-pressed="selected === item.id"
          @click="choose(item)"
        >
          <strong>{{ item.title || item.exchange.request.method }}</strong
          ><span
            >{{
              item.exchange.response?.statusCode ??
              $t(item.exchange.outcome ?? 'Completed')
            }}
            · {{ new Date(item.createdAt).toLocaleString() }}</span
          >
        </button>
      </div>
      <p v-if="!filtered.length" class="wb-note">
        {{ $t('No saved evidence matches.') }}
      </p>
      <label
        >{{ $t('Title')
        }}<input
          v-model="title"
          maxlength="120"
          class="wb-input"
          autocomplete="off"
      /></label>
      <label
        >{{ $t('Notes')
        }}<textarea
          v-model="notes"
          maxlength="10000"
          rows="3"
          class="wb-textarea"
        />
      </label>
      <label
        >{{ $t('Tags (comma-separated)')
        }}<input v-model="tags" class="wb-input" maxlength="500"
      /></label>
      <label
        >{{ $t('Reproduction steps')
        }}<textarea
          v-model="reproduction"
          class="wb-textarea"
          rows="4"
          maxlength="10000"
        />
      </label>
      <p v-if="entry?.comparison" class="wb-note">
        {{ $t('Includes pinned baseline and ignored JSON paths.') }}
      </p>
      <div class="wb-actions">
        <button
          v-if="!entry"
          class="text-action"
          :disabled="!attempt || controller.busy.value || sending"
          @click="save"
        >
          {{ $t('Save current result') }}
        </button>
        <template v-else
          ><button
            class="text-action"
            :disabled="controller.busy.value"
            @click="
              controller.action({
                action: 'update',
                id: entry.id,
                expectedRevision: editedRevision,
                title,
                notes,
                tags: tagList(),
                reproduction,
              })
            "
          >
            {{ $t('Save notes') }}</button
          ><button
            class="text-action"
            :disabled="sending"
            @click="$emit('restore', entry.exchange)"
          >
            {{ $t('Open in new request tab') }}</button
          ><button
            class="text-action"
            :disabled="controller.busy.value"
            @click="deleting = true"
          >
            {{ $t('Remove') }}
          </button></template
        >
      </div>
      <div v-if="deleting && entry" class="workspace-notice" role="alert">
        <span>{{
          $t('Remove this saved evidence? Export it first if needed.')
        }}</span
        ><button
          class="text-action"
          :disabled="controller.busy.value"
          @click="removeEntry"
        >
          {{ $t('Confirm removal') }}</button
        ><button class="text-action" @click="deleting = false">
          {{ $t('Keep') }}
        </button>
      </div>
      <template v-if="shown">
        <p class="wb-note">
          {{ $t(shown.outcome ?? 'Completed') }} ·
          {{ shown.durationMs ?? '—' }} ms ·
          {{ shown.response?.statusCode ?? '—' }}
        </p>
        <p v-if="shown.error" class="wb-error">{{ shown.error }}</p>
        <details>
          <summary>{{ $t('Saved request') }}</summary>
          <pre class="evidence-raw">{{ requestText }}</pre>
        </details>
        <details v-if="shown.response">
          <summary>{{ $t('Saved response') }}</summary>
          <pre class="evidence-raw">{{ responseText }}</pre>
        </details>
        <p v-if="shown?.response?.bodyUnavailable" class="wb-note">
          {{
            $t('Response body unavailable; only HTTP metadata was captured.')
          }}
        </p>
        <p v-else-if="shown && !shown.response" class="wb-note">
          {{ $t('No response body was available for this result.') }}
        </p>
      </template>
      <template v-if="entry">
        <label class="native-checkbox"
          ><input v-model="redacted" type="checkbox" />{{
            $t('Redacted export (recommended)')
          }}</label
        >
        <p class="wb-note">
          {{
            $t(
              redacted
                ? 'Redacted export omits bodies, notes, titles and all header/query values. URL paths remain: review the preview before sharing.'
                : 'Full export includes credentials and response contents. Review before sharing.',
            )
          }}
        </p>
        <details>
          <summary>{{ $t('Export preview') }}</summary>
          <textarea
            class="wb-textarea evidence-export"
            readonly
            :value="exportText"
            :aria-label="$t('Evidence export preview')"
          />
        </details>
        <button class="text-action" @click="download(false)">
          {{ $t('Download JSON') }}</button
        ><button class="text-action" @click="download(true)">
          {{ $t('Download report') }}
        </button>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useEvidence } from '../composables/use-evidence'
import {
  type Evidence,
  evidenceReport,
  exportEvidence,
} from '../model/evidence-store'
import type { Exchange } from '@/features/workbench/model/exchange-diff'
const props = defineProps<{
  controller: ReturnType<typeof useEvidence>
  attempt?: Exchange
  sending: boolean
}>()
defineEmits<{ restore: [exchange: Exchange] }>()
const selected = ref(''),
  title = ref(''),
  notes = ref(''),
  tags = ref(''),
  reproduction = ref(''),
  query = ref(''),
  redacted = ref(true),
  deleting = ref(false),
  editedRevision = ref(0)
const entry = computed(() =>
  props.controller.snapshot.value?.entries.find(e => e.id === selected.value),
)
const filtered = computed(() =>
  (props.controller.snapshot.value?.entries ?? []).filter(e =>
    `${e.title} ${e.notes} ${(e.tags || []).join(' ')} ${e.exchange.request.url}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
)
const shown = computed(() => entry.value?.exchange ?? props.attempt)
const requestText = computed(() =>
  shown.value
    ? `${shown.value.request.method} ${shown.value.request.url}\n${shown.value.request.headers.map(h => `${h.enabled ? '' : '# '}${h.name}: ${h.value}`).join('\n')}\n\n${shown.value.request.body.content}`
    : '',
)
const responseText = computed(() => {
  const r = shown.value?.response
  return r
    ? `${r.protocolVersion} ${r.statusCode} ${r.statusMessage}\n${r.headers.map(h => `${h.name}: ${h.value}`).join('\n')}\n\n${r.body}`
    : ''
})
const exportText = computed(() =>
  entry.value ? exportEvidence(entry.value, redacted.value) : '',
)
function choose(value?: Evidence) {
  editedRevision.value = props.controller.snapshot.value?.revision ?? 0
  selected.value = value?.id ?? ''
  title.value = value?.title ?? ''
  notes.value = value?.notes ?? ''
  tags.value = value?.tags?.join(', ') || ''
  reproduction.value = value?.reproduction || ''
  redacted.value = true
  deleting.value = false
}
watch(
  () => props.controller.snapshot.value,
  () => {
    if (selected.value && !entry.value) choose()
  },
)
watch(
  () => props.controller.completed.value,
  result => {
    if (
      result?.action.action === 'update' &&
      result.action.id === selected.value
    )
      editedRevision.value = result.revision
  },
)
function save() {
  if (props.attempt)
    props.controller.action({
      action: 'save',
      exchange: props.attempt,
      title:
        title.value ||
        `${props.attempt.request.method} ${new URL(props.attempt.request.url).pathname}`.slice(
          0,
          120,
        ),
      notes: notes.value,
      tags: tagList(),
      reproduction: reproduction.value,
    })
}
function removeEntry() {
  if (!entry.value) return
  props.controller.action({
    action: 'remove',
    id: entry.value.id,
    expectedRevision: editedRevision.value,
  })
  deleting.value = false
}
function close() {
  props.controller.close()
  document.getElementById('evidence-toggle')?.focus()
}
function tagList() {
  return [
    ...new Set(
      tags.value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    ),
  ]
}
function download(markdown = false) {
  if (!entry.value) return
  const url = URL.createObjectURL(
    new Blob(
      [
        markdown
          ? evidenceReport(entry.value, redacted.value)
          : exportText.value,
      ],
      { type: markdown ? 'text/markdown' : 'application/json' },
    ),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `qbar-evidence-${entry.value.id}${redacted.value ? '-redacted' : ''}.${markdown ? 'md' : 'json'}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<style scoped lang="scss">
.evidence-shelf {
  flex: 0 0 min(440px, 100%);
  min-width: 0;
  border-left: 1px solid var(--native-border);
  background: var(--native-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.evidence-shelf .wb-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 6px 10px;
  background: var(--native-toolbar);
  border-bottom: 1px solid var(--native-border);
}
.evidence-shelf .wb-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.evidence-shelf .wb-input,
.evidence-shelf .wb-textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  padding: 5px 7px;
  border: 1px solid var(--native-border);
  border-radius: 4px;
  background: var(--native-surface);
  color: var(--native-text);
  font: inherit;
}
.evidence-shelf .wb-textarea {
  resize: vertical;
  min-height: 76px;
}
.evidence-shelf .wb-note {
  color: var(--native-muted);
  font-size: 11px;
  line-height: 1.5;
}
.evidence-shelf .wb-error {
  color: rgb(var(--v-theme-error));
  overflow-wrap: anywhere;
}
.evidence-content > * {
  flex-shrink: 0;
}
.evidence-content summary {
  cursor: pointer;
}
.evidence-content :is(input, textarea, summary):focus-visible {
  outline: 2px solid var(--native-primary);
  outline-offset: 1px;
}
.evidence-content {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.evidence-content label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.evidence-content .native-checkbox {
  flex-direction: row;
}
.evidence-list {
  max-height: 180px;
  overflow: auto;
}
.evidence-item {
  width: 100%;
  padding: 6px;
  text-align: left;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--native-border);
  overflow-wrap: anywhere;
}
.evidence-item[aria-pressed='true'] {
  background: var(--native-selection);
  color: var(--native-on-selection);
}
.evidence-item span {
  font-size: 11px;
}
.evidence-raw {
  font:
    12px/18px Menlo,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 300px;
  overflow: auto;
}
.evidence-export {
  min-height: 200px;
}
@media (max-width: 760px) {
  .evidence-shelf {
    flex: 1 1 auto;
    border-left: 0;
    border-top: 1px solid var(--native-border);
    min-height: 260px;
    max-height: 60vh;
  }
}
</style>
