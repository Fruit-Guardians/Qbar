<template>
  <div class="repeater-tabs-shell">
    <div
      class="repeater-tabs"
      role="tablist"
      :aria-label="$t('Repeater requests')"
      :title="
        $t(
          'Tabs stay in this panel only. Save important results as evidence before closing DevTools.',
        )
      "
    >
      <div
        v-for="tab in controller.tabs.value"
        :key="tab.id"
        class="repeater-tab"
        :class="{ selected: controller.active.value === tab.id }"
      >
        <button
          :id="`repeater-tab-${tab.id}`"
          role="tab"
          :aria-selected="controller.active.value === tab.id"
          :tabindex="controller.active.value === tab.id ? 0 : -1"
          :disabled="busy"
          @click="select(tab.id)"
          @keydown="navigate($event, tab.id)"
        >
          {{ $t('Request') }} {{ tab.id
          }}<span
            v-if="controller.isDirty(tab.id)"
            :aria-label="$t('Modified draft')"
          >
            ●</span
          >
        </button>
        <button
          class="tab-close"
          :aria-label="$t('Close request {id}', { id: tab.id })"
          :disabled="busy"
          @click="controller.close(tab.id)"
        >
          ×
        </button>
      </div>
      <button
        class="text-action"
        :disabled="busy"
        :aria-label="$t('New request tab')"
        @click="controller.add()"
      >
        ＋
      </button>
      <button
        class="text-action"
        :disabled="busy"
        @click="controller.add(true)"
      >
        {{ $t('Duplicate') }}
      </button>
    </div>
    <div
      v-if="controller.pendingClose.value"
      class="workspace-notice"
      role="alert"
    >
      <span>{{
        $t(
          'Closing discards this tab’s edits and results. Saved evidence is kept. Continue?',
        )
      }}</span>
      <button
        class="text-action"
        @click="controller.close(controller.pendingClose.value, true)"
      >
        {{ $t('Discard tab') }}
      </button>
      <button class="text-action" @click="controller.cancelClose()">
        {{ $t('Keep tab') }}
      </button>
    </div>
    <p v-if="controller.notice.value" class="workspace-notice" role="status">
      {{ $t(controller.notice.value) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import type { createRepeaterTabs } from '../model/repeater-tabs'
const props = defineProps<{
  controller: ReturnType<typeof createRepeaterTabs>
  busy: boolean
}>()
function select(id: string) {
  props.controller.activate(id)
  void nextTick(() =>
    document
      .getElementById(`repeater-tab-${props.controller.active.value}`)
      ?.focus(),
  )
}
function navigate(event: KeyboardEvent, id: string) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const tabs = props.controller.tabs.value,
    index = tabs.findIndex(t => t.id === id)
  select(
    tabs[
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length
    ].id,
  )
}
</script>
