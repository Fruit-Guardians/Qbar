<template>
  <div
    v-if="notice || state !== 'connected'"
    class="workspace-notice"
    role="status"
    aria-live="polite"
  >
    <span>{{
      state !== 'connected'
        ? $t('Background {state}. Your edits are preserved.{hint}', {
            state: $t(state),
            hint:
              state === 'offline'
                ? ' ' +
                  $t(
                    'If reconnect fails after an extension update, reopen DevTools.',
                  )
                : '',
          })
        : $t(notice)
    }}</span>
    <button
      v-if="state === 'offline'"
      class="text-action"
      @click="$emit('reconnect')"
    >
      {{ $t('Reconnect') }}
    </button>
    <button
      v-if="
        state === 'connected' &&
        ['no-record', 'partial'].includes(reason ?? '') &&
        !loading
      "
      class="text-action"
      :disabled="sending"
      :title="$t('Reloads the inspected page; unsaved page data may be lost')"
      @click="$emit('reload')"
    >
      {{ $t('Reload page & Load') }}
    </button>
    <button
      v-if="reason === 'permission'"
      class="text-action"
      @click="$emit('permissions')"
    >
      {{ $t('Open permissions') }}
    </button>
    <button
      v-if="!loading && state === 'connected'"
      class="text-action"
      :aria-label="$t('Dismiss load notice')"
      @click="$emit('dismiss')"
    >
      {{ $t('Dismiss') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ConnectionState } from '../composables/panel-connection'
defineProps<{
  state: ConnectionState
  notice: string
  reason?: DevtoolsLoadMessage['reason']
  loading: boolean
  sending: boolean
}>()
defineEmits(['reconnect', 'reload', 'permissions', 'dismiss'])
</script>
