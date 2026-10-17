<template>
  <VMenu :submenu="submenu">
    <template #activator="{ props }">
      <VListItem
        v-if="submenu"
        role="menuitem"
        v-bind="props"
        :title="$t('Payloads')"
        :append-icon="mdiChevronRight"
        @click.stop
      />
      <VBtn v-else v-bind="props" :append-icon="mdiMenuDown" variant="text">{{
        $t('Payloads')
      }}</VBtn>
    </template>
    <VList density="compact" :aria-label="$t('Payload categories')">
      <SqlInjectionMenu /><XssMenu /><LfiMenu /><SsrfMenu /><SstiMenu /><ShellMenu />
      <VDivider /><TestMenu />
    </VList>
  </VMenu>
</template>

<script setup lang="ts">
import { mdiChevronRight, mdiMenuDown } from '@mdi/js'
import LfiMenu from './LfiMenu.vue'
import ShellMenu from './ShellMenu.vue'
import SqlInjectionMenu from './SqlInjectionMenu.vue'
import SsrfMenu from './SsrfMenu.vue'
import SstiMenu from './SstiMenu.vue'
import TestMenu from './TestMenu.vue'
import XssMenu from './XssMenu.vue'
defineProps({ submenu: Boolean })
</script>
