<template>
  <VMenu>
    <template #activator="{ props }">
      <VBtn
        v-bind="props"
        variant="text"
        :icon="mdiDotsVertical"
        :aria-label="$t('Utilities')"
        :title="$t('Encoding, hashing, payloads and custom snippets')"
      />
    </template>
    <VList role="menu" density="compact" :aria-label="$t('Request utilities')">
      <EncodingMenu submenu />
      <HashingMenu submenu />
      <VDivider />
      <PayloadsMenu submenu />
      <CustomPayloadMenu submenu />
    </VList>
  </VMenu>
</template>

<script setup lang="ts">
import { mdiDotsVertical } from '@mdi/js'
import CustomPayloadMenu from './CustomPayloadMenu.vue'
import EncodingMenu from './EncodingMenu.vue'
import HashingMenu from './HashingMenu.vue'
import PayloadsMenu from './PayloadsMenu.vue'
</script>
