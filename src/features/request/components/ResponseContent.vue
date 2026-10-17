<template>
  <div class="response-presentation">
    <div
      class="response-section-bar"
      role="group"
      :aria-label="$t('Response sections')"
    >
      <button
        v-for="section in ['Body', 'Headers', 'HTTP']"
        :key="section"
        class="text-action"
        :aria-pressed="sectionMode === section"
        @click="sectionMode = section"
      >
        {{ $t(section === 'Headers' ? 'Response headers' : section)
        }}<span v-if="section === 'Headers'" class="header-count">{{
          response.headers.length
        }}</span>
      </button>
    </div>
    <div
      v-if="sectionMode === 'Headers'"
      class="response-headers"
      :aria-label="$t('Response headers')"
    >
      <table>
        <thead>
          <tr>
            <th>{{ $t('Name') }}</th>
            <th>{{ $t('Value') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(header, index) in response.headers" :key="index">
            <td>{{ header.name }}</td>
            <td>{{ header.value }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!response.headers.length" class="response-view-note">
        {{ $t('No response headers were captured.') }}
      </p>
    </div>
    <template v-else>
      <div
        v-if="sectionMode === 'Body'"
        class="response-view-bar"
        role="group"
        :aria-label="$t('Response display mode')"
      >
        <button
          v-for="view in views"
          :key="view"
          class="text-action"
          :aria-pressed="effectiveView === view"
          :disabled="
            bodyState !== 'available' || (view !== 'Raw' && !presentation.node)
          "
          @click="mode = view"
        >
          {{ $t(view) }}
        </button>
        <span class="response-view-spacer" />
        <button
          class="text-action"
          :title="$t('Copy the original response body, without formatting')"
          :disabled="bodyState !== 'available'"
          @click="copyBody"
        >
          {{ $t('Copy body') }}
        </button>
        <button
          v-if="effectiveView === 'Tree'"
          class="text-action response-render-button"
          :aria-label="$t('Render response')"
          :title="$t('Render response')"
          @click="$emit('render')"
        >
          <VIcon :icon="mdiMonitorEye" size="16" />
        </button>
      </div>
      <p
        v-if="sectionMode === 'Body' && presentation.notice"
        class="response-view-note"
        role="status"
      >
        {{ $t(presentation.notice) }}
      </p>
      <div
        v-if="sectionMode === 'Body' && bodyState !== 'available'"
        class="response-body-state"
        role="status"
      >
        {{
          $t(
            bodyState === 'unavailable'
              ? 'Response body was not captured. Headers and HTTP metadata are available.'
              : 'This response has an empty body.',
          )
        }}
      </div>
      <div
        v-else-if="
          sectionMode === 'Body' &&
          effectiveView === 'Tree' &&
          presentation.node
        "
        class="response-json-tree"
        :aria-label="$t('JSON response tree')"
      >
        <p class="response-view-note">
          {{ $t('JSON body · response headers are available in Headers.') }}
        </p>
        <JsonTree
          :key="revision"
          :node="presentation.node"
          label="$"
          path="$"
          :depth="0"
          @copy="copy"
        />
      </div>
      <ResponseViewer
        v-else
        variant="plain"
        :response="sectionMode === 'HTTP' ? response : displayResponse"
        :body-only="sectionMode === 'Body'"
        hide-details
        @render="$emit('render')"
      />
    </template>
    <p v-if="notice" class="response-view-note" role="status">
      {{ $t(notice) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { mdiMonitorEye } from '@mdi/js'
import { computed, ref, watch } from 'vue'
import { presentResponse } from '../model/response-presentation'
import { responseBodyState } from '../model/response-state'
import ResponseViewer from './ResponseViewer.vue'
import JsonTree from '@/features/workbench/components/JsonTree.vue'
const props = defineProps<{ response: BrowseResponse }>()
defineEmits<{ render: [] }>()
const views = ['Pretty', 'Tree', 'Raw'] as const
const sectionMode = ref('Body')
const bodyState = computed(() => responseBodyState(props.response))
const mode = ref<(typeof views)[number]>('Pretty')
const notice = ref(''),
  revision = ref(0)
const presentation = computed(() => presentResponse(props.response))
const effectiveView = computed(() =>
  presentation.value.node ? mode.value : 'Raw',
)
const displayResponse = computed(() =>
  effectiveView.value === 'Pretty'
    ? { ...props.response, body: presentation.value.prettyBody! }
    : props.response,
)
watch(
  () => props.response,
  () => {
    revision.value++
    notice.value = ''
  },
)
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    notice.value = 'Copied.'
  } catch {
    notice.value = 'Copy failed. Select and copy manually.'
  }
}
const copyBody = () => copy(props.response.body)
</script>

<style lang="scss" scoped>
.response-presentation {
  min-width: 0;
}
.response-section-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--native-border-subtle);
}
.response-section-bar button {
  border-bottom: 2px solid transparent;
  border-radius: 0;
}
.response-section-bar button[aria-pressed='true'] {
  border-bottom-color: var(--native-primary);
  color: var(--native-text);
  font-weight: 600;
}
.response-headers table {
  width: 100%;
  border-collapse: collapse;
  font:
    12px/1.6 Menlo,
    Consolas,
    monospace;
  table-layout: fixed;
}
.response-headers th {
  text-align: left;
  font:
    11px/1.6 system-ui,
    sans-serif;
  color: var(--native-muted);
  background: var(--native-canvas);
}
.response-headers td,
.response-headers th {
  padding: 6px 10px;
  border-bottom: 1px solid var(--native-border-subtle);
  overflow-wrap: anywhere;
  vertical-align: top;
}
.response-headers th:first-child {
  width: 35%;
}
.response-body-state {
  padding: 28px 12px;
  font-size: 12px;
  color: var(--native-muted);
  line-height: 1.6;
}
.response-view-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 0;
  border-bottom: 1px solid var(--native-border);
  background: rgb(var(--v-theme-surface));
  button {
    padding: 0 8px;
    height: 28px;
    border-bottom: 2px solid transparent;
    border-radius: 4px 4px 0 0;
  }
  button[aria-pressed='true'] {
    color: rgb(var(--v-theme-primary));
    background: var(--native-surface-raised);
    border-bottom-color: var(--native-primary);
    font-weight: 500;
  }
}
.response-view-bar .response-render-button {
  width: 28px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 6px;
}
.response-view-spacer {
  flex: 1;
}
.response-view-note {
  font:
    11px/1.5 system-ui,
    sans-serif;
  color: var(--native-muted);
  margin: 6px 0;
  overflow-wrap: anywhere;
}
.response-json-tree {
  font:
    12px/1.6 Menlo,
    Consolas,
    monospace;
  :deep(.wb-json-node) {
    padding-left: 10px;
  }
  :deep(.wb-json-leaf) {
    padding: 3px 0;
  }
  :deep(code) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  :deep(summary) {
    cursor: pointer;
    padding: 4px 0;
  }
  :deep(button) {
    font:
      10px system-ui,
      sans-serif;
    margin-left: 6px;
  }
  :deep(.wb-note) {
    font:
      11px/1.5 system-ui,
      sans-serif;
    color: var(--native-muted);
  }
}
</style>
