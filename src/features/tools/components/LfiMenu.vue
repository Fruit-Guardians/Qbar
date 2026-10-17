<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        title="LFI"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VListItem
        :title="$t('PHP wrapper - Base64')"
        @click="applyFunction('Payload.LFI.phpWrapperBase64', true)"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'LfiMenu',
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!

    return {
      mdiChevronRight,
      applyFunction,
    }
  },
})
</script>
