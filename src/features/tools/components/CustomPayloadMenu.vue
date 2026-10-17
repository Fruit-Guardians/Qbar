<template>
  <VMenu :submenu="submenu">
    <template #activator="{ props }">
      <VListItem
        v-if="submenu"
        role="menuitem"
        v-bind="props"
        :title="$t('Custom')"
        :append-icon="mdiChevronRight"
        @click.stop
      />
      <VBtn v-else :append-icon="mdiMenuDown" variant="text" v-bind="props">
        {{ $t('Custom') }}
      </VBtn>
    </template>
    <VList>
      <VListItem :title="$t('Manage')" @click="openCustomPayloadManagement" />
      <VDivider v-if="hasCustomPayload" />
      <VMenu
        v-for="([category, items], categoryIndex) in categorizedItems"
        :key="`category-${categoryIndex}-${category}`"
        location="end"
        open-on-hover
      >
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            :title="category"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            v-for="(payload, payloadIndex) in items"
            :key="`categorized-payload-${payloadIndex}-${payload.name}`"
            :title="payload.name"
            @click="applyFunction('Payload.Custom.insert', true, payload.value)"
          />
        </VList>
      </VMenu>
      <VListItem
        v-for="(payload, payloadIndex) in topLevelItems"
        :key="`top-level-payload-${payloadIndex}-${payload.name}`"
        :title="payload.name"
        @click="applyFunction('Payload.Custom.insert', true, payload.value)"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight, mdiMenuDown } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey, OpenCustomPayloadManagementKey } from '@/app/context'
import { useCustomPayloadStore } from '@/features/tools/stores/index'

export default defineComponent({
  name: 'CustomPayloadMenu',
  props: { submenu: Boolean },
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!
    const openCustomPayloadManagement = inject(OpenCustomPayloadManagementKey)!

    const { hasCustomPayload, topLevelItems, categorizedItems } = storeToRefs(
      useCustomPayloadStore(),
    )

    return {
      mdiChevronRight,
      mdiMenuDown,

      hasCustomPayload,
      topLevelItems,
      categorizedItems,

      applyFunction,
      openCustomPayloadManagement,
    }
  },
})
</script>
