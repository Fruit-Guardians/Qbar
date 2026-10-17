<template>
  <div class="workspace-split-shell">
    <div class="workspace-layout-bar">
      <span>{{ $t('Workspace layout') }}</span>
      <select
        v-model="preference.layout"
        class="native-select"
        :aria-label="$t('Workspace layout')"
        @change="save"
      >
        <option value="auto">{{ $t('Auto layout') }}</option>
        <option value="side">{{ $t('Side by side') }}</option>
        <option value="stacked">{{ $t('Stacked') }}</option>
      </select>
      <button class="text-action" @click="reset">
        {{ $t('Reset split') }}
      </button>
      <span
        v-if="width < 700 && preference.layout !== 'stacked'"
        class="split-auto-note"
        >{{ $t('Narrow panel · stacked automatically') }}</span
      >
      <span v-if="notice" role="status" class="split-save-notice">{{
        $t(notice)
      }}</span>
    </div>
    <div
      ref="container"
      class="workspace-split"
      :class="direction"
      :style="{ '--split-ratio': `${preference.ratio}%` }"
    >
      <div :id="`${pane}-request-area`" class="split-pane split-first">
        <slot name="request" />
      </div>
      <div
        class="workspace-separator"
        role="separator"
        tabindex="0"
        :aria-label="$t('Resize request and response')"
        :aria-controls="`${pane}-request-area`"
        :aria-orientation="direction === 'side' ? 'vertical' : 'horizontal'"
        :aria-valuenow="Math.round(preference.ratio)"
        :aria-valuemin="20"
        :aria-valuemax="80"
        :title="$t('Drag to resize. Arrow keys adjust; double-click resets.')"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="finish"
        @pointercancel="finish"
        @lostpointercapture="finish"
        @keydown="adjust"
        @dblclick="reset"
      >
        <span />
      </div>
      <div class="split-pane split-second"><slot name="response" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import browser from 'webextension-polyfill'
import {
  clampSplit,
  readWorkspacePreference,
  splitFromPointer,
  workspaceDirection,
} from '../model/workspace-layout'
const props = defineProps<{ pane: 'basic' | 'raw' }>()
const preference = ref(readWorkspacePreference(null))
const container = ref<HTMLElement>(),
  width = ref(0),
  notice = ref('')
const direction = computed(() =>
  workspaceDirection(preference.value.layout, width.value),
)
const key = `qbarWorkspaceLayout-${props.pane}`
let observer: ResizeObserver | undefined,
  alive = true,
  edited = false,
  dragging = false,
  pointer: number | undefined,
  writes = Promise.resolve(),
  revision = 0
onMounted(async () => {
  if (container.value) {
    width.value = container.value.clientWidth
    observer = new ResizeObserver(() => {
      width.value = container.value?.clientWidth || 0
    })
    observer.observe(container.value)
  }
  try {
    const saved = await browser.storage.local.get(key)
    if (alive && !edited) preference.value = readWorkspacePreference(saved[key])
  } catch {
    if (alive) notice.value = 'Layout applies to this panel only.'
  }
})
onUnmounted(() => {
  alive = false
  observer?.disconnect()
})
function save() {
  edited = true
  const id = ++revision,
    value = { ...preference.value }
  writes = writes
    .catch(() => {})
    .then(() => browser.storage.local.set({ [key]: value }))
  void writes.then(
    () => {
      if (alive && id === revision) notice.value = ''
    },
    () => {
      if (alive && id === revision)
        notice.value = 'Layout applies to this panel only.'
    },
  )
}
function start(event: PointerEvent) {
  if (event.button !== 0) return
  edited = true
  dragging = true
  pointer = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (!dragging || event.pointerId !== pointer || !container.value) return
  const rect = container.value.getBoundingClientRect(),
    side = direction.value === 'side'
  preference.value.ratio = splitFromPointer(
    side ? event.clientX : event.clientY,
    side ? rect.left : rect.top,
    side ? rect.width : rect.height,
  )
}
function finish(event: PointerEvent) {
  if (!dragging || event.pointerId !== pointer) return
  dragging = false
  pointer = undefined
  save()
}
function reset() {
  preference.value.ratio = 50
  save()
}
function adjust(event: KeyboardEvent) {
  const minus = direction.value === 'side' ? 'ArrowLeft' : 'ArrowUp',
    plus = direction.value === 'side' ? 'ArrowRight' : 'ArrowDown'
  if (![minus, plus, 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  preference.value.ratio =
    event.key === 'Home'
      ? 20
      : event.key === 'End'
        ? 80
        : clampSplit(
            preference.value.ratio +
              (event.key === plus ? 1 : -1) * (event.shiftKey ? 10 : 2),
          )
  save()
}
</script>

<style lang="scss">
.qbar-app {
  .workspace-split-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .workspace-layout-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 12px;
    min-height: 30px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--native-border-subtle);
    color: var(--native-muted);
    font-size: 11px;
  }
  .workspace-layout-bar .native-select {
    height: 23px;
    font-size: 11px;
    border-color: var(--native-border-subtle);
  }
  .split-save-notice {
    margin-left: auto;
  }
  .workspace-split {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .workspace-split.stacked {
    flex-direction: column;
  }
  .split-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .workspace-split > .split-first {
    flex: 0 0 calc(var(--split-ratio) - 3px);
  }
  .workspace-split > .split-second {
    flex: 1;
  }
  .split-pane > section,
  .split-pane > .basic-config {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    border: 0;
  }
  .split-pane .basic-config {
    overflow: auto;
  }
  .workspace-separator {
    display: flex;
    flex: 0 0 6px;
    align-items: center;
    justify-content: center;
    background: var(--native-canvas);
    touch-action: none;
    user-select: none;
    cursor: col-resize;
  }
  .workspace-separator span {
    width: 2px;
    height: 24px;
    border-radius: 2px;
    background: var(--native-border);
  }
  .stacked > .workspace-separator {
    cursor: row-resize;
  }
  .stacked > .workspace-separator span {
    width: 24px;
    height: 2px;
  }
  .workspace-separator:hover,
  .workspace-separator:focus-visible {
    background: var(--native-selection);
    outline: none;
  }
  .workspace-separator:focus-visible span {
    background: var(--native-primary);
  }
  .basic-panel:has(.workspace-split-shell) {
    overflow: hidden;
  }
}
</style>
