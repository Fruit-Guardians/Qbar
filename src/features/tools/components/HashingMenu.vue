<template>
  <VMenu :submenu="submenu">
    <template #activator="{ props }">
      <VListItem
        v-if="submenu"
        role="menuitem"
        v-bind="props"
        :title="$t('Hashing')"
        :append-icon="mdiChevronRight"
        @click.stop
      />
      <VBtn v-else :append-icon="mdiMenuDown" variant="text" v-bind="props">
        {{ $t('Hashing') }}
      </VBtn>
    </template>
    <VList>
      <VListItem title="MD5" @click="applyFunction('Hash.MD5.digest')" />
      <VListItem title="SHA1" @click="applyFunction('Hash.SHA1.digest')" />
      <VListItem title="SHA256" @click="applyFunction('Hash.SHA256.digest')" />
      <VListItem title="SHA384" @click="applyFunction('Hash.SHA384.digest')" />
      <VListItem title="SHA512" @click="applyFunction('Hash.SHA512.digest')" />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight, mdiMenuDown } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey } from '@/app/context'

export default defineComponent({
  name: 'HashingMenu',
  props: { submenu: Boolean },
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!

    return {
      mdiChevronRight,
      mdiMenuDown,

      applyFunction,
    }
  },
})
</script>
