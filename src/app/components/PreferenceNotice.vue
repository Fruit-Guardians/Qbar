<template>
  <div
    v-if="message"
    class="preference-notice"
    role="status"
    aria-live="polite"
  >
    <span>{{ $t(message) }}</span
    ><button
      class="text-action"
      :aria-label="$t('Dismiss preference notice')"
      @click="$emit('close')"
    >
      {{ $t('Dismiss') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
const props = defineProps<{ message: string }>()
const emit = defineEmits<{ close: [] }>()
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.message,
  value => {
    clearTimeout(timer)
    if (value === 'Preference saved on this device.')
      timer = setTimeout(() => emit('close'), 3000)
  },
  { immediate: true },
)
onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
.preference-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--native-border);
  background: var(--native-toolbar);
  color: var(--native-text);
  font-size: 12px;
}
.preference-notice span {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
