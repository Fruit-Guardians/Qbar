<template>
  <button
    class="request-send"
    :disabled="disabled || sending || !url.trim()"
    :title="$t('Send request · Alt+X')"
    @click="$emit('send')"
  >
    <span>{{ $t(sending ? 'Sending…' : 'Send') }}</span
    ><span aria-hidden="true">↗</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ disabled: boolean; sending: boolean; url: string }>()
defineEmits<{ send: [] }>()
</script>
