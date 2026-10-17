<template>
  <div class="execution-bar" :class="{ sending: isSending }" role="status">
    <span
      :class="{
        'execution-error':
          executionStatus === 'Failed' ||
          executionStatus === 'HTTP error response' ||
          executionStatus === 'Timed out' ||
          executionStatus === 'Connection interrupted',
      }"
      >{{ $t(executionStatus)
      }}<template v-if="statusCode !== undefined">
        ·
        <span
          class="status-badge"
          :class="{
            'status-badge--success': statusCode < 400,
            'status-badge--error': statusCode >= 400,
          }"
          >HTTP {{ statusCode }}</span
        ></template
      ><template v-if="isSending"> · {{ elapsedMs }} ms</template
      ><template v-else-if="lastDurationMs !== null">
        · {{ lastDurationMs }} ms</template
      ></span
    >
    <button
      v-if="isSending"
      :disabled="executionStatus === 'Cancelling…'"
      class="text-action"
      @click="$emit('cancel')"
    >
      {{ $t('Cancel request') }}
    </button>
    <span v-if="copyNotice" class="copy-notice">{{ $t(copyNotice) }}</span>
    <span v-if="requestSource" class="request-source">{{
      $t(requestSource)
    }}</span>
    <button v-if="diagnostic" class="text-action" @click="$emit('diagnostics')">
      {{ $t('Copy diagnostics') }}
    </button>
    <label class="timeout-setting"
      >{{ $t('Timeout') }}
      <select
        :value="timeoutMs"
        class="native-select"
        :aria-label="$t('Request timeout')"
        @change="
          $emit('timeout', Number(($event.target as HTMLSelectElement).value))
        "
      >
        <option
          v-if="
            timeoutMs &&
            ![5000, 10000, 30000, 60000, 120000].includes(timeoutMs)
          "
          :value="timeoutMs"
        >
          {{ timeoutMs / 1000 }} s
        </option>
        <option :value="5000">5 s</option>
        <option :value="10000">10 s</option>
        <option :value="30000">30 s</option>
        <option :value="60000">60 s</option>
        <option :value="120000">120 s</option>
      </select></label
    >
  </div>
</template>

<script setup lang="ts">
defineProps<{
  executionStatus: string
  isSending: boolean
  elapsedMs: number
  lastDurationMs: number | null
  copyNotice: string
  requestSource: string
  diagnostic: string
  statusCode?: number
  timeoutMs?: number
}>()
defineEmits<{ cancel: []; diagnostics: []; timeout: [value: number] }>()
</script>

<style lang="scss" scoped>
.status-badge {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 600;
  font:
    11px Menlo,
    monospace;
}
.status-badge--success {
  background: rgba(24, 128, 56, 0.1);
  color: #188038;
}
.status-badge--error {
  background: rgba(196, 54, 78, 0.1);
  color: #c4364e;
}
:deep(.v-theme--dark) .status-badge--success,
.v-theme--dark .status-badge--success {
  background: rgba(129, 201, 149, 0.12);
  color: #81c995;
}
:deep(.v-theme--dark) .status-badge--error,
.v-theme--dark .status-badge--error {
  background: rgba(255, 133, 151, 0.12);
  color: #ff8597;
}
@media (forced-colors: active) {
  .status-badge {
    border: 1px solid currentColor;
  }
}
</style>
