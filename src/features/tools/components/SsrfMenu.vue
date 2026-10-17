<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        title="SSRF"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VListItem
        :title="$t('AWS - IAM role name')"
        @click="applyFunction('Payload.SSRF.awsRoleName', true)"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'SsrfMenu',
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!

    return {
      mdiChevronRight,
      applyFunction,
    }
  },
})
</script>
